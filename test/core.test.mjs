import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  validateStory,
  validateWorldbook,
  validatePlans,
  validateStyleTemplates,
  mergeGenerated,
} from '../lib/story.js'
import { parseManuscript, importManuscripts } from '../lib/importer.js'
import { extractJson, validateContinuation } from '../lib/ai.js'
import { validateSave, SaveStore } from '../lib/store.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const workspaceTerminal = path.resolve(here, '..', '..', '..', 'asi-1939', 'terminal')

async function readJsonFile(file) {
  return JSON.parse(await fsp.readFile(file, 'utf8'))
}

test('seed story.json + worldbook.json pass validation', async () => {
  const story = await readJsonFile(path.join(workspaceTerminal, 'story.json'))
  const worldbook = await readJsonFile(path.join(workspaceTerminal, 'worldbook.json'))
  assert.deepEqual(validateStory(story), [])
  assert.deepEqual(validateWorldbook(worldbook), [])
  const plans = await readJsonFile(path.join(workspaceTerminal, 'plans.json'))
  assert.deepEqual(validatePlans(plans), [])
})

test('story validation rejects dangling next and bad block type', () => {
  const story = {
    schema: 1,
    id: 'x',
    title: 'x',
    start: 'a',
    nodes: {
      a: {
        blocks: [{ type: 'dialog', text: 'hi' }],
        choices: [{ id: 'c', label: 'go', next: 'missing' }],
      },
    },
  }
  const errors = validateStory(story)
  assert.ok(errors.some((error) => error.includes('未知 type')))
  assert.ok(errors.some((error) => error.includes('不存在的节点')))
})

test('writing style templates validation', () => {
  assert.deepEqual(validateStyleTemplates([{ id: 'cold', name: '冷硬', prompt: '用短句。', kind: 'style' }]), [])
  assert.deepEqual(validateStyleTemplates([{ id: 'cot1', name: '思维链', prompt: '单行。', kind: 'cot' }]), [])
  assert.ok(validateStyleTemplates('nope').length > 0)
  const bad = validateStyleTemplates([{ id: 'bad id', name: '', prompt: '' }])
  assert.ok(bad.length >= 3)
  assert.ok(validateStyleTemplates([{ id: 'x', name: 'x', prompt: 'p', kind: 'unknown-kind' }]).some((error) => error.includes('kind')))
  const tooLong = validateStyleTemplates([{ id: 'x', name: 'x', prompt: 'a'.repeat(2001) }])
  assert.ok(tooLong.some((error) => error.includes('2000')))
  const duplicate = validateStyleTemplates([
    { id: 'dup', name: 'a', prompt: 'p' },
    { id: 'dup', name: 'b', prompt: 'p' },
  ])
  assert.ok(duplicate.some((error) => error.includes('重复')))
})

test('mergeGenerated adds gen: nodes without touching authored nodes', () => {
  const story = {
    schema: 1,
    id: 'x',
    title: 'x',
    start: 'a',
    nodes: { a: { blocks: [{ type: 'narration', text: 'hi' }], choices: [] } },
  }
  const records = [{
    id: 'r1',
    parentId: 'a',
    createdAt: new Date().toISOString(),
    payload: {
      title: 'next',
      blocks: [{ type: 'narration', text: 'generated' }],
      choices: [{ id: 'x', label: '继续' }],
    },
  }]
  const merged = mergeGenerated(story, [], records)
  assert.ok(merged.nodes['gen:r1'])
  assert.equal(merged.nodes['gen:r1'].blocks[0].text, 'generated')
  assert.equal(merged.nodes['gen:r1'].choices[0].ai, true)
  assert.equal(merged.nodes.a.blocks[0].text, 'hi')
})

test('manuscript importer builds a valid linear story', () => {
  const files = [
    { name: '01.md', text: '# 第一幕\n\n第一段。\n\n第二段。\n' },
    { name: '02.md', text: '## 第二幕\n\n第三段。\n\n> 选项：再看看\n' },
  ]
  const { story, order, chapters } = parseManuscript(files, { id: 'demo', title: 'Demo' })
  assert.equal(chapters, 2)
  assert.deepEqual(order.length, 2)
  assert.deepEqual(validateStory(story), [])
  assert.equal(story.nodes[order[0]].choices[0].next, order[1])
  assert.equal(story.nodes[order[1]].choices[0].ai, true)
})

test('importer reports invalid input instead of throwing raw', () => {
  const empty = importManuscripts([], { id: 'empty', title: 'Empty' })
  assert.equal(empty.chapters, 1)
  assert.deepEqual(validateStory(empty.story), [])
})

test('extractJson tolerates fences and surrounding prose', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 })
  assert.deepEqual(extractJson('```json\n{"a":2}\n```'), { a: 2 })
  assert.deepEqual(extractJson('好的：{"a":3} 以上。'), { a: 3 })
  assert.equal(extractJson('not json'), null)
})

test('validateContinuation enforces blocks and choices', () => {
  const good = {
    title: 't',
    blocks: [{ type: 'narration', text: '正文' }],
    choices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    memoryAppend: '记忆',
  }
  assert.deepEqual(validateContinuation(good), [])
  assert.ok(validateContinuation({}).length > 0)
  assert.ok(validateContinuation({ blocks: [], choices: [] }).length > 0)
  assert.ok(validateContinuation(good.choices ? { ...good, choices: [good.choices[0]] } : {}).some((e) => e.includes('至少')))
})

test('validateSave and SaveStore round-trip', async () => {
  const goodSave = {
    v: 1,
    storyId: 'demo',
    nodeId: 'a',
    visited: ['a'],
    flags: {},
    history: [],
    snapshots: [],
  }
  assert.deepEqual(validateSave(goodSave), [])
  assert.ok(validateSave({ v: 1 }).length > 0)

  const dir = await fsp.mkdtemp(path.join(process.env.TEMP || '/tmp', 'nt-save-'))
  const store = new SaveStore(dir)
  await store.save('auto', goodSave)
  const listed = await store.list()
  assert.equal(listed.slots.length, 1)
  const loaded = await store.get('auto')
  assert.equal(loaded.nodeId, 'a')
  await assert.rejects(store.save('bad-slot', goodSave))
  await store.save('auto', { ...goodSave, nodeId: 'b' })
  assert.equal((await store.get('auto')).nodeId, 'b')
  await store.clear()
  assert.equal((await store.list()).slots.length, 0)
  await store.del('auto').catch(() => {})
  await store.save('auto', goodSave)
  await store.del('auto')
  assert.equal((await store.list()).slots.length, 0)
  await fsp.rm(dir, { recursive: true, force: true })
})
