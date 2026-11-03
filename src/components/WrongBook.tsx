/**
 * 错词本页面（每本书一份，互相独立）。
 *
 * 能力：
 * - 顶部：错词总数 / 累计出错次数 / 平均每个词错几次
 * - 列表：单词 + 释义 + 错误次数徽标，按「错得最多的」优先排序
 * - 点开任一条：直接看到该词的彩色拆解（复用 Breakdown，不另造一套渲染）
 * - 底部：专项复习 → 用错词组成一个背诵会话，复用现有背诵流程
 *
 * 为什么不做成弹层而是一个独立页面：
 * 错词动辄上百条，弹层在手机上滚动体验差；独立页面可以整屏滚、还能保留返回路径。
 */
import { useMemo, useState } from 'react'
import type { BookId, WordEntry } from '../types'
import type { WrongWord } from '../engine/recall'
import { sortWrongList, wrongLevel } from '../engine/recall'
import Breakdown from './Breakdown'

interface Props {
  bookId: BookId
  bookName: string
  /** 错词列表（未排序的原始数据） */
  list: WrongWord[]
  /** 词条索引，用来取拆解；词条找不到时降级为只显示释义 */
  entryIndex: Map<string, WordEntry>
  onBack: () => void
  /** 进入专项复习；list 为当前排序后的全部错词 */
  onReview: (ids: string[]) => void
}

export default function WrongBook({ bookId, bookName, list, entryIndex, onBack, onReview }: Props) {
  // 默认展开第一条，用户点进来就能看到「错词长什么样」，不用多点一次
  const [openId, setOpenId] = useState<string | null>(list.length > 0 ? sortWrongList(list)[0].id : null)
  /** 按错误次数筛选：全部 / 顽固(≥4次) / 反复(2-3次) / 偶错(1次) */
  const [level, setLevel] = useState<'all' | 'high' | 'mid' | 'low'>('all')

  const sorted = useMemo(() => sortWrongList(list), [list])
  const totalWrongTimes = useMemo(() => sorted.reduce((n, w) => n + w.count, 0), [sorted])
  const avg = sorted.length > 0 ? (totalWrongTimes / sorted.length).toFixed(1) : '0'

  const levelCounts = useMemo(() => {
    let high = 0
    let mid = 0
    let low = 0
    for (const w of sorted) {
      if (w.count >= 4) high += 1
      else if (w.count >= 2) mid += 1
      else low += 1
    }
    return { all: sorted.length, high, mid, low }
  }, [sorted])

  const visible = useMemo(() => {
    if (level === 'all') return sorted
    if (level === 'high') return sorted.filter((w) => w.count >= 4)
    if (level === 'mid') return sorted.filter((w) => w.count >= 2 && w.count < 4)
    return sorted.filter((w) => w.count < 2)
  }, [sorted, level])

  return (
    <div className="min-h-[100svh] pb-40">
      <div className="app-shell pt-3">
        {/* 顶部栏 */}
        <div className="flex items-center gap-3">
          {/* 返回：图标 + 文字，和浏览页保持一致，手机上更容易发现与命中 */}
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
            <h1 className="truncate text-[17px] font-semibold text-ink-900">错词本</h1>
            <p className="truncate text-[11.5px] text-ink-400">{bookName}</p>
          </div>
          <span className="shrink-0 rounded-full bg-rose-50 px-2.5 py-1 text-[11.5px] font-semibold tabular-nums text-rose-600">
            {sorted.length} 词
          </span>
        </div>

        {/* 概览：三个数字，等分网格 */}
        <div className="card mt-4 grid grid-cols-3 divide-x divide-ink-100 py-3 text-center">
          <OverviewCell label="错词数" value={String(sorted.length)} />
          <OverviewCell label="累计出错" value={String(totalWrongTimes)} />
          <OverviewCell label="平均次数" value={avg} />
        </div>

        {/* 按错误次数分档筛选：顽固词优先解决，效率最高 */}
        {sorted.length > 0 && (
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {(
              [
                { key: 'all', label: '全部', n: levelCounts.all },
                { key: 'high', label: '顽固 ≥4次', n: levelCounts.high },
                { key: 'mid', label: '反复 2-3次', n: levelCounts.mid },
                { key: 'low', label: '偶错 1次', n: levelCounts.low },
              ] as { key: typeof level; label: string; n: number }[]
            ).map((f) => {
              const on = level === f.key
              return (
                <button
                  key={f.key}
                  onClick={() => setLevel(f.key)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] transition active:scale-[.97] ${
                    on ? 'bg-ink-900 font-medium text-white' : 'border border-ink-100 bg-white text-ink-500'
                  }`}
                >
                  {f.label}
                  <span className={`ml-1 tabular-nums ${on ? 'text-white/70' : 'text-ink-300'}`}>{f.n}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* 空态 */}
        {sorted.length === 0 ? (
          <div className="card mt-4 px-6 py-12 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-[14px] font-semibold text-ink-900">错词本是空的</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-400">
              背单词时点「不认识」或选错，词就会自动进这里。复习也能把错词清零。
            </p>
          </div>
        ) : (
          <>
            <p className="mt-4 px-1 text-[11.5px] leading-relaxed text-ink-400">
              按出错次数排序，点任意一个词可展开拆解。做一次专项复习会把错词的出错次数减一，归零后自动移出。
            </p>

            <ul className="mt-2.5 space-y-2">
              {visible.map((w) => {
                const open = openId === w.id
                const entry = entryIndex.get(w.id)
                const level = wrongLevel(w.count)
                return (
                  <li key={w.id} className="card overflow-hidden">
                    <button
                      onClick={() => setOpenId(open ? null : w.id)}
                      className="flex w-full min-w-0 items-start gap-3 p-3.5 text-left transition active:bg-ink-50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-word text-[17px] font-semibold text-ink-900">{w.word}</span>
                          {w.root && (
                            <span className="shrink-0 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-600">
                              {w.root}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block break-words text-[12.5px] leading-snug text-ink-500">
                          {w.meaning || '（暂无释义）'}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                          level === 'high'
                            ? 'bg-rose-100 text-rose-700'
                            : level === 'mid'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-ink-100 text-ink-500'
                        }`}
                      >
                        错 {w.count} 次
                      </span>
                    </button>

                    {open && (
                      <div className="border-t border-ink-100 bg-ink-50/40 px-3.5 py-3">
                        {entry ? (
                          <Breakdown
                            segments={entry.segments}
                            memory={entry.memory}
                            meaning={entry.meaning}
                            bookId={bookId}
                          />
                        ) : (
                          <p className="text-[12.5px] text-ink-400">词书里找不到这条词的拆解，可能数据版本已更新。</p>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>

      {/* 底部悬浮操作条：专项复习。
          用 sticky + 安全区兜底，长列表滚动时也能随时点到。
          注意 bottom 要抬高到「底部导航栏之上」，否则两个条会叠在一起。 */}
      {sorted.length > 0 && (
        <div
          className="fixed inset-x-0 z-30 border-t border-ink-100 bg-white/90 px-4 pt-3 backdrop-blur"
          style={{ bottom: 'calc(56px + env(safe-area-inset-bottom))', paddingBottom: '12px' }}
        >
          <div className="mx-auto flex max-w-[640px] gap-2">
            <button
              onClick={() => onReview(visible.map((w) => w.id))}
              className="flex-1 rounded-2xl bg-ink-900 py-3.5 text-[15px] font-semibold text-white transition active:scale-[.99] active:bg-ink-700"
            >
              专项复习 {visible.length} 个错词
            </button>
          </div>
        </div>
      )}

      {/* 无障碍：标题里带上书 id，方便将来做多书切换时区分 */}
      <span className="sr-only">{bookId}</span>
    </div>
  )
}

function OverviewCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-1">
      <div className="truncate text-[16px] font-semibold tabular-nums text-ink-900">{value}</div>
      <div className="mt-0.5 truncate text-[10.5px] text-ink-400">{label}</div>
    </div>
  )
}
