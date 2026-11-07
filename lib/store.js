/**
 * dsh-novel-arkterminal / local save store.
 * Saves live under $DSH_HOME/novel-terminal/saves.json (port-independent).
 */
import path from 'node:path'
import { promises as fsp } from 'node:fs'
import {
  ApiError,
  dshHome,
  ensureDir,
  nowIso,
  readJson,
  writeJsonAtomic,
} from './util.js'

export const SAVE_SCHEMA = 1
export const MAX_SLOTS = ['auto', 'manual1', 'manual2', 'manual3']

export function validateSave(save) {
  const errors = []
  if (!save || typeof save !== 'object' || Array.isArray(save)) {
    return ['存档必须是对象']
  }
  if (save.v !== SAVE_SCHEMA) errors.push(`存档版本必须为 ${SAVE_SCHEMA}`)
  if (typeof save.storyId !== 'string' || !save.storyId) errors.push('缺少 storyId')
  if (typeof save.nodeId !== 'string' || !save.nodeId) errors.push('缺少 nodeId')
  if (!Array.isArray(save.visited)) errors.push('visited 必须是数组')
  if (save.flags !== undefined && (typeof save.flags !== 'object' || Array.isArray(save.flags))) {
    errors.push('flags 必须是对象')
  }
  if (!Array.isArray(save.history)) errors.push('history 必须是数组')
  if (save.snapshots !== undefined && !Array.isArray(save.snapshots)) errors.push('snapshots 必须是数组')
  if (save.history && save.history.length > 500) errors.push('history 过长')
  if (save.snapshots && save.snapshots.length > 50) errors.push('snapshots 最多 50 条')
  return errors
}

export class SaveStore {
  constructor(dir = path.join(dshHome(), 'novel-terminal')) {
    this.dir = dir
    this.file = path.join(dir, 'saves.json')
  }

  async ensure() {
    await ensureDir(this.dir)
  }

  async readAll() {
    await this.ensure()
    const doc = await readJson(this.file, null)
    if (!doc || typeof doc !== 'object' || !doc.slots || typeof doc.slots !== 'object') {
      return { v: 1, slots: {}, updatedAt: null }
    }
    return doc
  }

  async list() {
    const doc = await this.readAll()
    const slots = []
    for (const slot of MAX_SLOTS) {
      const save = doc.slots[slot]
      if (!save) continue
      slots.push({
        slot,
        title: typeof save.title === 'string' ? save.title : slot,
        storyId: save.storyId || null,
        nodeId: save.nodeId || null,
        updatedAt: save.updatedAt || null,
        auto: slot === 'auto',
      })
    }
    return { slots, updatedAt: doc.updatedAt || null }
  }

  async get(slot) {
    const doc = await this.readAll()
    return doc.slots[slot] || null
  }

  async save(slot, save) {
    if (!MAX_SLOTS.includes(slot)) {
      throw new ApiError('invalid_payload', `未知存档槽：${slot}`, 422)
    }
    const errors = validateSave(save)
    if (errors.length > 0) throw new ApiError('invalid_save', errors.join('；'), 422)
    const doc = await this.readAll()
    const payload = JSON.parse(JSON.stringify(save))
    payload.v = SAVE_SCHEMA
    payload.slot = slot
    payload.updatedAt = nowIso()
    if (!payload.createdAt) payload.createdAt = payload.updatedAt
    doc.slots[slot] = payload
    doc.updatedAt = payload.updatedAt
    await writeJsonAtomic(this.file, doc)
    return payload
  }

  async del(slot) {
    const doc = await this.readAll()
    if (!doc.slots[slot]) throw new ApiError('not_found', `存档槽不存在：${slot}`, 404)
    delete doc.slots[slot]
    doc.updatedAt = nowIso()
    await writeJsonAtomic(this.file, doc)
    return { slot }
  }

  async clear() {
    await this.ensure()
    const doc = { v: 1, slots: {}, updatedAt: nowIso() }
    await writeJsonAtomic(this.file, doc)
    return { slots: [], updatedAt: doc.updatedAt }
  }

  async import(save) {
    const errors = validateSave(save)
    if (errors.length > 0) throw new ApiError('invalid_save', errors.join('；'), 422)
    const doc = await this.readAll()
    const used = new Set(Object.keys(doc.slots))
    for (const slot of [...MAX_SLOTS, 'import1', 'import2', 'import3']) {
      if (!used.has(slot)) return await this.saveSlotAny(doc, slot, save)
    }
    return await this.saveSlotAny(doc, `import-${Date.now()}`, save)
  }

  async saveSlotAny(doc, slot, save) {
    const payload = JSON.parse(JSON.stringify(save))
    payload.v = SAVE_SCHEMA
    payload.slot = slot
    payload.updatedAt = nowIso()
    if (!payload.createdAt) payload.createdAt = payload.updatedAt
    doc.slots[slot] = payload
    doc.updatedAt = payload.updatedAt
    await writeJsonAtomic(this.file, doc)
    return payload
  }
}

export async function checkWritable(file) {
  await ensureDir(path.dirname(file))
  try {
    await fsp.access(path.dirname(file))
    return true
  } catch {
    return false
  }
}
