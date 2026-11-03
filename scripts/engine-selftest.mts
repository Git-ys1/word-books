/**
 * 背诵引擎自检脚本（不依赖测试框架，用 tsx 之外的方式跑：
 * 直接用 tsc 编译到临时目录再用 node 执行，避免额外依赖）。
 *
 * 覆盖：
 * 1. sequential 顺序是否真的严格
 * 2. groupShuffle 组间顺序不变、组内被打乱、可从任意组开始且不漏词
 * 3. fullRandom 全书打乱且词量不变
 * 4. 「不认识」是否插到第 N 位、进度是否不变
 * 5. 四选一是否 4 个选项、含正确答案、无重复
 * 6. 进度持久化数据结构是否可 JSON 往返
 */
import assert from 'node:assert/strict'
import { mockBooks } from '../src/data/mock.ts'
import { advance, buildQueue, buildQuiz, createSession, progressDenominator, shuffle } from '../src/engine/queue.ts'

let pass = 0
function ok(name: string, fn: () => void) {
  fn()
  pass++
  console.log(`  ✓ ${name}`)
}

const book1 = mockBooks.book1
const book2 = mockBooks.book2

/** 固定种子的伪随机，保证自检结果可复现 */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

console.log('\n[1] 完全顺序 sequential')
ok('默认从第 1 组开始，严格按词书原始顺序展开', () => {
  const q = buildQueue(book1, 'sequential')
  const expected = book1.groups.flatMap((g) => g.entries.map((e) => e.id))
  assert.deepEqual(q.map((i) => i.entryId), expected)
})
ok('指定分组时只取该组', () => {
  const g = book1.groups[1]
  const q = buildQueue(book1, 'sequential', { groupId: g.id })
  assert.deepEqual(q.map((i) => i.entryId), g.entries.map((e) => e.id))
})
ok('可从任意组开始：前面组接到末尾，不漏词（完全顺序也支持选组）', () => {
  const startIdx = 2
  const q = buildQueue(book1, 'sequential', { startGroupIndex: startIdx })
  const rotated = [...book1.groups.slice(startIdx), ...book1.groups.slice(0, startIdx)]
  const expected = rotated.flatMap((g) => g.entries.map((e) => e.id))
  assert.deepEqual(q.map((i) => i.entryId), expected)
  // 词条总数必须等于全书，一个都不能少
  const total = book1.groups.reduce((n, g) => n + g.entries.length, 0)
  assert.equal(q.length, total)
})
ok('从第 0 组开始等同默认顺序', () => {
  const a = buildQueue(book1, 'sequential', { startGroupIndex: 0 }).map((i) => i.entryId)
  const b = buildQueue(book1, 'sequential').map((i) => i.entryId)
  assert.deepEqual(a, b)
})

console.log('\n[2] 组内随机 groupShuffle')
ok('组间顺序不变，组内被打乱', () => {
  const rng = seeded(42)
  const q = buildQueue(book2, 'groupShuffle', { rng })
  // 每组的词条集合必须与原始一致、且连续成块出现（组间没有交叉）
  let cursor = 0
  for (const g of book2.groups) {
    const block = q.slice(cursor, cursor + g.entries.length).map((i) => i.entryId)
    assert.deepEqual([...block].sort(), g.entries.map((e) => e.id).sort(), `组 ${g.title} 内容不符`)
    cursor += g.entries.length
  }
  assert.equal(cursor, q.length)
  // 至少有一个组内部顺序发生了变化（否则没打乱）
  const changed = book2.groups.some((g, gi) => {
    const start = book2.groups.slice(0, gi).reduce((n, x) => n + x.entries.length, 0)
    const block = q.slice(start, start + g.entries.length).map((i) => i.entryId)
    return JSON.stringify(block) !== JSON.stringify(g.entries.map((e) => e.id))
  })
  assert.ok(changed, '组内没有被打乱')
})
ok('从任意组开始：前面组接在末尾，不漏词', () => {
  const q = buildQueue(book2, 'groupShuffle', { startGroupIndex: 2, rng: seeded(7) })
  const all = book2.groups.flatMap((g) => g.entries.map((e) => e.id)).sort()
  assert.deepEqual(q.map((i) => i.entryId).sort(), all)
})

console.log('\n[3] 完全随机 fullRandom')
ok('全书打乱且词量不变', () => {
  const q = buildQueue(book1, 'fullRandom', { rng: seeded(3) })
  const all = book1.groups.flatMap((g) => g.entries.map((e) => e.id))
  assert.equal(q.length, all.length)
  assert.deepEqual(q.map((i) => i.entryId).sort(), [...all].sort())
  assert.notDeepEqual(q.map((i) => i.entryId), all, '没有被打乱')
})

console.log('\n[4] 「不认识」延后逻辑')
ok('不允许认识：出队并插到第 N 位，进度不变', () => {
  const q = buildQueue(book2, 'sequential', { groupId: book2.groups[0].id })
  const head = q[0].entryId
  const res = advance(q, 'unknown', 8)
  assert.equal(res.masteredDelta, 0)
  assert.equal(res.postponedTo, 9) // 第 9 个位置（前面的 8 个之后）
  assert.equal(res.queue[8].entryId, head, '没有插到第 8 位之后')
  assert.equal(res.queue[8].attempt, 1)
  assert.equal(res.queue.length, q.length, '总数应保持不变')
})
ok('剩余不足 N 个时落到队尾，不丢词', () => {
  const q = buildQueue(book2, 'sequential', { groupId: book2.groups[2].id }).slice(-3)
  const head = q[0].entryId
  const res = advance(q, 'unknown', 8)
  assert.equal(res.queue[res.queue.length - 1].entryId, head)
  assert.equal(res.queue.length, q.length)
})
ok('认识：出队，进度 +1', () => {
  const q = buildQueue(book2, 'sequential', { groupId: book2.groups[0].id })
  const res = advance(q, 'know', 8)
  assert.equal(res.masteredDelta, 1)
  assert.equal(res.queue.length, q.length - 1)
})
ok('同一个词反复不认识会累积 attempt', () => {
  let q = buildQueue(book2, 'sequential', { groupId: book2.groups[2].id })
  const head = q[0].entryId
  q = advance(q, 'unknown', 1).queue
  // 再把它推到队首
  const idx = q.findIndex((i) => i.entryId === head)
  q = [...q.slice(idx), ...q.slice(0, idx)]
  const res = advance(q, 'unknown', 1)
  const item = res.queue.find((i) => i.entryId === head)!
  assert.equal(item.attempt, 2)
})
ok('retryGap 会被夹到 2~20（1 等于立刻重问，无意义）', () => {
  const q = buildQueue(book2, 'sequential', { groupId: book2.groups[0].id })
  const head = q[0].entryId
  // gap=0 → 夹成 2，插在剩余队列第 2 个之后（下标 2），而不是原地不动
  const r = advance(q, 'unknown', 0)
  assert.equal(r.queue[2].entryId, head)
  assert.equal(r.postponedTo, 3)
  // 超长 → 队尾
  assert.equal(advance(q, 'unknown', 999).postponedTo, q.length)
})

console.log('\n[5] 四选一')
ok('生成 4 个不重复选项且包含正确答案', () => {
  const pool = book2.groups.flatMap((g) => g.entries)
  const q = buildQuiz(pool[0].id, pool, seeded(11))!
  assert.equal(q.options.length, 4)
  assert.equal(new Set(q.options).size, 4)
  assert.ok(q.options.includes(q.answerId))
  assert.equal(q.answerId, pool[0].id)
})
ok('干扰项释义不与正确答案重复', () => {
  const pool = book2.groups.flatMap((g) => g.entries)
  const answers = new Set<string>()
  for (const e of pool.slice(0, 20)) {
    const q = buildQuiz(e.id, pool, seeded(e.id.length * 13))!
    for (const id of q.options) {
      const opt = pool.find((x) => x.id === id)!
      answers.add(opt.meaning)
    }
    const meanings = q.options.map((id) => pool.find((x) => x.id === id)!.meaning)
    assert.equal(new Set(meanings).size, 4, '出现了重复释义选项')
  }
  assert.ok(answers.size > 0)
})

console.log('\n[6] 会话与持久化')
ok('createSession 初始状态正确', () => {
  const s = createSession({ book: book1, mode: 'fullRandom' })
  assert.equal(s.total, book1.groups.flatMap((g) => g.entries).length)
  assert.equal(s.mastered, 0)
  assert.equal(s.queue.length, s.total)
  assert.equal(s.stage, 'quiz') // 完全随机直接考中文
  const s2 = createSession({ book: book1, mode: 'sequential' })
  assert.equal(s2.stage, 'judge') // 其它模式先看词判断
})
ok('会话可 JSON 往返（localStorage 持久化前提）', () => {
  const s = createSession({ book: book2, mode: 'groupShuffle', startGroupIndex: 1, rng: seeded(5) })
  const back = JSON.parse(JSON.stringify(s))
  assert.deepEqual(back, s)
})
ok('progressDenominator 不会因错词回锅而倒退', () => {
  let s = createSession({ book: book2, mode: 'sequential', groupId: book2.groups[0].id })
  s = { ...s, queue: advance(s.queue, 'unknown', 8).queue }
  assert.ok(progressDenominator(s) >= s.total)
})
ok('shuffle 不修改原数组', () => {
  const src = [1, 2, 3, 4, 5]
  const out = shuffle(src)
  assert.deepEqual(src, [1, 2, 3, 4, 5])
  assert.deepEqual([...out].sort(), [1, 2, 3, 4, 5])
})

console.log(`\n全部通过：${pass} 项断言组\n`)
