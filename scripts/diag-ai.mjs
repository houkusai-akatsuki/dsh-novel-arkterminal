/**
 * Diagnostic: one AI continuation call against the live plugin, then restore
 * every mutated story file. Prints what the job returned (error/raw) so a
 * failure can be diagnosed without leaving generated story content behind.
 *
 *   node scripts/diag-ai.mjs [baseUrl]
 */
import { readFile, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const terminal = path.resolve(here, '..', '..', '..', 'asi-1939', 'terminal')
const base = (process.argv[2] || 'http://127.0.0.1:53909/dsh-novel-arkterminal/api').replace(/\/$/, '')

const readSnap = async (file) => {
  try { return await readFile(path.join(terminal, file), 'utf8') } catch { return null }
}
const snapshots = {
  memory: await readSnap('memory.md'),
  plans: await readSnap('plans.json'),
  generated: await readSnap(path.join('generated', 'continuations.jsonl')),
}

async function call(pathname, options) {
  const response = await fetch(base + pathname, options)
  const doc = await response.json().catch(() => null)
  return { status: response.status, doc }
}

const headers = { 'content-type': 'application/json' }
const body = {
  parentId: 'empty',
  action: { type: 'input', text: '继续故事' },
  recent: [],
  prefs: {
    temperature: 0.8,
    maxTokens: 2400,
    cot: {
      id: 'hidden-chain',
      name: '精简思维链（隐藏）',
      prompt: '思维链采用单行箭头链，例如：[解析] -> [规划] -> [执行] -> [审查]。禁止换行；只写入 JSON 的 reasoning 字段。',
    },
  },
}

let start = null
let job = null
try {
  start = await call('/ai/continue', { method: 'POST', headers, body: JSON.stringify(body) })
  if (start.status === 200 && start.doc && start.doc.ok) {
    const jobId = start.doc.data.jobId
    for (let i = 0; i < 150; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const current = await call('/ai/job?id=' + encodeURIComponent(jobId))
      job = current.doc && current.doc.data ? current.doc.data : null
      if (job && job.status !== 'running') break
    }
  }
  console.log(JSON.stringify({
    continueStatus: start && start.status,
    continueError: start && start.doc && start.doc.error,
    jobStatus: job && job.status,
    jobError: job && job.error,
    nodeId: job && job.nodeId,
    usage: job && job.usage,
    payloadFields: job && job.payload ? Object.keys(job.payload) : null,
    reasoningPreview: job && job.payload && job.payload.reasoning ? job.payload.reasoning.slice(0, 200) : null,
    rawPreview: job && job.raw ? job.raw.slice(0, 1200) : null,
    generatedBefore: snapshots.generated ? snapshots.generated.split('\n').filter(Boolean).length : 0,
  }, null, 2))
} finally {
  if (snapshots.memory !== null) await writeFile(path.join(terminal, 'memory.md'), snapshots.memory, 'utf8')
  if (snapshots.plans !== null) await writeFile(path.join(terminal, 'plans.json'), snapshots.plans, 'utf8')
  if (snapshots.generated === null) await rm(path.join(terminal, 'generated', 'continuations.jsonl'), { force: true })
  else await writeFile(path.join(terminal, 'generated', 'continuations.jsonl'), snapshots.generated, 'utf8')
  console.log('restored memory/plans/generated snapshot')
}
