/**
 * dsh-novel-arkterminal / manuscript importer.
 *
 * Converts author-facing Markdown manuscripts into the terminal's story.json
 * format. Used by the CLI (`scripts/import-manuscript.mjs`) and by the
 * editor's "从 Markdown 导入" route.
 */
import { STORY_SCHEMA, validateStory, validateWorldbook } from './story.js'

const CHOICE_PREFIX = '> '

function cleanHeading(line) {
  return line.replace(/^#{1,4}\s*/, '').trim()
}

/**
 * @param {{name:string,text:string}[]} files
 * @param {{id?:string,title?:string,subtitle?:string,language?:string,worldbook?:any[]}} meta
 */
export function parseManuscript(files, meta = {}) {
  const sorted = [...(files || [])].sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  const nodes = {}
  const order = []
  let chapterIndex = 0
  const storyId = meta.id || 'imported-story'

  const makeNodeId = (explicit) => {
    const base = explicit || `ch-${String(chapterIndex).padStart(2, '0')}`
    let candidate = base
    let suffix = 1
    while (nodes[candidate]) candidate = `${base}-${suffix++}`
    return candidate
  }

  const pushParagraph = (target, text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    target.blocks.push({ type: 'narration', text: trimmed })
  }

  for (const file of sorted) {
    const lines = String(file.text || '').replace(/\r\n?/g, '\n').split('\n')
    let current = null
    let buffer = []
    const flush = () => {
      if (!current || buffer.length === 0) {
        buffer = []
        return
      }
      const text = buffer.join('\n').trim()
      if (text) {
        const paragraphs = text.split(/\n{2,}/)
        for (const paragraph of paragraphs) pushParagraph(current, paragraph)
      }
      buffer = []
    }
    for (const rawLine of lines) {
      const line = rawLine
      if (/^#{1,4}\s+/.test(line)) {
        flush()
        const title = cleanHeading(line)
        chapterIndex += 1
        const nodeId = makeNodeId(null)
        current = {
          id: nodeId,
          chapter: title,
          title,
          blocks: [],
          choices: [],
        }
        nodes[nodeId] = current
        order.push(nodeId)
        continue
      }
      const nodeMarker = line.match(/^<!--\s*node:\s*([\w-]+)\s*-->$/)
      if (nodeMarker) {
        flush()
        chapterIndex += 1
        const nodeId = makeNodeId(nodeMarker[1])
        current = {
          id: nodeId,
          chapter: current ? current.chapter : file.name,
          title: current ? current.chapter : file.name,
          blocks: [],
          choices: [],
        }
        nodes[nodeId] = current
        order.push(nodeId)
        continue
      }
      if (line.startsWith(CHOICE_PREFIX) && current) {
        flush()
        const label = line.slice(CHOICE_PREFIX.length).trim()
        if (label) {
          current.choices.push({ id: `c${current.choices.length + 1}`, label, next: null, ai: true })
        }
        continue
      }
      if (line.trim() === '') {
        flush()
        continue
      }
      buffer.push(line)
    }
    flush()
  }

  if (order.length === 0) {
    order.push('ch-01')
    nodes['ch-01'] = {
      id: 'ch-01',
      chapter: meta.title || '正文',
      title: meta.title || '正文',
      blocks: [{ type: 'narration', text: '（稿件为空，请在 manuscript/ 目录放入 Markdown 后再导入。）' }],
      choices: [],
    }
  }

  // Linear chain: each chapter continues to the next; the last one asks AI to continue.
  order.forEach((nodeId, index) => {
    const node = nodes[nodeId]
    const next = order[index + 1]
    if (next) {
      node.choices = [{ id: 'next', label: '继续', next }]
    } else {
      const existing = Array.isArray(node.choices) && node.choices.length > 0 ? node.choices : []
      node.choices = existing.length > 0
        ? existing.map((choice, i) => ({ ...choice, id: choice.id || `c${i + 1}`, next: null, ai: true }))
        : [{ id: 'continue', label: '继续（AI 续写）', next: null, ai: true }]
      node.input = { enabled: true, placeholder: '自由输入，推动故事…', continueWithAI: true }
    }
  })

  const story = {
    schema: STORY_SCHEMA,
    id: storyId,
    title: meta.title || '方舟终端 · 导入故事',
    subtitle: meta.subtitle || '',
    language: meta.language || 'zh',
    version: 1,
    start: order[0],
    characters: Array.isArray(meta.characters) ? meta.characters : [],
    worldbook: Array.isArray(meta.worldbook) ? meta.worldbook : [],
    nodes,
  }
  return { story, order, chapters: order.length }
}

export function importManuscripts(files, meta = {}) {
  const { story, order } = parseManuscript(files, meta)
  const errors = validateStory(story)
  if (errors.length > 0) {
    const error = new Error(`导入结果校验失败：${errors.slice(0, 8).join('；')}`)
    error.code = 'invalid_story'
    throw error
  }
  const worldbookErrors = validateWorldbook(story.worldbook)
  if (worldbookErrors.length > 0) throw new Error(`世界书校验失败：${worldbookErrors.slice(0, 5).join('；')}`)
  return { story, order, chapters: order.length }
}
