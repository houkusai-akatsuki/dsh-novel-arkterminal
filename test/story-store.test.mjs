import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { StoryStore } from '../lib/story.js'
import { AiRunner, sanitizeStyle, validateContinuation, sanitizeChapterWords } from '../lib/ai.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const seedDir = path.resolve(here, '..', '..', '..', 'asi-1939', 'terminal')

async function makeTempStory() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'nt-store-'))
  const story = {
    schema: 1,
    id: 'asi-1939',
    title: '测试故事',
    start: 'a',
    nodes: {
      a: {
        title: '节点 A',
        blocks: [{ type: 'narration', text: '开场' }],
        choices: [{ id: 'x', label: '继续', next: null }],
      },
    },
  }
  const worldbook = [
    {
      id: 'wb-player',
      type: 'person',
      title: '玩家角色 · 爱丽丝',
      summary: '玩家操控爱丽丝。',
      body: '玩家操控爱丽丝：选项与自由输入代表爱丽丝的言行，毛泽东由 AI 扮演。',
    },
    { id: 'wb-1', type: 'other', title: '测试条目', summary: '测试条目', body: '测试内容' },
  ]
  await fsp.writeFile(path.join(dir, 'story.json'), JSON.stringify(story, null, 2), 'utf8')
  await fsp.writeFile(path.join(dir, 'worldbook.json'), JSON.stringify(worldbook, null, 2), 'utf8')
  await fsp.writeFile(path.join(dir, 'plans.json'), '[]', 'utf8')
  await fsp.writeFile(path.join(dir, 'memory.md'), '', 'utf8')
  return dir
}

test('StoryStore bootstrap / save conflict / backup revert / inbox', async () => {
  const dir = await makeTempStory()
  const store = new StoryStore({ root: dir, kind: 'workspace', bundledRoot: dir })
  const boot = await store.bootstrap()
  assert.equal(boot.meta.storyId, 'asi-1939')
  assert.ok(boot.meta.storyHash)
  assert.ok(boot.story.nodes[boot.story.start])

  const version = await store.contentVersion()
  const { story } = await store.loadRawStory()
  const nextStory = JSON.parse(JSON.stringify(story))
  nextStory.nodes[story.start].title = '修改后的标题'
  const saved = await store.saveContent(nextStory, boot.worldbook, version)
  assert.ok(saved.version && saved.version !== version)
  const updated = await store.loadRawStory()
  assert.equal(updated.story.nodes[story.start].title, '修改后的标题')

  await assert.rejects(
    store.saveContent(story, boot.worldbook, version),
    (error) => error.code === 'conflict_version',
  )

  const restored = await store.revertBackup()
  assert.ok(restored.version)
  const reverted = await store.loadRawStory()
  assert.equal(reverted.story.nodes[story.start].title, '节点 A')

  const inbox = await store.appendInbox({ v: 1, type: 'choice', nodeId: 'a' })
  assert.equal(inbox.appended, true)
  const events = await store.readInbox(10)
  assert.equal(events.length, 1)

  await store.appendContinuation({ v: 1, id: 'c-test', parentId: 'a', payload: { blocks: [], choices: [] } })
  assert.equal((await store.loadGeneratedRecords()).length, 1)
  const cleared = await store.clearGenerated()
  assert.equal(cleared.cleared, true)
  assert.equal((await store.loadGeneratedRecords()).length, 0)

  const backupPath = await store.writeRuntimeBackup({ plans: [], memory: 'snapshot' })
  assert.ok(backupPath)
  assert.equal(JSON.parse(await fsp.readFile(backupPath, 'utf8')).memory, 'snapshot')

  await store.appendMemory('## test\n- hello')
  assert.ok((await store.loadMemory()).includes('hello'))

  const styles = [
    { id: 'cold', kind: 'style', name: '冷硬', prompt: '用短句，重动作。' },
    { id: 'cot1', kind: 'cot', name: '隐藏链', prompt: '单行箭头链。' },
    { id: 'mem1', kind: 'memory', name: '工作记忆', prompt: '工作记忆最多 4 条。' },
  ]
  await store.saveStyles(styles)
  assert.deepEqual(await store.loadStyles(), styles)
  await assert.rejects(store.saveStyles([{ id: 'bad id', name: '', prompt: '' }]))

  await fsp.rm(dir, { recursive: true, force: true })
})

function fakeStore(overrides) {
  const base = {
    records: [],
    memory: '',
    plans: [{ id: 'p1', label: 'plan', kind: 'plan', status: 'open' }],
    async loadRawStory() {
      return {
        story: {
          schema: 1,
          id: 'demo',
          title: 'Demo',
          start: 'a',
          nodes: { a: { blocks: [{ type: 'narration', text: '开场' }], choices: [] } },
        },
      }
    },
    async loadWorldbook() { return [] },
    async loadMemory() { return this.memory },
    async loadPlans() { return this.plans },
    async loadGeneratedRecords() { return this.records },
    async appendContinuation(record) { this.records.push(record); return record },
    async appendMemory(text) { this.memory += '\n' + text },
    async updatePlans(plans) { this.plans = plans },
    async bootstrap() { return { meta: { storyId: 'demo' } } },
    ...overrides,
  }
  return base
}

test('AiRunner continues a story with a fake llm stream', async () => {
  const store = fakeStore()
  const llm = {
    listProviders: () => [{ id: 'fake', name: 'Fake' }],
    listModels: async () => [{ id: 'fake-model', name: 'Fake Model' }],
    stream: () => (async function* () {
      yield { type: 'text-delta', text: '{"title":"续写","blocks":[{"type":"narration","text":"新的正文"}],"choices":[{"id":"a","label":"A"},{"id":"b","label":"B"}],"memoryAppend":"一段记忆"}' }
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 20 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })(),
  }
  const ctx = {
    get(name) {
      if (name === 'llm') return llm
      if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'fake', model: 'fake-model' }) }
      return undefined
    },
  }
  const runner = new AiRunner(ctx, { getStore: async () => store })
  const config = await runner.resolveConfig({})
  assert.equal(config.available, true)
  const { jobId } = await runner.continueStory({ parentId: 'a', action: { type: 'choice', choiceLabel: 'A' } })
  assert.ok(jobId)
  let job = null
  for (let i = 0; i < 100; i += 1) {
    job = runner.getJob(jobId)
    if (job && job.status !== 'running') break
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.equal(job.status, 'done')
  assert.equal(job.nodeId.startsWith('gen:'), true)
  assert.equal(store.records.length, 1)
  assert.equal(store.records[0].payload.blocks[0].text, '新的正文')
  assert.ok(store.memory.includes('一段记忆'))
})

function validStream() {
  return (async function* () {
    yield {
      type: 'text-delta',
      text: '{"title":"t","blocks":[{"type":"narration","text":"完整"}],"choices":[{"id":"a","label":"A"},{"id":"b","label":"B"}]}',
    }
    yield { type: 'finish', reason: { kind: 'stop' } }
  })()
}

function aiCtx(llm) {
  return {
    get(name) {
      if (name === 'llm') return llm
      if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'fake', model: 'fake-model' }) }
      return undefined
    },
  }
}

test('AiRunner forwards sampling parameters to llm.stream', async () => {
  const store = fakeStore()
  let captured = null
  const llm = {
    listProviders: () => [{ id: 'fake', name: 'Fake' }],
    listModels: async () => [{ id: 'fake-model', name: 'Fake Model' }],
    stream(options) {
      captured = options
      return validStream()
    },
  }
  const runner = new AiRunner(aiCtx(llm), { getStore: async () => store, transportRetryDelays: [5] })
  const { jobId } = await runner.continueStory({
    parentId: 'a',
    action: { type: 'enter' },
    prefs: { temperature: 0.5, topP: 0.9, presencePenalty: 0.3, frequencyPenalty: 0.2, maxTokens: 2400 },
  })
  let job = null
  for (let i = 0; i < 100; i += 1) {
    job = runner.getJob(jobId)
    if (job && job.status !== 'running') break
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.equal(job.status, 'done')
  assert.equal(captured.temperature, 0.5)
  assert.equal(captured.topP, 0.9)
  assert.equal(captured.presencePenalty, 0.3)
  assert.equal(captured.frequencyPenalty, 0.2)
})

test('AiRunner retries transient transport errors and keeps the retry count', async () => {
  const store = fakeStore()
  let calls = 0
  const llm = {
    listProviders: () => [{ id: 'fake', name: 'Fake' }],
    listModels: async () => [{ id: 'fake-model', name: 'Fake Model' }],
    stream() {
      calls += 1
      if (calls <= 2) throw new Error('DeepSeek Messages transport failed')
      return validStream()
    },
  }
  const runner = new AiRunner(aiCtx(llm), { getStore: async () => store, transportRetryDelays: [5, 5] })
  const { jobId } = await runner.continueStory({ parentId: 'a', action: { type: 'enter' } })
  let job = null
  for (let i = 0; i < 100; i += 1) {
    job = runner.getJob(jobId)
    if (job && job.status !== 'running') break
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.equal(job.status, 'done')
  assert.equal(calls, 3)
  assert.equal(job.transportRetries, 2)
})

test('AiRunner reports ai_transport after transport retries are exhausted', async () => {
  const store = fakeStore()
  let calls = 0
  const llm = {
    listProviders: () => [{ id: 'fake', name: 'Fake' }],
    listModels: async () => [{ id: 'fake-model', name: 'Fake Model' }],
    stream() {
      calls += 1
      throw new Error('DeepSeek Messages transport failed')
    },
  }
  const runner = new AiRunner(aiCtx(llm), { getStore: async () => store, transportRetryDelays: [5, 5] })
  const { jobId } = await runner.continueStory({ parentId: 'a', action: { type: 'enter' } })
  let job = null
  for (let i = 0; i < 100; i += 1) {
    job = runner.getJob(jobId)
    if (job && job.status !== 'running') break
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.equal(job.status, 'error')
  assert.equal(job.error.code, 'ai_transport')
  assert.match(job.error.message, /网络/)
  assert.equal(calls, 3)
})

test('buildPrompt always injects the worldbook player-character entry', async () => {
  const player = {
    id: 'wb-player',
    type: 'person',
    title: '玩家角色 · 爱丽丝',
    summary: '玩家操控爱丽丝。',
    body: '玩家操控爱丽丝：选项与输入代表爱丽丝的言行。',
  }
  const store = fakeStore({ loadWorldbook: async () => [player] })
  const runner = new AiRunner({ get() { return undefined } }, { getStore: async () => store })
  const prompt = await runner.buildPrompt({ parentId: 'a', action: { type: 'enter' }, recent: [] })
  assert.ok(prompt.system.includes('【玩家角色】'))
  assert.ok(prompt.system.includes('玩家操控爱丽丝'))
  assert.ok(prompt.user.includes('玩家操控「爱丽丝」'))
})

test('buildPrompt injects the selected writing style into the system prompt', async () => {
  const store = fakeStore()
  const runner = new AiRunner({ get() { return undefined } }, { getStore: async () => store })
  const style = sanitizeStyle({ id: 'cold', name: '冷硬纪实', prompt: '用短句，重动作与数字。' })
  assert.ok(style)
  const prompt = await runner.buildPrompt({ parentId: 'a', action: { type: 'enter' }, recent: [], style })
  assert.ok(prompt.system.includes('文风要求：冷硬纪实'))
  assert.ok(prompt.system.includes('用短句，重动作与数字。'))
  assert.ok(prompt.user.includes('【当前正文】'))
  assert.equal(prompt.style.id, 'cold')

  const plain = await runner.buildPrompt({ parentId: 'a', action: { type: 'enter' }, recent: [] })
  assert.equal(plain.system.includes('文风要求'), false)

  assert.equal(sanitizeStyle(null), null)
  assert.equal(sanitizeStyle({ name: '只有名字' }), null)
  const longPrompt = sanitizeStyle({ id: 'x', name: 'x', prompt: 'a'.repeat(5000) })
  assert.equal(longPrompt.prompt.length, 2000)
})

test('buildPrompt injects logic / cot / memory-format templates and validates reasoning', async () => {
  const store = fakeStore()
  const runner = new AiRunner({ get() { return undefined } }, { getStore: async () => store })
  const prompt = await runner.buildPrompt({
    parentId: 'a',
    action: { type: 'enter' },
    recent: [],
    style: sanitizeStyle({ id: 's', name: '文风', prompt: '克制。' }),
    logic: sanitizeStyle({ id: 'l', name: '语言逻辑', prompt: '第三人称。' }),
    cot: sanitizeStyle({ id: 'c', name: '思维链', prompt: '单行箭头链。' }),
    memoryFormat: sanitizeStyle({ id: 'm', name: '记忆格式', prompt: '工作记忆最多 4 条。' }),
  })
  assert.ok(prompt.system.includes('【语言逻辑：语言逻辑】'))
  assert.ok(prompt.system.includes('【文风要求：文风】'))
  assert.ok(prompt.system.includes('思维链只写入 JSON 的 reasoning 字段'))
  assert.ok(prompt.system.includes('【记忆区格式：记忆格式】'))
  assert.ok(prompt.system.includes('memoryAppend 必须遵循以上格式'))

  assert.deepEqual(validateContinuation({
    blocks: [{ type: 'narration', text: '正文' }],
    choices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    reasoning: '[解析] -> [规划] -> [执行]',
  }), [])
  assert.ok(validateContinuation({
    blocks: [{ type: 'narration', text: '正文' }],
    choices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    reasoning: 'a'.repeat(4001),
  }).some((error) => error.includes('reasoning')))
})

test('chapter-word target is clamped and injected into the prompt', async () => {
  const store = fakeStore()
  const runner = new AiRunner({ get() { return undefined } }, { getStore: async () => store })
  const prompt = await runner.buildPrompt({ parentId: 'a', action: { type: 'enter' }, recent: [], targetWords: 1800 })
  assert.ok(prompt.system.includes('正文目标约 1800 字'))
  assert.ok(prompt.user.includes('1800'))
  assert.ok(prompt.system.includes('6-12 段'))
  assert.equal(sanitizeChapterWords(100), 200)
  assert.equal(sanitizeChapterWords(99999), 20000)
  assert.equal(sanitizeChapterWords('not-a-number'), 800)
})

test('AiRunner retries a token-truncated output with a larger budget', async () => {
  const store = fakeStore()
  const calls = []
  const llm = {
    listProviders: () => [{ id: 'fake', name: 'Fake' }],
    listModels: async () => [{ id: 'fake-model', name: 'Fake Model' }],
    stream(options) {
      calls.push(options.maxTokens)
      const first = calls.length === 1
      return (async function* () {
        if (first) {
          yield { type: 'text-delta', text: '{"title":"t","blocks":[{"type":"narration","text":"截断' }
          yield { type: 'finish', reason: { kind: 'max-tokens' } }
        } else {
          yield {
            type: 'text-delta',
            text: '{"title":"t","blocks":[{"type":"narration","text":"完整"}],"choices":[{"id":"a","label":"A"},{"id":"b","label":"B"}]}',
          }
          yield { type: 'finish', reason: { kind: 'stop' } }
        }
      })()
    },
  }
  const ctx = {
    get(name) {
      if (name === 'llm') return llm
      if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'fake', model: 'fake-model' }) }
      return undefined
    },
  }
  const runner = new AiRunner(ctx, { getStore: async () => store })
  const { jobId } = await runner.continueStory({ parentId: 'a', action: { type: 'enter' }, prefs: { maxTokens: 1200 } })
  let job = null
  for (let i = 0; i < 100; i += 1) {
    job = runner.getJob(jobId)
    if (job && job.status !== 'running') break
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.equal(job.status, 'done')
  assert.equal(job.repairAttempt, true)
  assert.equal(calls.length, 2)
  assert.ok(calls[1] > calls[0], 'repair should raise maxTokens')
  assert.equal(store.records.length, 1)
})

test('AiRunner reports invalid model output without writing a record', async () => {
  const store = fakeStore()
  const llm = {
    listProviders: () => [{ id: 'fake', name: 'Fake' }],
    listModels: async () => [{ id: 'fake-model', name: 'Fake Model' }],
    stream: () => (async function* () {
      yield { type: 'text-delta', text: '这不是 JSON' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })(),
  }
  const ctx = {
    get(name) {
      if (name === 'llm') return llm
      if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'fake', model: 'fake-model' }) }
      return undefined
    },
  }
  const runner = new AiRunner(ctx, { getStore: async () => store })
  const { jobId } = await runner.continueStory({ parentId: 'a', action: { type: 'enter' } })
  let job = null
  for (let i = 0; i < 100; i += 1) {
    job = runner.getJob(jobId)
    if (job && job.status !== 'running') break
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.equal(job.status, 'error')
  assert.equal(job.error.code, 'ai_invalid_output')
  assert.equal(store.records.length, 0)
})
