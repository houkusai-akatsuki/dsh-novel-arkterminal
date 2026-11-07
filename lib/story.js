/**
 * dsh-novel-arkterminal / story data layer.
 *
 * The story package lives in the workspace (`asi-1939/terminal/`) and is the
 * author-facing source of truth; AI continuations are append-only files under
 * `generated/` and are merged at read time, never written into `story.json`.
 */
import path from 'node:path'
import { promises as fsp } from 'node:fs'
import {
  ApiError,
  clampString,
  ensureDir,
  nowIso,
  parseJsonl,
  readFileOr,
  readJson,
  sha256,
  stamp,
  within,
  writeFileAtomic,
  writeJsonAtomic,
} from './util.js'

export const STORY_SCHEMA = 1
export const BLOCK_TYPES = ['narration', 'dialogue', 'system', 'heading']
export const WORLDBOOK_TYPES = ['person', 'place', 'tech', 'event', 'org', 'other']
export const PLAN_KINDS = ['plan', 'objective']
export const TEMPLATE_KINDS = ['style', 'logic', 'cot', 'memory']
export const MAX_BACKUPS = 10

const LIMITS = {
  storyBytes: 2 * 1024 * 1024,
  worldbookBytes: 512 * 1024,
  memoryBytes: 256 * 1024,
  plansBytes: 128 * 1024,
  stylesBytes: 256 * 1024,
  inboxBytes: 512 * 1024,
  generatedBytes: 4 * 1024 * 1024,
  continuationLine: 64 * 1024,
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

export function validateWorldbook(list) {
  const errors = []
  if (list === undefined) return errors
  if (!Array.isArray(list)) return ['worldbook 必须是数组']
  const ids = new Set()
  list.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`worldbook[${index}] 必须是对象`)
      return
    }
    if (typeof entry.id !== 'string' || !entry.id) errors.push(`worldbook[${index}] 缺少 id`)
    else if (ids.has(entry.id)) errors.push(`worldbook id 重复：${entry.id}`)
    else ids.add(entry.id)
    if (typeof entry.title !== 'string' || !entry.title) errors.push(`worldbook[${index}] 缺少 title`)
    if (entry.type !== undefined && !WORLDBOOK_TYPES.includes(entry.type)) {
      errors.push(`worldbook[${index}] 未知 type：${entry.type}`)
    }
    if (entry.summary !== undefined && typeof entry.summary !== 'string') errors.push(`worldbook[${index}] summary 必须是字符串`)
    if (entry.body !== undefined && typeof entry.body !== 'string') errors.push(`worldbook[${index}] body 必须是字符串`)
  })
  return errors
}

export function validatePlans(plans) {
  const errors = []
  if (plans === undefined) return errors
  if (!Array.isArray(plans)) return ['plans 必须是数组']
  const ids = new Set()
  plans.forEach((plan, index) => {
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
      errors.push(`plans[${index}] 必须是对象`)
      return
    }
    if (typeof plan.id !== 'string' || !plan.id) errors.push(`plans[${index}] 缺少 id`)
    else if (ids.has(plan.id)) errors.push(`plan id 重复：${plan.id}`)
    else ids.add(plan.id)
    if (typeof plan.label !== 'string' || !plan.label) errors.push(`plans[${index}] 缺少 label`)
    if (plan.kind !== undefined && !PLAN_KINDS.includes(plan.kind)) errors.push(`plans[${index}] 未知 kind`)
    if (plan.status !== undefined && !['open', 'done'].includes(plan.status)) errors.push(`plans[${index}] 未知 status`)
  })
  return errors
}

export function validateStyleTemplates(list) {
  const errors = []
  if (list === undefined) return errors
  if (!Array.isArray(list)) return ['styles 必须是数组']
  if (list.length > 50) errors.push('styles 最多 50 条')
  const ids = new Set()
  list.forEach((style, index) => {
    if (!style || typeof style !== 'object' || Array.isArray(style)) {
      errors.push(`styles[${index}] 必须是对象`)
      return
    }
    if (typeof style.id !== 'string' || !/^[\w.:-]{1,64}$/.test(style.id)) {
      errors.push(`styles[${index}] id 需为 1-64 位字母数字/下划线/点/短横线`)
    } else if (ids.has(style.id)) {
      errors.push(`styles[${index}] id 重复：${style.id}`)
    } else {
      ids.add(style.id)
    }
    if (style.kind !== undefined && !TEMPLATE_KINDS.includes(style.kind)) {
      errors.push(`styles[${index}] 未知 kind：${style.kind}`)
    }
    if (typeof style.name !== 'string' || !style.name.trim() || style.name.length > 80) {
      errors.push(`styles[${index}] name 需为 1-80 字`)
    }
    if (typeof style.prompt !== 'string' || !style.prompt.trim()) {
      errors.push(`styles[${index}] prompt 不能为空`)
    } else if (style.prompt.length > 2000) {
      errors.push(`styles[${index}] prompt 最多 2000 字`)
    }
    if (style.description !== undefined && (typeof style.description !== 'string' || style.description.length > 200)) {
      errors.push(`styles[${index}] description 最多 200 字`)
    }
    if (style.temperature !== undefined) {
      const temp = Number(style.temperature)
      if (!Number.isFinite(temp) || temp < 0 || temp > 1.5) errors.push(`styles[${index}] temperature 需在 0-1.5`)
    }
  })
  return errors
}

export function validateStory(story) {
  const errors = []
  if (!story || typeof story !== 'object' || Array.isArray(story)) return ['story 必须是对象']
  if (story.schema !== STORY_SCHEMA) errors.push(`schema 必须为 ${STORY_SCHEMA}`)
  if (typeof story.id !== 'string' || !story.id) errors.push('缺少 story.id')
  if (typeof story.title !== 'string' || !story.title) errors.push('缺少 story.title')
  if (story.start !== undefined && (typeof story.start !== 'string' || !story.start)) errors.push('story.start 必须是非空字符串')
  if (!story.nodes || typeof story.nodes !== 'object' || Array.isArray(story.nodes)) {
    errors.push('story.nodes 必须是对象')
    return errors
  }
  const ids = Object.keys(story.nodes)
  if (ids.length === 0) errors.push('story.nodes 不能为空')
  if (story.start && !story.nodes[story.start]) errors.push(`起始节点不存在：${story.start}`)
  for (const [nodeId, node] of Object.entries(story.nodes)) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      errors.push(`节点 ${nodeId} 必须是对象`)
      continue
    }
    if (!Array.isArray(node.blocks)) errors.push(`节点 ${nodeId} 缺少 blocks 数组`)
    else {
      node.blocks.forEach((block, bi) => {
        if (!block || typeof block !== 'object') {
          errors.push(`节点 ${nodeId} blocks[${bi}] 必须是对象`)
          return
        }
        if (!BLOCK_TYPES.includes(block.type)) errors.push(`节点 ${nodeId} blocks[${bi}] 未知 type：${block.type}`)
        if (typeof block.text !== 'string' || !block.text) errors.push(`节点 ${nodeId} blocks[${bi}] 缺少 text`)
        else if (block.text.length > 20000) errors.push(`节点 ${nodeId} blocks[${bi}] text 过长`)
        if (block.speaker !== undefined && typeof block.speaker !== 'string') errors.push(`节点 ${nodeId} blocks[${bi}] speaker 必须是字符串`)
      })
    }
    const choiceIds = new Set()
    if (node.choices !== undefined) {
      if (!Array.isArray(node.choices)) errors.push(`节点 ${nodeId} choices 必须是数组`)
      else node.choices.forEach((choice, ci) => {
        if (!choice || typeof choice !== 'object') {
          errors.push(`节点 ${nodeId} choices[${ci}] 必须是对象`)
          return
        }
        if (typeof choice.id !== 'string' || !choice.id) errors.push(`节点 ${nodeId} choices[${ci}] 缺少 id`)
        else if (choiceIds.has(choice.id)) errors.push(`节点 ${nodeId} choice id 重复：${choice.id}`)
        else choiceIds.add(choice.id)
        if (typeof choice.label !== 'string' || !choice.label) errors.push(`节点 ${nodeId} choices[${ci}] 缺少 label`)
        if (choice.next !== undefined && choice.next !== null) {
          if (typeof choice.next !== 'string') errors.push(`节点 ${nodeId} choices[${ci}] next 必须是字符串或 null`)
          else if (!story.nodes[choice.next]) errors.push(`节点 ${nodeId} choices[${ci}] next 指向不存在的节点：${choice.next}`)
        }
        if (choice.ai !== undefined && typeof choice.ai !== 'boolean') errors.push(`节点 ${nodeId} choices[${ci}] ai 必须是布尔值`)
      })
    }
    if (node.input !== undefined) {
      if (!node.input || typeof node.input !== 'object') errors.push(`节点 ${nodeId} input 必须是对象`)
      else if (node.input.placeholder !== undefined && typeof node.input.placeholder !== 'string') errors.push(`节点 ${nodeId} input.placeholder 必须是字符串`)
    }
    if (node.goals !== undefined) {
      const planErrors = validatePlans(node.goals)
      for (const error of planErrors) errors.push(`节点 ${nodeId} goals: ${error}`)
    }
    if (node.worldbook !== undefined) {
      if (!Array.isArray(node.worldbook)) errors.push(`节点 ${nodeId} worldbook 必须是数组`)
      else node.worldbook.forEach((ref) => {
        if (typeof ref !== 'string') errors.push(`节点 ${nodeId} worldbook 引用必须是字符串`)
      })
    }
  }
  errors.push(...validateWorldbook(story.worldbook))
  if (story.characters !== undefined) {
    if (!Array.isArray(story.characters)) errors.push('characters 必须是数组')
    else story.characters.forEach((character, index) => {
      if (!character || typeof character !== 'object' || typeof character.id !== 'string' || typeof character.name !== 'string') {
        errors.push(`characters[${index}] 需要 id 与 name`)
      }
    })
  }
  return errors
}

/* ------------------------------------------------------------------ *
 * Merge authored story + generated continuations + worldbook
 * ------------------------------------------------------------------ */

export function mergeGenerated(story, worldbook, records) {
  const merged = JSON.parse(JSON.stringify(story))
  merged.worldbook = Array.isArray(worldbook) ? worldbook : merged.worldbook || []
  merged.nodes = merged.nodes || {}
  for (const record of records) {
    if (!record || !record.payload) continue
    const nodeId = 'gen:' + record.id
    if (merged.nodes[nodeId]) continue
    const payload = record.payload
    const blocks = Array.isArray(payload.blocks) ? payload.blocks : []
    const choices = Array.isArray(payload.choices) ? payload.choices : []
    merged.nodes[nodeId] = {
      chapter: payload.chapter || 'AI 续写',
      title: payload.title || '续写',
      generated: true,
      parentId: record.parentId || null,
      blocks,
      choices: choices.map((choice) => ({
        id: 'gen:' + record.id + ':' + choice.id,
        label: choice.label,
        hint: choice.hint,
        ai: true,
        next: null,
        choiceId: choice.id,
      })),
      input: { enabled: true, placeholder: '自由输入，继续故事…', continueWithAI: true },
    }
  }
  merged.generated = records.map((record) => ({
    id: record.id,
    parentId: record.parentId || null,
    createdAt: record.createdAt || null,
    title: record.payload && record.payload.title ? record.payload.title : '续写',
    reasoning: record.payload && typeof record.payload.reasoning === 'string' ? record.payload.reasoning : null,
    templates: record.templates || null,
  }))
  return merged
}

/* ------------------------------------------------------------------ *
 * Store
 * ------------------------------------------------------------------ */

const WRITE_FILES = ['story.json', 'worldbook.json', 'plans.json', 'memory.md', 'inbox.jsonl', 'generated/continuations.jsonl']

export class StoryStore {
  constructor({ root, kind, bundledRoot, candidates }) {
    this.root = root
    this.kind = kind
    this.bundledRoot = bundledRoot
    this.candidates = candidates || []
  }

  static async resolve(ctx, pkgDir) {
    const bundledRoot = path.join(pkgDir, 'story')
    const candidates = []
    const seen = new Set()
    const push = (root, kind) => {
      if (!root) return
      const resolved = path.resolve(root)
      if (seen.has(resolved)) return
      seen.add(resolved)
      candidates.push({ root: resolved, kind })
    }

    const envRoot = typeof process.env.DSH_NOVEL_TERMINAL_ROOT === 'string' ? process.env.DSH_NOVEL_TERMINAL_ROOT.trim() : ''
    if (envRoot) push(envRoot, 'workspace')
    try {
      const working = ctx.get('workingDirectory')
      const defaultDir = working && working.defaultDirectory
      if (defaultDir) push(path.join(defaultDir, 'asi-1939', 'terminal'), 'workspace')
    } catch {
      // optional service
    }
    try {
      const registry = ctx.get('workspaceRegistry')
      const list = registry && typeof registry.list === 'function' ? registry.list() : []
      for (const workspace of list || []) {
        if (workspace && workspace.path) push(path.join(workspace.path, 'asi-1939', 'terminal'), 'workspace')
      }
    } catch {
      // optional service
    }
    try {
      push(path.join(process.cwd(), 'asi-1939', 'terminal'), 'workspace')
    } catch {
      // ignore
    }
    push(bundledRoot, 'bundled')

    for (const candidate of candidates) {
      try {
        await fsp.access(path.join(candidate.root, 'story.json'))
        return new StoryStore({ ...candidate, bundledRoot, candidates })
      } catch {
        // try next candidate
      }
    }
    return new StoryStore({ root: bundledRoot, kind: 'bundled', bundledRoot, candidates })
  }

  get writable() {
    return this.kind === 'workspace'
  }

  p(...names) {
    return path.join(this.root, ...names)
  }

  assertWritable() {
    if (!this.writable) throw new ApiError('read_only', '剧情目录不可写：当前为内置演示故事', 409)
  }

  paths() {
    return {
      root: this.root,
      kind: this.kind,
      writable: this.writable,
      storyFile: this.p('story.json'),
      worldbookFile: this.p('worldbook.json'),
      memoryFile: this.p('memory.md'),
      plansFile: this.p('plans.json'),
      stylesFile: this.p('styles.json'),
      inboxFile: this.p('inbox.jsonl'),
      backupsDir: this.p('backups'),
      manuscriptDir: this.p('manuscript'),
      generatedFile: this.p('generated', 'continuations.jsonl'),
    }
  }

  async loadRawStory() {
    const file = this.p('story.json')
    const text = await readFileOr(file, null)
    if (text === null) throw new ApiError('invalid_story', `找不到故事文件：${file}`, 422)
    if (Buffer.byteLength(text, 'utf8') > LIMITS.storyBytes) throw new ApiError('too_large', 'story.json 过大', 413)
    let story
    try {
      story = JSON.parse(text)
    } catch (error) {
      throw new ApiError('invalid_story', `story.json 解析失败：${error.message}`, 422)
    }
    const errors = validateStory(story)
    if (errors.length > 0) {
      throw new ApiError('invalid_story', `story.json 校验失败：${errors.slice(0, 5).join('；')}`, 422)
    }
    return { story, text }
  }

  async loadWorldbook(story) {
    const fromFile = await readJson(this.p('worldbook.json'), undefined)
    const list = Array.isArray(fromFile) ? fromFile : story && Array.isArray(story.worldbook) ? story.worldbook : []
    const errors = validateWorldbook(list)
    if (errors.length > 0) {
      throw new ApiError('invalid_story', `worldbook 校验失败：${errors.slice(0, 5).join('；')}`, 422)
    }
    return list
  }

  async loadMemory() {
    const text = await readFileOr(this.p('memory.md'), '')
    return typeof text === 'string' ? text.slice(0, LIMITS.memoryBytes) : ''
  }

  async loadPlans() {
    const plans = await readJson(this.p('plans.json'), [])
    const list = Array.isArray(plans) ? plans : []
    const errors = validatePlans(list)
    if (errors.length > 0) {
      throw new ApiError('invalid_story', `plans 校验失败：${errors.slice(0, 5).join('；')}`, 422)
    }
    return list
  }

  async loadStyles() {
    const raw = await readJson(this.p('styles.json'), [])
    const list = Array.isArray(raw) ? raw : []
    const errors = validateStyleTemplates(list)
    if (errors.length > 0) {
      throw new ApiError('invalid_story', `styles.json 校验失败：${errors.slice(0, 5).join('；')}`, 422)
    }
    return list
  }

  async saveStyles(list) {
    this.assertWritable()
    const errors = validateStyleTemplates(list)
    if (errors.length > 0) throw new ApiError('invalid_payload', errors.slice(0, 6).join('；'), 422)
    const text = JSON.stringify(list, null, 2) + '\n'
    if (Buffer.byteLength(text, 'utf8') > LIMITS.stylesBytes) throw new ApiError('too_large', '文风模板总大小超限', 413)
    await writeJsonAtomic(this.p('styles.json'), list)
    return list
  }

  async loadGeneratedRecords() {    const text = await readFileOr(this.p('generated', 'continuations.jsonl'), '')
    const records = parseJsonl(text).filter((record) => record && record.id && record.payload)
    return records
  }

  async contentVersion() {
    const storyText = await readFileOr(this.p('story.json'), '')
    const worldbookText = await readFileOr(this.p('worldbook.json'), '')
    return sha256(storyText + '\n---worldbook---\n' + worldbookText)
  }

  async storyHash() {
    return sha256(await readFileOr(this.p('story.json'), ''))
  }

  async bootstrap() {
    const { story } = await this.loadRawStory()
    const worldbook = await this.loadWorldbook(story)
    const records = await this.loadGeneratedRecords()
    const merged = mergeGenerated(story, worldbook, records)
    const memory = await this.loadMemory()
    const plans = await this.loadPlans()
    const styles = await this.loadStyles()
    const version = await this.contentVersion()
    const storyHash = await this.storyHash()
    return {
      meta: {
        pluginVersion: '0.1.0',
        storyId: story.id,
        storyTitle: story.title,
        storySubtitle: story.subtitle || '',
        language: story.language || 'zh',
        version,
        storyHash,
        counts: {
          nodes: Object.keys(story.nodes).length,
          generated: records.length,
          worldbook: worldbook.length,
          styles: styles.length,
        },
      },
      story: merged,
      worldbook,
      generated: records,
      memory,
      plans,
      styles,
      paths: this.paths(),
      limits: LIMITS,
    }
  }

  async saveContent(nextStory, nextWorldbook, baseVersion) {
    this.assertWritable()
    const errors = validateStory(nextStory)
    if (errors.length > 0) throw new ApiError('invalid_story', errors.slice(0, 8).join('；'), 422)
    const worldbookErrors = validateWorldbook(nextWorldbook)
    if (worldbookErrors.length > 0) throw new ApiError('invalid_story', worldbookErrors.slice(0, 8).join('；'), 422)
    const current = await this.contentVersion()
    if (baseVersion && baseVersion !== current) {
      throw new ApiError('conflict_version', '剧情已被其他操作修改，请重新载入后再保存', 409)
    }
    const previousStory = await readFileOr(this.p('story.json'), '{}')
    const previousWorldbook = await readFileOr(this.p('worldbook.json'), '[]')
    await this.writeBackup(previousStory, previousWorldbook)
    await writeJsonAtomic(this.p('story.json'), nextStory)
    if (Array.isArray(nextWorldbook)) await writeJsonAtomic(this.p('worldbook.json'), nextWorldbook)
    return { version: await this.contentVersion(), story: nextStory, worldbook: nextWorldbook || [] }
  }

  async writeBackup(storyText, worldbookText) {
    const dir = this.p('backups')
    await ensureDir(dir)
    const payload = { at: nowIso(), story: JSON.parse(storyText || '{}'), worldbook: JSON.parse(worldbookText || '[]') }
    await writeJsonAtomic(path.join(dir, `${stamp()}-${Date.now()}.json`), payload)
    const files = (await fsp.readdir(dir)).filter((name) => name.endsWith('.json')).sort()
    while (files.length > MAX_BACKUPS) {
      const oldest = files.shift()
      await fsp.rm(path.join(dir, oldest), { force: true })
    }
  }

  async listBackups() {
    const dir = this.p('backups')
    try {
      const names = (await fsp.readdir(dir)).filter((name) => name.endsWith('.json')).sort().reverse()
      return names.map((name) => ({ name, at: name.split('-')[0] || '' }))
    } catch {
      return []
    }
  }

  async revertBackup() {
    this.assertWritable()
    const dir = this.p('backups')
    let names = []
    try {
      names = (await fsp.readdir(dir)).filter((name) => name.endsWith('.json')).sort().reverse()
    } catch {
      throw new ApiError('not_found', '没有可用的备份', 404)
    }
    if (names.length === 0) throw new ApiError('not_found', '没有可用的备份', 404)
    const payload = await readJson(path.join(dir, names[0]), null)
    if (!payload || !payload.story) throw new ApiError('invalid_story', '最新备份不可用', 422)
    const errors = validateStory(payload.story)
    if (errors.length > 0) throw new ApiError('invalid_story', '备份内容校验失败', 422)
    await writeJsonAtomic(this.p('story.json'), payload.story)
    if (Array.isArray(payload.worldbook)) await writeJsonAtomic(this.p('worldbook.json'), payload.worldbook)
    return { restored: names[0], version: await this.contentVersion() }
  }

  async updatePlans(plans) {
    this.assertWritable()
    const errors = validatePlans(plans)
    if (errors.length > 0) throw new ApiError('invalid_payload', errors.join('；'), 422)
    await writeJsonAtomic(this.p('plans.json'), plans)
    return plans
  }

  async updateMemory(text) {
    this.assertWritable()
    if (typeof text !== 'string') throw new ApiError('invalid_payload', 'memory 必须是字符串', 422)
    if (Buffer.byteLength(text, 'utf8') > LIMITS.memoryBytes) throw new ApiError('too_large', '记忆区过大', 413)
    await writeFileAtomic(this.p('memory.md'), text)
    return text
  }

  async appendMemory(section) {
    if (!this.writable) return false
    const current = await this.loadMemory()
    const next = (current.trimEnd() + '\n\n' + section.trim() + '\n').slice(-LIMITS.memoryBytes)
    await writeFileAtomic(this.p('memory.md'), next)
    return true
  }

  async appendInbox(event) {
    if (!this.writable) return { appended: false, reason: 'read_only' }
    const file = this.p('inbox.jsonl')
    const line = JSON.stringify(event)
    if (Buffer.byteLength(line, 'utf8') > 16 * 1024) throw new ApiError('too_large', '事件过大', 413)
    try {
      const stat = await fsp.stat(file)
      if (stat.size > LIMITS.inboxBytes) {
        await fsp.rename(file, this.p('inbox.1.jsonl')).catch(() => {})
      }
    } catch {
      // no inbox yet
    }
    await ensureDir(path.dirname(file))
    await fsp.appendFile(file, line + '\n', 'utf8')
    return { appended: true, inboxFile: file }
  }

  async readInbox(limit = 50) {
    const text = await readFileOr(this.p('inbox.jsonl'), '')
    const records = parseJsonl(text)
    return records.slice(-Math.max(1, Math.min(200, limit)))
  }

  async writeRuntimeBackup(payload) {
    this.assertWritable()
    const dir = this.p('backups')
    await ensureDir(dir)
    const file = path.join(dir, `${stamp()}-${Date.now()}-runtime.json`)
    await writeJsonAtomic(file, payload)
    return file
  }

  async clearGenerated() {
    this.assertWritable()
    const file = this.p('generated', 'continuations.jsonl')
    const text = await readFileOr(file, '')
    if (!text.trim()) return { cleared: false, backup: null }
    await ensureDir(path.dirname(file))
    const backup = this.p('generated', `continuations-${stamp()}-${Date.now()}.jsonl`)
    await fsp.rename(file, backup)
    return { cleared: true, backup }
  }

  async appendContinuation(record) {    if (!this.writable) throw new ApiError('read_only', '剧情目录不可写', 409)
    const line = JSON.stringify(record)
    if (Buffer.byteLength(line, 'utf8') > LIMITS.continuationLine) throw new ApiError('too_large', '续写记录过大', 413)
    const file = this.p('generated', 'continuations.jsonl')
    await ensureDir(path.dirname(file))
    const existing = await fsp.stat(file).catch(() => null)
    if (existing && existing.size > LIMITS.generatedBytes) {
      await fsp.rename(file, this.p('generated', `continuations-${stamp()}.jsonl`)).catch(() => {})
    }
    await fsp.appendFile(file, line + '\n', 'utf8')
    return record
  }

  async removeContinuation(id) {
    this.assertWritable()
    const file = this.p('generated', 'continuations.jsonl')
    const text = await readFileOr(file, '')
    const kept = parseJsonl(text).filter((record) => record.id !== id)
    await writeFileAtomic(file, kept.map((record) => JSON.stringify(record)).join('\n') + (kept.length ? '\n' : ''))
    return kept.length
  }

  async readManuscriptFiles() {
    const dir = this.p('manuscript')
    try {
      const names = (await fsp.readdir(dir))
        .filter((name) => name.endsWith('.md') && !/^readme/i.test(name))
        .sort()
      const files = []
      for (const name of names) {
        files.push({ name, text: await readFileOr(path.join(dir, name), '') })
      }
      return files
    } catch {
      return []
    }
  }

  async readGeneratedRaw(id) {
    const records = await this.loadGeneratedRecords()
    return records.find((record) => record.id === id) || null
  }
}

export function assertInside(root, target) {
  if (!within(root, target)) throw new ApiError('forbidden_path', '路径越界', 403)
  return target
}

export { LIMITS }
