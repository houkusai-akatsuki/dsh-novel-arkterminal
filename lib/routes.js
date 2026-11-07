/**
 * dsh-novel-arkterminal / HTTP routes (same-origin, mounted by lib/index.js).
 */
import {
  ApiError,
  nowIso,
  parseBody,
  readBody,
  randomId,
  sendOk,
  sha256,
} from './util.js'
import { importManuscripts } from './importer.js'
import { assertWorldbook, mergeWorldbook, normalizeWorldbookImport } from './worldbook.js'
import { validatePlans, validateWorldbook } from './story.js'

const PREFIX = '/dsh-novel-arkterminal/api'

function urlOf(req) {
  return new URL(req.url || '/', 'http://localhost')
}

function query(req) {
  return urlOf(req).searchParams
}

function method(req, expected) {
  if (req.method !== expected) {
    throw new ApiError('method_not_allowed', `只支持 ${expected}`, 405)
  }
}

async function body(req, limit) {
  return parseBody(await readBody(req, limit))
}

function intParam(params, name, fallback) {
  const value = Number(params.get(name))
  return Number.isFinite(value) ? value : fallback
}

/** Apply optional reset flags carried by import/reset payloads. */
async function applyResetFlags(payload, store, saves) {
  const reset = payload && payload.reset && typeof payload.reset === 'object' ? payload.reset : {}
  const requested = reset.memory === true || reset.plans === true || reset.saves === true || reset.generated === true
  const applied = {}
  if (!requested) return applied

  // Snapshot everything that is about to be cleared so a reset/import can be undone.
  let runtimeBackup = null
  if (store.writable) {
    try {
      const [plans, memory, savesDoc] = await Promise.all([
        store.loadPlans().catch(() => []),
        store.loadMemory().catch(() => ''),
        saves.readAll().catch(() => ({ v: 1, slots: {} })),
      ])
      const file = await store.writeRuntimeBackup({ at: nowIso(), plans, memory, saves: savesDoc })
      runtimeBackup = file
    } catch (error) {
      console.warn('[dsh-novel-arkterminal] runtime backup before reset failed:', error && error.message)
    }
  }

  if (reset.memory === true) {
    await store.updateMemory('')
    applied.memory = true
  }
  if (reset.plans === true) {
    await store.updatePlans([])
    applied.plans = true
  }
  if (reset.saves === true) {
    await saves.clear()
    applied.saves = true
  }
  if (reset.generated === true) {
    const cleared = await store.clearGenerated()
    applied.generated = cleared.cleared
  }
  if (runtimeBackup) applied.backup = runtimeBackup
  return applied
}

export function buildRoutes(deps) {
  const { ctx, getStore, saves, ai } = deps
  const routes = []
  const add = (path, handler) => routes.push({ path: PREFIX + path, handler })

  /* -------------------------------------------------- health / boot */

  add('/health', async (req, res) => {
    method(req, 'GET')
    const store = await getStore()
    let llmAvailable = false
    let providers = []
    try {
      const llm = ctx.get('llm')
      llmAvailable = Boolean(llm)
      if (llm && llm.listProviders) providers = llm.listProviders().map((p) => ({ id: p.id, name: p.name || p.id }))
    } catch {
      llmAvailable = false
    }
    sendOk(res, {
      plugin: 'dsh-novel-arkterminal',
      version: '0.1.0',
      storyRoot: store.root,
      storyRootKind: store.kind,
      storyCandidates: store.candidates || [],
      writable: store.writable,
      llm: { available: llmAvailable, providers },
      node: process.version,
      time: nowIso(),
    })
  })

  add('/bootstrap', async (req, res) => {
    method(req, 'GET')
    const store = await getStore()
    const boot = await store.bootstrap()
    const savesData = await saves.list()
    const aiConfig = await ai.resolveConfig({})
    sendOk(res, {
      ...boot,
      saves: savesData,
      ai: {
        available: aiConfig.available,
        reason: aiConfig.reason,
        provider: aiConfig.provider,
        model: aiConfig.model,
        providers: aiConfig.providers,
        models: aiConfig.models,
      },
    })
  })

  add('/refresh', async (req, res) => {
    method(req, 'GET')
    const store = await getStore()
    const params = query(req)
    let job = null
    const jobId = params.get('jobId')
    if (jobId) job = ai.getJob(jobId)
    const storyText = await store.storyHash()
    const worldbookText = sha256(JSON.stringify(await store.loadWorldbook(await store.loadRawStory().then((r) => r.story))))
    const memory = await store.loadMemory()
    const plans = await store.loadPlans()
    let savesUpdatedAt = null
    try {
      const data = await saves.list()
      savesUpdatedAt = data.updatedAt
    } catch {
      savesUpdatedAt = null
    }
    sendOk(res, {
      storyHash: storyText,
      worldbookHash: worldbookText,
      memoryHash: sha256(memory),
      plansHash: sha256(JSON.stringify(plans)),
      memoryBytes: Buffer.byteLength(memory, 'utf8'),
      plansCount: plans.length,
      savesUpdatedAt,
      job,
      time: nowIso(),
    })
  })

  /* -------------------------------------------------- events */

  add('/event', async (req, res) => {
    method(req, 'POST')
    const payload = await body(req, 256 * 1024)
    const store = await getStore()
    const type = payload.type
    if (!['choice', 'input', 'enter'].includes(type)) {
      throw new ApiError('invalid_payload', '未知事件类型', 422)
    }
    const event = {
      v: 1,
      at: nowIso(),
      type,
      nodeId: typeof payload.nodeId === 'string' ? payload.nodeId : null,
      choiceId: typeof payload.choiceId === 'string' ? payload.choiceId : null,
      choiceLabel: typeof payload.choiceLabel === 'string' ? payload.choiceLabel.slice(0, 200) : null,
      text: typeof payload.text === 'string' ? payload.text.slice(0, 4000) : null,
      state: payload.state && typeof payload.state === 'object' ? payload.state : null,
    }
    const appended = await store.appendInbox(event)
    const result = { appended, event }
    if (payload.autoContinue === true) {
      try {
        const action = payload.action && typeof payload.action === 'object'
          ? payload.action
          : { type, choiceLabel: event.choiceLabel, text: event.text }
        const job = await ai.continueStory({
          parentId: typeof payload.parentId === 'string' ? payload.parentId : event.nodeId,
          action,
          prefs: payload.prefs && typeof payload.prefs === 'object' ? payload.prefs : {},
          recent: Array.isArray(payload.recent) ? payload.recent : [],
        })
        result.jobId = job.jobId
        result.provider = job.provider
        result.model = job.model
      } catch (error) {
        result.jobError = { code: error.code || 'ai_error', message: error.message }
      }
    }
    sendOk(res, result)
  })

  add('/inbox', async (req, res) => {
    method(req, 'GET')
    const store = await getStore()
    const limit = intParam(query(req), 'limit', 50)
    sendOk(res, { events: await store.readInbox(limit) })
  })

  /* -------------------------------------------------- saves */

  add('/saves', async (req, res) => {
    method(req, 'GET')
    sendOk(res, await saves.list())
  })

  add('/save', async (req, res) => {
    if (req.method === 'GET') {
      const slot = query(req).get('slot') || 'auto'
      const save = await saves.get(slot)
      if (!save) throw new ApiError('not_found', `存档槽为空：${slot}`, 404)
      sendOk(res, { slot, save })
      return
    }
    method(req, 'POST')
    const payload = await body(req, 2 * 1024 * 1024)
    const slot = typeof payload.slot === 'string' ? payload.slot : 'auto'
    const saved = await saves.save(slot, payload.save)
    sendOk(res, { slot, updatedAt: saved.updatedAt })
  })

  add('/save/delete', async (req, res) => {
    method(req, 'POST')
    const payload = await body(req, 64 * 1024)
    const slot = typeof payload.slot === 'string' ? payload.slot : ''
    sendOk(res, await saves.del(slot))
  })

  add('/save/import', async (req, res) => {
    method(req, 'POST')
    const payload = await body(req, 2 * 1024 * 1024)
    const saved = await saves.import(payload.save || payload)
    sendOk(res, saved)
  })

  add('/save/export', async (req, res) => {
    method(req, 'GET')
    const slot = query(req).get('slot') || 'auto'
    const save = await saves.get(slot)
    if (!save) throw new ApiError('not_found', `存档槽为空：${slot}`, 404)
    sendOk(res, { slot, save })
  })

  /* -------------------------------------------------- AI */

  add('/ai/config', async (req, res) => {
    method(req, 'GET')
    const params = query(req)
    const prefs = {
      provider: params.get('provider') || undefined,
      model: params.get('model') || undefined,
    }
    const config = await ai.resolveConfig(prefs)
    sendOk(res, {
      available: config.available,
      reason: config.reason,
      provider: config.provider,
      model: config.model,
      providers: config.providers,
      models: config.models,
      defaults: ai.defaultSelection(),
    })
  })

  add('/ai/continue', async (req, res) => {
    method(req, 'POST')
    const payload = await body(req, 512 * 1024)
    if (typeof payload.parentId !== 'string' || !payload.parentId) {
      throw new ApiError('invalid_payload', '缺少 parentId', 422)
    }
    const action = payload.action && typeof payload.action === 'object' ? payload.action : { type: 'enter' }
    const job = await ai.continueStory({
      parentId: payload.parentId,
      action,
      prefs: payload.prefs && typeof payload.prefs === 'object' ? payload.prefs : {},
      recent: Array.isArray(payload.recent) ? payload.recent : [],
    })
    sendOk(res, job)
  })

  add('/ai/job', async (req, res) => {
    method(req, 'GET')
    const id = query(req).get('id')
    if (!id) throw new ApiError('invalid_payload', '缺少 id', 422)
    const job = ai.getJob(id)
    if (!job) throw new ApiError('not_found', '找不到该任务', 404)
    sendOk(res, job)
  })

  add('/ai/cancel', async (req, res) => {
    method(req, 'POST')
    const payload = await body(req, 64 * 1024)
    if (typeof payload.id !== 'string' || !payload.id) throw new ApiError('invalid_payload', '缺少 id', 422)
    sendOk(res, ai.cancel(payload.id))
  })

  /* -------------------------------------------------- story / editor */

  add('/story/raw', async (req, res) => {
    method(req, 'GET')
    const store = await getStore()
    const { story } = await store.loadRawStory()
    const worldbook = await store.loadWorldbook(story)
    const version = await store.contentVersion()
    sendOk(res, {
      story,
      worldbook,
      version,
      backups: await store.listBackups(),
      paths: store.paths(),
    })
  })

  add('/story', async (req, res) => {
    method(req, 'PUT')
    const payload = await body(req, 3 * 1024 * 1024)
    const store = await getStore()
    if (!payload.story || typeof payload.story !== 'object') throw new ApiError('invalid_payload', '缺少 story', 422)
    const worldbook = Array.isArray(payload.worldbook) ? payload.worldbook : []
    const saved = await store.saveContent(payload.story, worldbook, payload.baseVersion)
    sendOk(res, saved)
  })

  add('/worldbook', async (req, res) => {
    const store = await getStore()
    if (req.method === 'GET') {
      const { story } = await store.loadRawStory()
      sendOk(res, { worldbook: await store.loadWorldbook(story) })
      return
    }
    method(req, 'PUT')
    const payload = await body(req, 1024 * 1024)
    const list = Array.isArray(payload.worldbook) ? payload.worldbook : payload
    const errors = validateWorldbook(list)
    if (errors.length > 0) throw new ApiError('invalid_story', errors.slice(0, 6).join('；'), 422)
    const { story } = await store.loadRawStory()
    const saved = await store.saveContent(story, list, payload.baseVersion)
    sendOk(res, saved)
  })

  add('/worldbook/import', async (req, res) => {
    method(req, 'POST')
    const payload = await body(req, 3 * 1024 * 1024)
    const input = payload.text !== undefined
      ? payload.text
      : payload.entries !== undefined
        ? payload.entries
        : payload
    const incoming = normalizeWorldbookImport(input)
    if (incoming.length === 0) {
      throw new ApiError('invalid_payload', '没有解析到世界书条目：支持 JSON 数组、SillyTavern 条目对象、id→条目对象或 Markdown 标题分节。', 422)
    }
    assertWorldbook(incoming)
    const store = await getStore()
    const { story } = await store.loadRawStory()
    const existing = await store.loadWorldbook(story)
    const mode = payload.mode === 'replace' ? 'replace' : 'merge'
    const merged = assertWorldbook(mergeWorldbook(existing, incoming, mode))
    const saved = await store.saveContent(story, merged, payload.baseVersion)
    const reset = await applyResetFlags(payload, store, saves)
    sendOk(res, {
      worldbook: merged,
      imported: incoming.length,
      total: merged.length,
      mode,
      version: saved.version,
      reset,
    })
  })

  add('/plans', async (req, res) => {
    if (req.method === 'GET') {
      const store = await getStore()
      sendOk(res, { plans: await store.loadPlans() })
      return
    }
    method(req, 'PUT')
    const payload = await body(req, 256 * 1024)
    const errors = validatePlans(payload.plans)
    if (errors.length > 0) throw new ApiError('invalid_payload', errors.join('；'), 422)
    const store = await getStore()
    sendOk(res, { plans: await store.updatePlans(payload.plans) })
  })

  add('/memory', async (req, res) => {
    if (req.method === 'GET') {
      const store = await getStore()
      sendOk(res, { memory: await store.loadMemory() })
      return
    }
    method(req, 'PUT')
    const payload = await body(req, 512 * 1024)
    const store = await getStore()
    sendOk(res, { memory: await store.updateMemory(payload.memory) })
  })

  add('/styles', async (req, res) => {
    const store = await getStore()
    if (req.method === 'GET') {
      sendOk(res, { styles: await store.loadStyles() })
      return
    }
    method(req, 'PUT')
    const payload = await body(req, 512 * 1024)
    const list = Array.isArray(payload.styles) ? payload.styles : payload
    sendOk(res, { styles: await store.saveStyles(list) })
  })

  add('/reset', async (req, res) => {
    method(req, 'POST')
    const payload = await body(req, 64 * 1024)
    const store = await getStore()
    const applied = await applyResetFlags(payload, store, saves)
    if (Object.keys(applied).length === 0) {
      throw new ApiError('invalid_payload', '没有指定要重置的内容：memory / plans / saves / generated', 422)
    }
    sendOk(res, { reset: applied })
  })

  add('/story/import', async (req, res) => {
    method(req, 'POST')
    const payload = await body(req, 4 * 1024 * 1024)
    const store = await getStore()
    let files = Array.isArray(payload.files) ? payload.files : null
    if (!files || files.length === 0) {
      files = await store.readManuscriptFiles()
    }
    if (!files || files.length === 0) throw new ApiError('invalid_payload', 'manuscript/ 目录里没有 .md 稿件', 422)
    const meta = {
      id: payload.id || undefined,
      title: payload.title || undefined,
      subtitle: payload.subtitle || undefined,
      language: payload.language || undefined,
      worldbook: Array.isArray(payload.worldbook) ? payload.worldbook : await store.loadWorldbook(await store.loadRawStory().then((r) => r.story)),
    }
    const imported = importManuscripts(files, meta)
    const saved = await store.saveContent(imported.story, meta.worldbook, payload.baseVersion)
    const reset = await applyResetFlags(payload, store, saves)
    sendOk(res, { ...saved, chapters: imported.chapters, order: imported.order, reset })
  })

  add('/story/adopt', async (req, res) => {
    method(req, 'POST')
    const payload = await body(req, 256 * 1024)
    const store = await getStore()
    const recordId = typeof payload.recordId === 'string' ? payload.recordId : ''
    const record = await store.readGeneratedRaw(recordId)
    if (!record) throw new ApiError('not_found', '找不到该生成记录', 404)
    const { story } = await store.loadRawStory()
    const worldbook = await store.loadWorldbook(story)
    const nodeId = `adopted-${recordId}`
    if (story.nodes[nodeId]) throw new ApiError('invalid_payload', '该生成内容已经采纳过', 409)
    const payloadData = record.payload || {}
    story.nodes[nodeId] = {
      chapter: payloadData.chapter || 'AI 续写',
      title: payloadData.title || 'AI 续写',
      adoptedFrom: recordId,
      blocks: Array.isArray(payloadData.blocks) ? payloadData.blocks : [],
      choices: Array.isArray(payloadData.choices)
        ? payloadData.choices.map((choice) => ({
          id: 'adopted:' + choice.id,
          label: choice.label,
          next: null,
          ai: true,
          choiceId: choice.id,
        }))
        : [],
      input: { enabled: true, placeholder: '自由输入，继续故事…', continueWithAI: true },
    }
    const saved = await store.saveContent(story, worldbook, payload.baseVersion)
    sendOk(res, { ...saved, nodeId })
  })

  add('/story/backups', async (req, res) => {
    method(req, 'GET')
    const store = await getStore()
    sendOk(res, { backups: await store.listBackups() })
  })

  add('/story/backup/revert', async (req, res) => {
    method(req, 'POST')
    await body(req, 64 * 1024)
    const store = await getStore()
    sendOk(res, await store.revertBackup())
  })

  add('/manuscript', async (req, res) => {
    method(req, 'GET')
    const store = await getStore()
    const files = await store.readManuscriptFiles()
    sendOk(res, {
      dir: store.paths().manuscriptDir,
      files: files.map((file) => ({ name: file.name, bytes: Buffer.byteLength(file.text, 'utf8') })),
    })
  })

  return routes
}

export { PREFIX }
