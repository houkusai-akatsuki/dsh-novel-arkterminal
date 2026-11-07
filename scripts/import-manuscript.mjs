/**
 * Import Markdown manuscripts into a story package.
 *
 * Usage:
 *   node scripts/import-manuscript.mjs
 *   node scripts/import-manuscript.mjs --root "F:/Harness/asi-1939/terminal" --title "我的故事"
 *
 * It reads <root>/manuscript/*.md (excluding README.md), validates the result,
 * backs the previous story.json up into <root>/backups/, then writes
 * <root>/story.json (+ <root>/worldbook.json if provided/existing).
 */
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { importManuscripts } from '../lib/importer.js'
import { readFileOr, stamp, writeJsonAtomic, ensureDir, readJson } from '../lib/util.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..', '..')

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (!item.startsWith('--')) continue
    const key = item.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      args[key] = next
      i += 1
    } else {
      args[key] = true
    }
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const root = path.resolve(args.root || path.join(repoRoot, 'asi-1939', 'terminal'))
const manuscriptDir = path.resolve(args.dir || path.join(root, 'manuscript'))
const storyFile = path.join(root, 'story.json')
const worldbookFile = path.join(root, 'worldbook.json')
const backupsDir = path.join(root, 'backups')

await ensureDir(backupsDir)

let names = []
try {
  names = (await fsp.readdir(manuscriptDir))
    .filter((name) => name.endsWith('.md') && !/^readme/i.test(name))
    .sort()
} catch (error) {
  console.error('[import] 无法读取稿件目录:', manuscriptDir)
  process.exitCode = 1
  throw error
}

if (names.length === 0) {
  console.error('[import] manuscript/ 中没有可导入的 .md 稿件（README.md 会被忽略）。')
  process.exitCode = 1
  process.exit()
}

const files = []
for (const name of names) {
  files.push({ name, text: await readFileOr(path.join(manuscriptDir, name), '') })
}

const existingWorldbook = await readJson(worldbookFile, [])
const meta = {
  id: typeof args.id === 'string' ? args.id : 'imported-story',
  title: typeof args.title === 'string' ? args.title : '导入故事',
  subtitle: typeof args.subtitle === 'string' ? args.subtitle : '',
  language: 'zh',
  worldbook: Array.isArray(existingWorldbook) ? existingWorldbook : [],
}

const imported = importManuscripts(files, meta)
console.log(`[import] ${files.length} 个稿件文件 → ${imported.chapters} 个章节节点`)

const previous = await readFileOr(storyFile, null)
if (previous !== null) {
  const backup = path.join(backupsDir, `${stamp()}-${Date.now()}.json`)
  try {
    await writeJsonAtomic(backup, { at: new Date().toISOString(), story: JSON.parse(previous), worldbook: meta.worldbook })
    console.log('[import] 已备份旧 story.json →', backup)
  } catch {
    console.warn('[import] 旧 story.json 无法解析，跳过备份')
  }
}

await writeJsonAtomic(storyFile, imported.story)
if (Array.isArray(meta.worldbook) && meta.worldbook.length > 0) {
  await writeJsonAtomic(worldbookFile, meta.worldbook)
}
console.log('[import] 已写入:', storyFile)
console.log(`[import] 起始节点: ${imported.story.start} · id: ${imported.story.id}`)
