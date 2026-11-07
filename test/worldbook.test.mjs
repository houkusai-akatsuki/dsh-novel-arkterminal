import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeWorldbookImport,
  mergeWorldbook,
  assertWorldbook,
} from '../lib/worldbook.js'

test('worldbook import: plain array', () => {
  const list = normalizeWorldbookImport([
    { title: '延安', body: '黄土高原上的窑洞城。', type: 'place' },
    { id: 'hero', name: '主角', content: '一个角色。' },
  ])
  assert.equal(list.length, 2)
  assert.equal(list[0].type, 'place')
  assert.ok(list[0].id)
  assert.equal(list[1].id, 'hero')
  assert.equal(list[1].title, '主角')
  assert.ok(list[1].summary)
})

test('worldbook import: markdown headings', () => {
  const md = [
    '## 延安',
    '中共中央所在地。',
    '',
    '## 蟠龙铁矿',
    '延安以北的铁矿。',
    '',
    '### 方舟计划',
    '任务目的不明。',
  ].join('\n')
  const list = normalizeWorldbookImport(md)
  assert.equal(list.length, 3)
  assert.equal(list[0].title, '延安')
  assert.equal(list[1].title, '蟠龙铁矿')
  assert.equal(list[2].title, '方舟计划')
  assert.equal(list[0].type, 'other')
})

test('worldbook import: SillyTavern entries object', () => {
  const payload = {
    entries: {
      0: { uid: 1, key: ['终端'], comment: '终端', content: '只有毛泽东能用的平板。', disable: false },
      1: { uid: 2, key: ['废弃'], comment: '废弃条目', content: '不导入', disable: true },
    },
  }
  const list = normalizeWorldbookImport(payload)
  assert.equal(list.length, 1)
  assert.equal(list[0].title, '终端')
  assert.match(list[0].body, /平板/)
})

test('worldbook import: id -> entry map and merge/replace', () => {
  const list = normalizeWorldbookImport({
    'we-a': { title: 'A', body: '甲' },
    'we-b': { title: 'B', body: '乙' },
  })
  assert.equal(list.length, 2)
  const existing = [{ id: 'we-a', title: '旧 A', prompt: '', type: 'other', summary: '' }]
  const incoming = [{ id: 'we-a', title: '新 A', type: 'other', summary: '', body: '新' }, { id: 'we-c', title: 'C', type: 'other', summary: '', body: '丙' }]
  const merged = mergeWorldbook(existing, incoming, 'merge')
  assert.equal(merged.length, 2)
  assert.equal(merged.find((entry) => entry.id === 'we-a').title, '新 A')
  assert.equal(mergeWorldbook(existing, incoming, 'replace').length, 2)
})

test('worldbook import: invalid input and assert', () => {
  assert.deepEqual(normalizeWorldbookImport('not json and no headings'), [])
  assert.deepEqual(normalizeWorldbookImport([]), [])
  assert.throws(() => assertWorldbook([{ id: 'x' }]), /title/)
})
