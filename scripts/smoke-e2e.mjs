/**
 * Local end-to-end smoke test for the live host routes.
 * It never generates story text and never imports manuscripts content.
 *
 *   node scripts/smoke-e2e.mjs [baseUrl]
 */
const base = (process.argv[2] || 'http://127.0.0.1:65501/dsh-novel-arkterminal/api').replace(/\/$/, '')

let passed = 0
let failed = 0

async function call(path, options) {
  const response = await fetch(base + path, options)
  const doc = await response.json().catch(() => null)
  return { status: response.status, doc }
}

function check(name, condition, detail) {
  if (condition) {
    passed += 1
    console.log(`PASS  ${name}`)
  } else {
    failed += 1
    console.log(`FAIL  ${name}${detail ? ' :: ' + detail : ''}`)
  }
}

const health = await call('/health')
check('health ok', health.status === 200 && health.doc && health.doc.ok)
check('story root writable workspace', health.doc && health.doc.data.storyRootKind === 'workspace' && health.doc.data.writable === true, JSON.stringify(health.doc && health.doc.data && { root: health.doc.data.storyRoot, kind: health.doc.data.storyRootKind }))
check('llm available', health.doc && health.doc.data.llm && health.doc.data.llm.available === true)

const boot = await call('/bootstrap')
check('bootstrap ok', boot.status === 200 && boot.doc && boot.doc.ok && boot.doc.data.story)
const data = boot.doc && boot.doc.data
check('bootstrap has memory/plans/paths', Boolean(data && typeof data.memory === 'string' && Array.isArray(data.plans) && data.paths && data.paths.writable))

// Editor conflict: deliberately wrong baseVersion must be rejected without writing.
if (data) {
  const conflict = await call('/story', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ story: data.story, worldbook: data.worldbook, baseVersion: 'deadbeef' }),
  })
  check('editor conflict rejected', conflict.status === 409 && conflict.doc && conflict.doc.error && conflict.doc.error.code === 'conflict_version', JSON.stringify(conflict.doc && conflict.doc.error))
}

// Manuscript import must refuse when only README.md exists.
const importAttempt = await call('/story/import', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({}),
})
check('empty manuscript import refused', importAttempt.status === 422 && importAttempt.doc && importAttempt.doc.error && importAttempt.doc.error.code === 'invalid_payload', JSON.stringify(importAttempt.doc && importAttempt.doc.error))

// Saves are read-only in smoke: never overwrite or delete the user's slots.
const savesList = await call('/saves')
check('saves list', savesList.status === 200 && savesList.doc && savesList.doc.ok && Array.isArray(savesList.doc.data.slots))
for (const slot of (savesList.doc && savesList.doc.data && savesList.doc.data.slots) || []) {
  const loaded = await call('/save?slot=' + encodeURIComponent(slot.slot))
  check('save read ' + slot.slot, loaded.status === 200 && loaded.doc && loaded.doc.ok && loaded.doc.data.save)
}

// Plans + memory read/write round-trip (same content, no story text).
if (data) {
  const plansWrite = await call('/plans', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ plans: data.plans }),
  })
  check('plans write', plansWrite.status === 200 && plansWrite.doc && plansWrite.doc.ok)
  const memoryWrite = await call('/memory', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ memory: data.memory }),
  })
  check('memory write', memoryWrite.status === 200 && memoryWrite.doc && memoryWrite.doc.ok)
}

// Writing-style templates round-trip.
const stylesRead = await call('/styles')
check('styles read', stylesRead.status === 200 && stylesRead.doc && stylesRead.doc.ok && Array.isArray(stylesRead.doc.data.styles))
if (stylesRead.status === 200 && stylesRead.doc && stylesRead.doc.ok) {
  const stylesWrite = await call('/styles', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ styles: stylesRead.doc.data.styles }),
  })
  check('styles write', stylesWrite.status === 200 && stylesWrite.doc && stylesWrite.doc.ok && Array.isArray(stylesWrite.doc.data.styles))
}

// Worldbook import round-trip; restore the original list afterwards.
const wbBefore = await call('/worldbook')
check('worldbook read', wbBefore.status === 200 && wbBefore.doc && wbBefore.doc.ok && Array.isArray(wbBefore.doc.data.worldbook))
if (wbBefore.status === 200 && wbBefore.doc && wbBefore.doc.ok && data) {
  const wbImport = await call('/worldbook/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: '## 冒烟条目\n这是一条导入测试。',
      mode: 'merge',
      baseVersion: data.meta.version,
    }),
  })
  check('worldbook import', wbImport.status === 200 && wbImport.doc && wbImport.doc.ok && wbImport.doc.data.imported >= 1, JSON.stringify(wbImport.doc && wbImport.doc.error))
  if (wbImport.status === 200 && wbImport.doc && wbImport.doc.ok) {
    const restored = await call('/worldbook', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ worldbook: wbBefore.doc.data.worldbook, baseVersion: wbImport.doc.data.version }),
    })
    check('worldbook restored', restored.status === 200 && restored.doc && restored.doc.ok)
    if (!(restored.status === 200 && restored.doc && restored.doc.ok)) {
      const fallback = await call('/worldbook/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: JSON.stringify(wbBefore.doc.data.worldbook),
          mode: 'replace',
          baseVersion: wbImport.doc.data.version,
        }),
      })
      check('worldbook restored (import fallback)', fallback.status === 200 && fallback.doc && fallback.doc.ok)
    }
    const wbAfter = await call('/worldbook')
    check('worldbook restored count', wbAfter.status === 200 && wbAfter.doc && wbAfter.doc.ok && wbAfter.doc.data.worldbook.length === wbBefore.doc.data.worldbook.length)
  }
}

// Reset route round-trip (plans + memory), restoring the original values afterwards.
if (data) {
  const resetResult = await call('/reset', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reset: { plans: true, memory: true } }),
  })
  check('reset plans/memory', resetResult.status === 200 && resetResult.doc && resetResult.doc.ok && resetResult.doc.data.reset.plans === true && resetResult.doc.data.reset.memory === true)
  const restorePlans = await call('/plans', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ plans: data.plans }),
  })
  const restoreMemory = await call('/memory', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ memory: data.memory }),
  })
  check('reset state restored', restorePlans.status === 200 && restoreMemory.status === 200)
  const after = await call('/bootstrap')
  check('reset state verified', after.status === 200 && after.doc && after.doc.ok &&
    after.doc.data.plans.length === data.plans.length &&
    after.doc.data.memory === data.memory &&
    after.doc.data.saves.slots.length === data.saves.slots.length)
}

// AI route availability only; do not call /ai/continue (that would write generated story text).
const aiConfig = await call('/ai/config')
check('ai config available', aiConfig.status === 200 && aiConfig.doc && aiConfig.doc.ok && aiConfig.doc.data.available === true, JSON.stringify(aiConfig.doc && aiConfig.doc.data && { available: aiConfig.doc.data.available, reason: aiConfig.doc.data.reason }))

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
