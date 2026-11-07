/**
 * dsh-novel-arkterminal / worldbook import normalization.
 *
 * Accepts the shapes people actually have on hand:
 *  - [{ id, type, title, summary, body }]
 *  - { worldbook: [...] } / { entries: [...] }
 *  - SillyTavern world-info: { entries: { "0": { key:[], content, comment, uid, disable } } }
 *  - a plain object map: { "id": { title, body } }
 *  - Markdown: one entry per `#`/`##`/`###` heading, heading = title, body = content
 */
import { WORLDBOOK_TYPES, validateWorldbook } from './story.js'
import { clampString } from './util.js'

const MAX_ENTRIES = 500
const TYPE_HINTS = [
  { type: 'person', words: ['人物', '角色', 'person', 'character', 'npc'] },
  { type: 'place', words: ['地点', '场景', 'place', 'location', 'scene'] },
  { type: 'tech', words: ['科技', '技术', '道具', 'tech', 'item', 'device'] },
  { type: 'event', words: ['事件', 'event', 'history', '历史'] },
  { type: 'org', words: ['组织', '势力', 'org', 'faction', 'group'] },
]

function normalizeId(value, fallback) {
  if (typeof value === 'string') {
    const cleaned = value.trim().toLowerCase().replace(/[^\w.:-]+/g, '-').replace(/^-+|-+$/g, '')
    if (cleaned) return cleaned.slice(0, 64)
  }
  return fallback
}

function normalizeType(value, title) {
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase()
    if (WORLDBOOK_TYPES.includes(lower)) return lower
  }
  const haystack = String(title || '').toLowerCase()
  for (const hint of TYPE_HINTS) {
    if (hint.words.some((word) => haystack.includes(word.toLowerCase()))) return hint.type
  }
  return 'other'
}

function firstChars(text, max) {
  const singleLine = String(text || '').replace(/\s+/g, ' ').trim()
  return singleLine.length > max ? singleLine.slice(0, max) + '…' : singleLine
}

function normalizeEntry(raw, index, usedIds) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const title = clampString(
    typeof raw.title === 'string' ? raw.title : typeof raw.name === 'string' ? raw.name : typeof raw.comment === 'string' ? raw.comment : '',
    200,
  ).trim()
  const body = clampString(
    typeof raw.body === 'string' ? raw.body : typeof raw.content === 'string' ? raw.content : typeof raw.text === 'string' ? raw.text : '',
    20000,
  )
  const keys = Array.isArray(raw.key) ? raw.key.filter((key) => typeof key === 'string') : []
  const fallbackTitle = keys[0] || ('条目 ' + (index + 1))
  const finalTitle = title || fallbackTitle
  let id = normalizeId(raw.id || raw.uid, 'wb-' + index)
  while (usedIds.has(id)) id = id + '-' + index
  usedIds.add(id)
  return {
    id,
    type: normalizeType(raw.type, finalTitle),
    title: finalTitle.slice(0, 200),
    summary: clampString(typeof raw.summary === 'string' ? raw.summary : firstChars(body, 120), 400),
    body,
  }
}

function parseMarkdown(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n')
  const sections = []
  let current = null
  let buffer = []
  const flush = () => {
    if (!current) return
    current.body = buffer.join('\n').trim()
    if (current.title) sections.push(current)
    buffer = []
  }
  for (const line of lines) {
    const heading = line.match(/^#{1,4}\s+(.+?)\s*$/)
    if (heading) {
      flush()
      current = { title: heading[1].trim() }
      continue
    }
    if (line.trim() === '---' && current && buffer.length === 0) continue
    buffer.push(line)
  }
  flush()
  const used = new Set()
  return sections.map((section, index) => normalizeEntry(section, index, used)).filter(Boolean)
}

export function normalizeWorldbookImport(input) {
  let data = input
  if (typeof data === 'string') {
    const text = data.trim()
    if (!text) return []
    try {
      data = JSON.parse(text)
    } catch {
      return parseMarkdown(text)
    }
  }
  const used = new Set()
  let raw = []
  if (Array.isArray(data)) raw = data
  else if (data && Array.isArray(data.worldbook)) raw = data.worldbook
  else if (data && Array.isArray(data.entries)) raw = data.entries
  else if (data && data.entries && typeof data.entries === 'object') {
    raw = Object.values(data.entries).filter((entry) => entry && typeof entry === 'object' && !entry.disable)
  } else if (data && typeof data === 'object') {
    raw = Object.entries(data).map(([id, entry]) => (entry && typeof entry === 'object' ? { id, ...entry } : null)).filter(Boolean)
  }
  const list = []
  raw.slice(0, MAX_ENTRIES).forEach((entry, index) => {
    const normalized = normalizeEntry(entry, index, used)
    if (normalized) list.push(normalized)
  })
  return list
}

export function mergeWorldbook(existing, incoming, mode = 'merge') {
  if (mode === 'replace') return incoming.slice(0, MAX_ENTRIES)
  const merged = new Map()
  for (const entry of existing || []) {
    if (entry && typeof entry.id === 'string') merged.set(entry.id, entry)
  }
  for (const entry of incoming || []) {
    if (entry && typeof entry.id === 'string') merged.set(entry.id, entry)
  }
  return [...merged.values()].slice(0, MAX_ENTRIES)
}

export function assertWorldbook(list) {
  const errors = validateWorldbook(list)
  if (errors.length > 0) {
    const error = new Error(errors.slice(0, 6).join('；'))
    error.code = 'invalid_worldbook'
    throw error
  }
  return list
}
