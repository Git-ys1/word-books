/**
 * 课外词书浏览页：不在背诵会话时，也能翻词书。
 *
 * 产品要求逐条对齐：
 * - 按分组列出所有词（书1 按词根块 / 书2 按天），分组标题直接沿用数据层生成的 title
 * - 可搜索单词（同时匹配单词与中文释义，手机上搜中文比搜英文更常用）
 * - 点击某个词看它的拆解（复用 Breakdown，视觉与背诵页完全一致）
 *
 * 关键约束：本页是纯只读视图，只接收一份 Book 的浅引用，不读写会话状态，
 * 因此从首页进入再返回，背诵会话（含正在进行的队列）原样保留。
 *
 * 手机端性能：书1 有数千词条，渲染全部列表会明显卡顿。
 * 因此分组列表默认折叠，展开后也只渲染「前 N 条 + 继续加载更多」，避免一次挂上千个 DOM 节点。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Book, WordEntry } from '../types'
import Breakdown from './Breakdown'

interface Props {
  book: Book
  onBack: () => void
}

/** 每个分组初始渲染多少词，点「显示更多」再追加 */
const PAGE_SIZE = 30

export default function BookBrowser({ book, onBack }: Props) {
  const [query, setQuery] = useState('')
  /** 展开的分组 ID 集合；null 表示还没任何操作，用默认策略（展开第一组） */
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(book.groups[0] ? [book.groups[0].id] : []))
  /** 展开的分组里已经渲染了多少条 */
  const [shownCount, setShownCount] = useState<Record<string, number>>({})
  /** 当前点开的词条（看拆解） */
  const [detail, setDetail] = useState<WordEntry | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const keyword = query.trim().toLowerCase()
  const searching = keyword.length > 0

  /** 搜索结果：单词前缀优先、包含其次，最后是释义命中；上限 200 条防卡顿 */
  const results = useMemo(() => {
    if (!searching) return []
    const starts: WordEntry[] = []
    const contains: WordEntry[] = []
    const meaningHit: WordEntry[] = []
    for (const g of book.groups) {
      for (const e of g.entries) {
        const w = e.word.toLowerCase()
        if (w.startsWith(keyword)) starts.push(e)
        else if (w.includes(keyword)) contains.push(e)
        else if (e.meaning.toLowerCase().includes(keyword)) meaningHit.push(e)
        if (starts.length + contains.length >= 200) break
      }
    }
    return [...starts, ...contains, ...meaningHit].slice(0, 200)
  }, [book, keyword, searching])

  const totalWords = useMemo(() => book.groups.reduce((n, g) => n + g.entries.length, 0), [book])

  // 打开页面时收起 iOS 键盘（从首页点进来时焦点不会自动落在搜索框上）
  useEffect(() => {
    searchRef.current?.blur()
  }, [])

  const toggleGroup = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const showMore = (id: string) => {
    setShownCount((prev) => ({ ...prev, [id]: (prev[id] ?? PAGE_SIZE) + PAGE_SIZE }))
  }

  return (
    <div className="min-h-[100svh] pb-10">
      <div className="app-shell pt-3">
        {/* 顶部栏 */}
        <div className="flex items-center gap-3">
          {/* 返回：图标 + 文字。
              只放图标时手机上不够明确，自动化也点不到；加文字后点击区域更宽、更易触达。 */}
          <button
            onClick={onBack}
            aria-label="返回首页"
            className="-ml-2 flex h-9 shrink-0 items-center gap-0.5 rounded-full pl-1 pr-2 text-[13px] font-medium text-ink-500 transition active:bg-ink-100 active:text-ink-800"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            返回
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[17px] font-semibold text-ink-900">{book.name}</h1>
            <p className="truncate text-[11.5px] text-ink-400">
              {book.groups.length} 组 · 共 {totalWords} 词
            </p>
          </div>
        </div>

        {/* 搜索框：input 用 min-w-0 + 外层 flex，390px 下不会被右侧按钮挤出去 */}
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-ink-100 bg-white px-3 shadow-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-ink-300">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              // 输入即进入搜索态，展开状态不影响搜索
              setShownCount({})
            }}
            inputMode="search"
            enterKeyHint="search"
            placeholder="搜索单词或中文释义"
            aria-label="搜索单词"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-[14px] text-ink-900 outline-none placeholder:text-ink-300"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="清空搜索"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-400 transition active:bg-ink-200"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {/* ---------- 搜索态 ---------- */}
        {searching && (
          <section className="mt-3 animate-fade-up">
            <p className="px-1 text-[11.5px] text-ink-400">
              找到 {results.length}
              {results.length >= 200 ? '+' : ''} 个词
            </p>
            {results.length === 0 ? (
              <div className="card mt-2 px-5 py-10 text-center text-[13px] text-ink-400">
                没搜到「{query.trim()}」，换个拼写或中文释义试试
              </div>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {results.map((e) => (
                  <li key={e.id}>
                    <WordRow entry={e} onClick={() => setDetail(e)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ---------- 分组浏览 ---------- */}
        {!searching && (
          <section className="mt-3">
            {book.groups.map((g, gi) => {
              const open = openIds.has(g.id)
              const limit = shownCount[g.id] ?? PAGE_SIZE
              const visible = g.entries.slice(0, limit)
              const hasMore = g.entries.length > visible.length
              return (
                <div key={g.id} className="mb-2 overflow-hidden rounded-2xl border border-ink-100 bg-white">
                  <button
                    onClick={() => toggleGroup(g.id)}
                    aria-expanded={open}
                    className="flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition active:bg-ink-50"
                  >
                    <span className="w-6 shrink-0 text-[11px] tabular-nums text-ink-300">
                      {String(gi + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 flex-1">
                      {/* 分组标题可能很长（如 △ xxx = 长中文释义），必须允许换行，不能横向溢出 */}
                      <span className="block break-words text-[13.5px] font-semibold leading-snug text-ink-900">{g.title}</span>
                      <span className="mt-0.5 block text-[11px] text-ink-400">{g.subtitle ?? `${g.entries.length} 词`}</span>
                    </span>
                    <span className="shrink-0 text-[11.5px] tabular-nums text-ink-400">{g.entries.length}</span>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className={`shrink-0 text-ink-300 transition-transform ${open ? 'rotate-180' : ''}`}
                    >
                      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {open && (
                    <ul className="border-t border-ink-100 bg-ink-50/40 px-2 py-1.5">
                      {visible.length === 0 && (
                        <li className="px-2 py-3 text-[12.5px] text-ink-400">这一组没有词条</li>
                      )}
                      {visible.map((e) => (
                        <li key={e.id}>
                          <WordRow entry={e} onClick={() => setDetail(e)} dense />
                        </li>
                      ))}
                      {hasMore && (
                        <li>
                          <button
                            onClick={() => showMore(g.id)}
                            className="mt-1 w-full rounded-xl bg-white py-2.5 text-[12.5px] font-medium text-brand-600 transition active:bg-brand-50"
                          >
                            显示更多（还有 {g.entries.length - visible.length} 词）
                          </button>
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              )
            })}
          </section>
        )}
      </div>

      {/* ---------- 词条拆解弹层 ---------- */}
      {detail && <DetailSheet entry={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

/* ============================ 词条行 ============================ */

function WordRow({ entry, onClick, dense }: { entry: WordEntry; onClick: () => void; dense?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full min-w-0 items-start gap-2 text-left transition active:bg-ink-100 ${
        dense ? 'rounded-xl px-2 py-2' : 'card px-4 py-3'
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-word text-[15px] font-semibold text-ink-900">{entry.word}</span>
        <span className="mt-0.5 block break-words text-[12px] leading-snug text-ink-500">{entry.meaning}</span>
      </span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-1 shrink-0 text-ink-200">
        <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

/* ============================ 拆解弹层 ============================ */

function DetailSheet({ entry, onClose }: { entry: WordEntry; onClose: () => void }) {
  // Esc 关闭：桌面端用键盘翻词时才不别扭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-ink-900/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative max-h-[82vh] w-full max-w-[640px] animate-fade-up overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] shadow-lift sm:rounded-3xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-200 sm:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="break-words font-word text-[26px] font-bold leading-tight text-ink-900">{entry.word}</h2>
            <p className="mt-1 break-words text-[13.5px] leading-relaxed text-ink-500">{entry.meaning}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-400 active:bg-ink-100"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-ink-100 bg-ink-50/40 p-3">
          {entry.segments.length > 0 ? (
            <Breakdown
              segments={entry.segments}
              memory={entry.memory}
              root={entry.root}
              rootMeaning={entry.rootMeaning}
            />
          ) : (
            <p className="text-[12.5px] leading-relaxed text-ink-400">
              这个词没有拆解数据（散词区 / 无共同词根的词），直接记「单词 ↔ 释义」即可。
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
