/**
 * UI 渲染冒烟测试：用 react-dom/server 把关键界面渲染成 HTML 字符串，
 * 验证组件树能真实产出 DOM 结构（而不只是「TypeScript 编译通过」）。
 *
 * 覆盖：
 * - 首页：选书（含统计卡）、模式选择
 * - 背诵页：第一阶段（认识/不认识）、完全随机（四选一）
 * - 错词本：数量、列表、专项复习按钮、空态
 * - 课外词书浏览：分组标题、搜索框、展开列表
 * - 设置面板：导出/导入按钮、清空确认
 * 这里不需要浏览器，Node 环境即可跑，适合放进 CI。
 */
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import BookBrowser from '../src/components/BookBrowser.tsx'
import Home from '../src/components/Home.tsx'
import ReciteSession from '../src/components/ReciteSession.tsx'
import SettingsSheet from '../src/components/SettingsSheet.tsx'
import WrongBook from '../src/components/WrongBook.tsx'
import { BOOK_META, buildEntryIndex, flattenEntries } from '../src/data/index.ts'
import { mockBooks } from '../src/data/mock.ts'
import { DEFAULT_SETTINGS, createSession } from '../src/engine/queue.ts'
import type { WrongWord } from '../src/engine/recall.ts'
import type { BookCard, BookStatsView } from '../src/components/Home.tsx'
import type { BookId } from '../src/types.ts'

let pass = 0
function ok(name: string, fn: () => void) {
  fn()
  pass++
  console.log(`  ✓ ${name}`)
}

/**
 * 异步加载改造后，data/index.ts 不再同步导出 books。
 * 冒烟测试直接拿 mockBooks（结构与真实词书同构），保证测试永远可跑、不依赖网络。
 */
const book = mockBooks.book1
const entryIndex = buildEntryIndex(book)
const allEntries = flattenEntries(book)
const noop = () => {}

const books = {
  book1: {
    ...BOOK_META.book1,
    name: book.name,
    isMock: false,
    count: allEntries.length,
    book,
  },
  book2: {
    ...BOOK_META.book2,
    name: mockBooks.book2.name,
    isMock: false,
    count: flattenEntries(mockBooks.book2).length,
    book: mockBooks.book2,
  },
} as Record<BookId, BookCard>

const emptyStats: Record<BookId, BookStatsView> = {
  book1: { learned: 0, reviews: 0, studyMs: 0, wrongCount: 0 },
  book2: { learned: 0, reviews: 0, studyMs: 0, wrongCount: 0 },
}

console.log('\n[渲染] 首页')
ok('渲染出两本词书与选书步骤', () => {
  const html = renderToStaticMarkup(
    h(Home, {
      books,
      settings: DEFAULT_SETTINGS,
      stats: emptyStats,
      pendingSession: null,
      onResume: noop,
      onStart: noop,
      onOpenSettings: noop,
      onOpenBrowse: noop,
      onOpenWrongBook: noop,
    }),
  )
  assert.ok(html.includes('背单词'), '缺少标题')
  assert.ok(html.includes('选择词书'), '缺少选书步骤')
  assert.ok(html.includes(books.book1.name), '缺少书1')
  assert.ok(html.includes(books.book2.name), '缺少书2')
})

console.log('\n[渲染] 首页统计卡')
ok('展示已学/总数、进度条、时长、词次、错词数与两个入口', () => {
  const stats: Record<BookId, BookStatsView> = {
    book1: { learned: 37, reviews: 120, studyMs: 95 * 60 * 1000, wrongCount: 5 },
    book2: { learned: 0, reviews: 0, studyMs: 0, wrongCount: 0 },
  }
  const html = renderToStaticMarkup(
    h(Home, {
      books,
      settings: DEFAULT_SETTINGS,
      stats,
      pendingSession: null,
      onResume: noop,
      onStart: noop,
      onOpenSettings: noop,
      onOpenBrowse: noop,
      onOpenWrongBook: noop,
    }),
  )
  assert.ok(html.includes('已学'), '缺少「已学」标签')
  assert.ok(html.includes('>37<'), '缺少已学词数 37')
  assert.ok(html.includes('1h35m'), '缺少时长格式化结果 1h35m')
  assert.ok(html.includes('>120<'), '缺少累计词次 120')
  assert.ok(html.includes('学习时长') && html.includes('词次'), '缺少统计标签')
  assert.ok(html.includes('浏览词书'), '缺少浏览词书入口')
  assert.ok(html.includes('错词本'), '缺少错词本入口')
  // 进度条宽度按 已学/总词数 计算，必须出现 width 百分比样式
  assert.ok(/width:\s*\d+%/.test(html), '缺少进度条宽度样式')
})

console.log('\n[渲染] 第一阶段（顺序模式，认识/不认识）')
ok('渲染出单词、进度、拆解按钮、两个判定按钮', () => {
  const session = createSession({ book, mode: 'sequential' })
  const first = session.queue[0].entryId
  const entry = entryIndex.get(first)!
  const html = renderToStaticMarkup(
    h(ReciteSession, {
      book,
      entryIndex,
      allEntries,
      session,
      settings: DEFAULT_SETTINGS,
      onChange: noop,
      onExit: noop,
    }),
  )
  assert.ok(html.includes(entry.word), '缺少单词大字')
  assert.ok(html.includes(`/${session.total}`), '缺少进度分母')
  assert.ok(html.includes('拆解'), '缺少拆解按钮')
  assert.ok(html.includes('认识') && html.includes('不认识'), '缺少判定按钮')
  assert.ok(!html.includes('选出正确的中文释义'), '第一阶段不应出现四选一题干')
})

console.log('\n[渲染] 完全随机模式（四选一）')
ok('底部换成 4 个中文释义选项，不再有认识/不认识', () => {
  const session = createSession({ book, mode: 'fullRandom' })
  const html = renderToStaticMarkup(
    h(ReciteSession, {
      book,
      entryIndex,
      allEntries,
      session,
      settings: DEFAULT_SETTINGS,
      onChange: noop,
      onExit: noop,
    }),
  )
  assert.ok(html.includes('选出正确的中文释义'), '缺少四选一题干')
  const options = (html.match(/rounded-2xl border px-4 py-3\.5/g) ?? []).length
  assert.equal(options, 4, `选项数量应为 4，实际 ${options}`)
  assert.ok(!html.includes('>不认识<'), '完全随机模式不应出现「不认识」按钮')
})

console.log('\n[渲染] 词缀展示')
ok('右上角出现词根标记', () => {
  const session = createSession({ book, mode: 'sequential' })
  const entry = entryIndex.get(session.queue[0].entryId)!
  if (!entry.root) return
  const html = renderToStaticMarkup(
    h(ReciteSession, { book, entryIndex, allEntries, session, settings: DEFAULT_SETTINGS, onChange: noop, onExit: noop }),
  )
  assert.ok(html.includes(entry.root), '缺少词根标记')
})

console.log('\n[渲染] 错词本')
const sampleWrong: WrongWord[] = [
  { id: allEntries[0].id, word: allEntries[0].word, meaning: allEntries[0].meaning, root: allEntries[0].root, count: 5, lastAt: 1 },
  { id: allEntries[1].id, word: allEntries[1].word, meaning: allEntries[1].meaning, count: 2, lastAt: 2 },
]
ok('展示错词数、累计出错、列表与专项复习按钮', () => {
  const html = renderToStaticMarkup(
    h(WrongBook, {
      bookId: 'book1',
      bookName: book.name,
      list: sampleWrong,
      entryIndex,
      onBack: noop,
      onReview: noop,
    }),
  )
  assert.ok(html.includes('错词本'), '缺少标题')
  assert.ok(html.includes(sampleWrong[0].word), '缺少错词单词')
  assert.ok(html.includes('错 5 次'), '缺少错误次数徽标')
  assert.ok(html.includes('累计出错'), '缺少累计出错统计')
  assert.ok(html.includes('专项复习'), '缺少专项复习入口')
  // 默认展开第一条，应该直接能看到拆解内容
  assert.ok(html.includes('词根') || html.includes('释义') || html.includes('词缀'), '展开区没有拆解内容')
})
ok('错词本为空时给出空态且不显示复习按钮', () => {
  const html = renderToStaticMarkup(
    h(WrongBook, { bookId: 'book1', bookName: book.name, list: [], entryIndex, onBack: noop, onReview: noop }),
  )
  assert.ok(html.includes('错词本是空的'), '缺少空态文案')
  assert.ok(!html.includes('专项复习'), '空态不应出现专项复习按钮')
})

console.log('\n[渲染] 课外词书浏览')
ok('展示书名、组数、搜索框和第一组词条', () => {
  const html = renderToStaticMarkup(h(BookBrowser, { book, onBack: noop }))
  assert.ok(html.includes(book.name), '缺少书名')
  assert.ok(html.includes('搜索单词或中文释义'), '缺少搜索框')
  assert.ok(html.includes(`${book.groups.length} 组`), '缺少组数')
  // 第一组默认展开，应能看到该组的标题与词条
  assert.ok(html.includes(book.groups[0].entries[0].word), '缺少第一条词')
})
ok('分组标题全部渲染（书1 按词根块 / 书2 按天）', () => {
  const html2 = renderToStaticMarkup(h(BookBrowser, { book: mockBooks.book2, onBack: noop }))
  for (const g of mockBooks.book2.groups.slice(0, 3)) {
    assert.ok(html2.includes(g.title), `缺少分组标题：${g.title}`)
  }
})
ok('大分组只渲染前 30 条，避免一次挂满 DOM', () => {
  const html = renderToStaticMarkup(h(BookBrowser, { book, onBack: noop }))
  const g0 = book.groups[0]
  if (g0.entries.length > 30) {
    assert.ok(html.includes('显示更多'), '缺少「显示更多」')
    assert.ok(!html.includes(g0.entries[31].word), '第 31 条不该被渲染')
  }
})

console.log('\n[渲染] 设置面板（备份）')
ok('导出 / 导入按钮、危险操作都在', () => {
  const html = renderToStaticMarkup(
    h(SettingsSheet, {
      settings: DEFAULT_SETTINGS,
      onChange: noop,
      onClose: noop,
      onClearProgress: noop,
      onClearStats: noop,
    }),
  )
  assert.ok(html.includes('导出进度'), '缺少导出按钮')
  assert.ok(html.includes('导入进度'), '缺少导入按钮')
  assert.ok(html.includes('进度备份'), '缺少备份区块标题')
  assert.ok(html.includes('accept=".json,application/json"'), '文件选择器应限制 json')
  assert.ok(html.includes('清空本地学习进度'), '缺少清空进度')
  assert.ok(html.includes('清空统计与错词本'), '缺少清空统计')
})

console.log(`\n渲染冒烟测试通过：${pass} 项\n`)
