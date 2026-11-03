/**
 * 学习记录（统计 / 错词本）+ 进度备份的自检脚本。
 *
 * 为什么单独一个脚本：它测的是纯函数（engine/recall.ts、lib/backup.ts 的校验部分），
 * 不碰 localStorage、不碰 DOM，可直接被 node 执行；而 engine/queue.ts 的 selftest
 * 属于背诵引擎核心，两者职责分开，互不影响。
 *
 * 运行：npm run selftest:recall
 */
import assert from 'node:assert/strict'
import {
  addStudyMs,
  createEmptyStore,
  recordEvent,
  sanitizeStore,
  sortWrongList,
  wrongLevel,
} from '../src/engine/recall.ts'
import type { RecallEvent } from '../src/engine/recall.ts'
import { backupFileName, parseBackup } from '../src/lib/backupFormat.ts'

let pass = 0
function ok(name: string, fn: () => void) {
  fn()
  pass++
  console.log(`  ✓ ${name}`)
}

const T0 = 1_700_000_000_000

function ev(over: Partial<RecallEvent> = {}): RecallEvent {
  return {
    bookId: 'book1',
    entryId: 'book1:act:act',
    word: 'act',
    meaning: 'v.行动',
    root: 'act',
    verdict: 'know',
    drill: false,
    ...over,
  }
}

console.log('\n[1] 统计：已学词数 / 词次')
ok('认识一次：已学 +1、词次 +1', () => {
  const s = recordEvent(createEmptyStore(), ev(), T0)
  assert.equal(s.stats.book1.learnedIds.length, 1)
  assert.equal(s.stats.book1.reviews, 1)
  assert.equal(s.stats.book1.updatedAt, T0)
})
ok('同一个词认识两次：已学仍是 1（去重），词次是 2', () => {
  let s = recordEvent(createEmptyStore(), ev(), T0)
  s = recordEvent(s, ev(), T0 + 1)
  assert.equal(s.stats.book1.learnedIds.length, 1, '已学词数被重复计数')
  assert.equal(s.stats.book1.reviews, 2)
})
ok('不认识不算已学，但算一次词次', () => {
  const s = recordEvent(createEmptyStore(), ev({ verdict: 'unknown' }), T0)
  assert.equal(s.stats.book1.learnedIds.length, 0)
  assert.equal(s.stats.book1.reviews, 1)
})
ok('两本书的统计互相独立', () => {
  let s = recordEvent(createEmptyStore(), ev(), T0)
  s = recordEvent(s, ev({ bookId: 'book2', entryId: 'b2:x', word: 'x' }), T0)
  assert.equal(s.stats.book1.learnedIds.length, 1)
  assert.equal(s.stats.book2.learnedIds.length, 1)
  assert.deepEqual(s.wrong.book1, [])
  assert.deepEqual(s.wrong.book2, [])
})

console.log('\n[2] 学习时长')
ok('正常累加', () => {
  let s = createEmptyStore()
  s = addStudyMs(s, 'book1', 30_000)
  s = addStudyMs(s, 'book1', 12_000)
  assert.equal(s.stats.book1.studyMs, 42_000)
})
ok('单次最多记 5 分钟（后台挂机不刷时长）', () => {
  const s = addStudyMs(createEmptyStore(), 'book1', 8 * 3600_000)
  assert.equal(s.stats.book1.studyMs, 5 * 60_000)
})
ok('负数 / NaN 直接丢弃，不倒扣', () => {
  let s = addStudyMs(createEmptyStore(), 'book1', 10_000)
  s = addStudyMs(s, 'book1', -99_999)
  s = addStudyMs(s, 'book1', Number.NaN)
  assert.equal(s.stats.book1.studyMs, 10_000)
})

console.log('\n[3] 错词本')
ok('答错入本，次数累计', () => {
  let s = recordEvent(createEmptyStore(), ev({ verdict: 'unknown' }), T0)
  s = recordEvent(s, ev({ verdict: 'unknown' }), T0 + 1)
  assert.equal(s.wrong.book1.length, 1)
  assert.equal(s.wrong.book1[0].count, 2)
  assert.equal(s.wrong.book1[0].lastAt, T0 + 1)
})
ok('普通会话答对：整条移出错词本', () => {
  let s = recordEvent(createEmptyStore(), ev({ verdict: 'unknown' }), T0)
  s = recordEvent(s, ev({ verdict: 'know', drill: false }), T0 + 1)
  assert.equal(s.wrong.book1.length, 0)
})
ok('错词复习答对：只减 1 次，归零才移除', () => {
  let s = recordEvent(createEmptyStore(), ev({ verdict: 'unknown' }), T0)
  s = recordEvent(s, ev({ verdict: 'unknown' }), T0 + 1)
  assert.equal(s.wrong.book1[0].count, 2)
  s = recordEvent(s, ev({ verdict: 'know', drill: true }), T0 + 2)
  assert.equal(s.wrong.book1[0].count, 1, '专项复习不该一次抹掉全部次数')
  s = recordEvent(s, ev({ verdict: 'know', drill: true }), T0 + 3)
  assert.equal(s.wrong.book1.length, 0, '次数归零后应移除')
})
ok('错词复习里答错：继续 +1', () => {
  let s = recordEvent(createEmptyStore(), ev({ verdict: 'unknown' }), T0)
  s = recordEvent(s, ev({ verdict: 'unknown', drill: true }), T0 + 1)
  assert.equal(s.wrong.book1[0].count, 2)
})
ok('错词本按出错次数降序排序（同次数按最近出错时间）', () => {
  let s = createEmptyStore()
  s = recordEvent(s, ev({ entryId: 'a', word: 'a', verdict: 'unknown' }), T0)
  s = recordEvent(s, ev({ entryId: 'b', word: 'b', verdict: 'unknown' }), T0)
  s = recordEvent(s, ev({ entryId: 'b', word: 'b', verdict: 'unknown' }), T0)
  s = recordEvent(s, ev({ entryId: 'c', word: 'c', verdict: 'unknown' }), T0)
  const sorted = sortWrongList(s.wrong.book1)
  assert.equal(sorted[0].id, 'b', '错 2 次的应排第一')
  assert.deepEqual(sorted.map((w) => w.count), [2, 1, 1])
})
ok('错误等级分档：1 次低、2~3 次中、4 次以上高', () => {
  assert.equal(wrongLevel(1), 'low')
  assert.equal(wrongLevel(2), 'mid')
  assert.equal(wrongLevel(3), 'mid')
  assert.equal(wrongLevel(4), 'high')
})

console.log('\n[4] 读取旧数据 / 脏数据的容错')
ok('垃圾输入回落成空结构，不抛异常', () => {
  assert.deepEqual(sanitizeStore(null), createEmptyStore())
  assert.deepEqual(sanitizeStore('oops'), createEmptyStore())
  assert.deepEqual(sanitizeStore({ stats: 1, wrong: 'x' }), createEmptyStore())
})
ok('半截数据被修复：缺字段补空、负数纠正', () => {
  const s = sanitizeStore({
    stats: { book1: { learnedIds: ['a', 3, null], reviews: -5, studyMs: 'x' } },
    wrong: { book2: [{ id: 'b', word: 'b', count: -1 }, { word: '没 id 的' }] },
  })
  assert.deepEqual(s.stats.book1.learnedIds, ['a'])
  assert.equal(s.stats.book1.reviews, 0)
  assert.equal(s.stats.book1.studyMs, 0)
  assert.equal(s.wrong.book2.length, 1)
  assert.equal(s.wrong.book2[0].count, 1)
  assert.deepEqual(s.stats.book2, { learnedIds: [], reviews: 0, studyMs: 0, updatedAt: 0 })
})
ok('recordEvent 不修改入参（纯函数）', () => {
  const base = createEmptyStore()
  const snapshot = JSON.stringify(base)
  recordEvent(base, ev({ verdict: 'unknown' }), T0)
  assert.equal(JSON.stringify(base), snapshot)
})
ok('整体可 JSON 往返（localStorage 持久化前提）', () => {
  let s = recordEvent(createEmptyStore(), ev({ verdict: 'unknown' }), T0)
  s = addStudyMs(s, 'book1', 5000)
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s)
})

console.log('\n[5] 进度备份：导出文件名 / 导入校验')
ok('文件名带日期：word-books-backup-YYYY-MM-DD.json', () => {
  const name = backupFileName(new Date(2026, 10, 3, 20, 15))
  assert.equal(name, 'word-books-backup-2026-11-03.json')
})
ok('合法备份能解析，且只保留白名单内的键', () => {
  const text = JSON.stringify({
    app: 'word-books',
    version: 1,
    exportedAt: '2026-11-03T12:15:00.000Z',
    keys: { session: { a: 1 }, settings: { retryGap: 8 }, stats: { book1: {} }, evil: 'x' },
  })
  const r = parseBackup(text)
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.deepEqual(r.keys, ['session', 'settings', 'stats'])
  assert.equal((r.file.keys as Record<string, unknown>).evil, undefined, '白名单外的键必须被丢弃')
  assert.equal(r.file.exportedAt, '2026-11-03T12:15:00.000Z')
})
ok('JSON 坏了：提示是格式问题', () => {
  const r = parseBackup('{ not json ')
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.match(r.message, /JSON/)
})
ok('不是本应用的备份：按 app 标记拒绝', () => {
  const r = parseBackup(JSON.stringify({ version: 1, keys: { session: {} } }))
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.match(r.message, /app/)
})
ok('缺 version 字段：拒绝', () => {
  const r = parseBackup(JSON.stringify({ app: 'word-books', keys: { session: {} } }))
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.match(r.message, /version/)
})
ok('版本高于当前支持：拒绝并提示升级', () => {
  const r = parseBackup(JSON.stringify({ app: 'word-books', version: 99, keys: { session: {} } }))
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.match(r.message, /版本/)
})
ok('没有认识的键：拒绝', () => {
  const r = parseBackup(JSON.stringify({ app: 'word-books', version: 1, keys: { unknownKey: 1 } }))
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.match(r.message, /没有任何本应用认识/)
})
ok('数组 / 空值等异形输入不会抛异常', () => {
  for (const bad of ['[]', 'null', '"str"', '123', '{}']) {
    assert.equal(parseBackup(bad).ok, false, `应拒绝：${bad}`)
  }
})

console.log(`\n学习记录自检全部通过：${pass} 项断言组\n`)
