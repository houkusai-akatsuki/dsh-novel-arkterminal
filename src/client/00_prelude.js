/* dsh-novel-arkterminal / client prelude. This file is concatenated into lib/client.js. */

const API = '/dsh-novel-arkterminal/api'
const PREFS_KEY = 'dsh-novel-arkterminal:prefs'
const LEGACY_PREFS_KEY = 'dsh-novel-terminal:prefs'
const PREFS_VERSION = 3

const DEFAULT_PREFS = {
  typingSpeed: 18,          // ms per tick
  fontWeight: 400,
  fontScale: 1,
  dialogueFontScale: 1,
  scanlines: true,
  glow: true,
  reducedMotion: false,
  sound: false,
  soundVolume: 0.25,
  aiMode: 'auto',           // auto | manual | off
  aiProvider: '',
  aiModel: '',
  aiTemperature: 0.8,
  aiTopP: 1,
  aiPresencePenalty: 0,
  aiFrequencyPenalty: 0,
  aiMaxTokens: 2400,
  chapterWords: 800,        // AI continuation target length (Chinese characters)
  prefsVersion: PREFS_VERSION,
  writingStyle: 'default',  // id in BUILTIN_TEMPLATES.style / imported styles / 'default'
  writingLogic: 'default',  // id in BUILTIN_TEMPLATES.logic / imported
  writingCot: 'hidden-chain', // id in BUILTIN_TEMPLATES.cot / imported
  memoryFormat: 'default',  // id in BUILTIN_TEMPLATES.memory / imported
  editorMode: false,
  sideTab: 'goals',
}

function loadPrefs() {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY) || window.localStorage.getItem(LEGACY_PREFS_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    const parsed = JSON.parse(raw)
    const merged = { ...DEFAULT_PREFS, ...(parsed && typeof parsed === 'object' ? parsed : {}) }
    // Clamp persisted values so a stray entry cannot send absurd limits to the model.
    const clampInt = (value, min, max, fallback) => {
      const number = Number(value)
      return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback
    }
    merged.aiMaxTokens = clampInt(merged.aiMaxTokens, 400, 256000, 2400)
    merged.chapterWords = clampInt(merged.chapterWords, 200, 20000, 800)
    const bubbleScale = Number(merged.dialogueFontScale)
    merged.dialogueFontScale = Number.isFinite(bubbleScale) ? Math.min(1.8, Math.max(0.75, bubbleScale)) : 1
    const temperature = Number(merged.aiTemperature)
    merged.aiTemperature = Number.isFinite(temperature) ? Math.min(1.5, Math.max(0, temperature)) : 0.8
    const topP = Number(merged.aiTopP)
    merged.aiTopP = Number.isFinite(topP) ? Math.min(1, Math.max(0, topP)) : 1
    const presencePenalty = Number(merged.aiPresencePenalty)
    merged.aiPresencePenalty = Number.isFinite(presencePenalty) ? Math.min(2, Math.max(-2, presencePenalty)) : 0
    const frequencyPenalty = Number(merged.aiFrequencyPenalty)
    merged.aiFrequencyPenalty = Number.isFinite(frequencyPenalty) ? Math.min(2, Math.max(-2, frequencyPenalty)) : 0
    // v2: the old 1200-token default truncated JSON continuations; bump it once.
    if (!parsed || parsed.prefsVersion !== PREFS_VERSION) {
      if (merged.aiMaxTokens === 1200) merged.aiMaxTokens = 2400
      merged.prefsVersion = PREFS_VERSION
    }
    return merged
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

function writePrefs(next) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable */
  }
}

async function api(path, options) {
  const opts = Object.assign({ method: 'GET' }, options || {})
  if (opts.body !== undefined) {
    opts.headers = Object.assign({ 'content-type': 'application/json' }, opts.headers || {})
    opts.body = JSON.stringify(opts.body)
  }
  let response
  try {
    response = await fetch(API + path, opts)
  } catch (error) {
    const wrapped = new Error('无法连接宿主数据接口：' + (error && error.message ? error.message : '网络错误'))
    wrapped.code = 'network'
    throw wrapped
  }
  let doc = null
  try {
    doc = await response.json()
  } catch {
    doc = null
  }
  if (!response.ok || !doc || doc.ok === false) {
    const info = (doc && doc.error) || {}
    const wrapped = new Error(info.message || ('请求失败：HTTP ' + response.status))
    wrapped.code = info.code || 'http_error'
    wrapped.status = response.status
    throw wrapped
  }
  return doc.data
}

function saveStateFromGame(game, storyTitle, storyId) {
  return {
    v: 1,
    storyId,
    title: storyTitle + ' · ' + new Date().toLocaleString(),
    nodeId: game.nodeId,
    visited: game.visited,
    flags: game.flags,
    history: game.history,
    snapshots: game.snapshots,
    createdAt: game.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function loadGameFromSave(save) {
  return {
    nodeId: save.nodeId,
    visited: Array.isArray(save.visited) ? save.visited : [save.nodeId],
    flags: save.flags && typeof save.flags === 'object' ? save.flags : {},
    history: Array.isArray(save.history) ? save.history : [],
    snapshots: Array.isArray(save.snapshots) ? save.snapshots : [],
    createdAt: save.createdAt || new Date().toISOString(),
  }
}

function textNodesFromBlocks(blocks, worldbook, openEntry) {
  const map = new Map()
  for (const entry of worldbook || []) map.set(entry.id, entry)
  const nodes = []
  ;(blocks || []).forEach((block, index) => {
    const children = []
    const text = String(block && block.text ? block.text : '')
    const pattern = /\[\[([\w:.-]+)\|([^\]]+)\]\]/g
    let last = 0
    let match
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > last) children.push(text.slice(last, match.index))
      const entryId = match[1]
      const label = match[2]
      const entry = map.get(entryId)
      children.push(
        h(
          'button',
          {
            key: 'link-' + index + '-' + match.index,
            className: 'nt-we-link',
            type: 'button',
            title: entry ? entry.title : entryId,
            onClick: () => entry && openEntry(entry),
          },
          label,
        ),
      )
      last = match.index + match[0].length
    }
    if (last < text.length) children.push(text.slice(last))
    const tag = block.type === 'heading' ? 'div' : 'p'
    nodes.push(
      h(
        tag,
        {
          key: 'block-' + index,
          className:
            'nt-block nt-block-' +
            (block.type === 'dialogue' ? 'dialogue' : block.type === 'system' ? 'system' : block.type === 'heading' ? 'heading' : 'narration'),
        },
        block.speaker ? h('span', { className: 'nt-speaker' }, block.speaker + '：') : null,
        children,
      ),
    )
  })
  return nodes
}

function blockText(block) {
  const speaker = block && block.speaker ? block.speaker + '：' : ''
  return speaker + String((block && block.text) || '')
}

function summarizeNode(node, max) {
  const limit = max || 600
  const text = (node && Array.isArray(node.blocks) ? node.blocks : []).map(blockText).join('\n')
  return text.length > limit ? text.slice(0, limit) + '…' : text
}

function beep(freq, durationMs, volume) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const audio = new Ctx()
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'square'
    osc.frequency.value = freq
    gain.gain.value = Math.max(0.0001, Math.min(0.5, volume || 0.2))
    osc.connect(gain)
    gain.connect(audio.destination)
    osc.start()
    osc.stop(audio.currentTime + Math.max(0.02, (durationMs || 40) / 1000))
    setTimeout(() => audio.close().catch(() => {}), 400)
  } catch {
    /* audio is optional */
  }
}

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return String(value)
  }
}
