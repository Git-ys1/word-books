/**
 * 首页：选书 → 选模式 →（组内随机时）选起始组 → 开始背诵。
 * 单页三段式，用 step 控制，手机上不需要路由跳转，体验更像原生。
 *
 * 「选书」一步同时承担学习仪表盘的角色：每本书一张卡片，卡片上是
 *   - 已学 / 总词数的进度条（一眼看出学到哪了）
 *   - 累计学习时长、累计词次、错词数（三格数字，tab 对齐不会跳）
 *   - 离线浏览 / 错词本两个入口（不进入会话，切换页面即可，不影响正在偷跑的会话状态）
 */
import { useMemo, useState } from 'react'
import type { BookId, ReviewMode, SessionState, Settings } from '../types'
import type { Book as BookType } from '../types'
import { clampRetryGap, createSession } from '../engine/queue'
import { formatDuration } from '../hooks/useStats'

/** 首页需要的每本书信息：只依赖已加载好的 Book，不做加载逻辑 */
export interface BookCard {
  /** 展示名 */
  name: string
  /** 一句话描述 */
  desc: string
  /** 是否在展示示例数据（加载失败时的兜底），用于打「示例」角标 */
  isMock: boolean
  /** 词数；null 表示还没加载完 */
  count: number | null
  /** 真正的词书；null 表示还在加载 */
  book: BookType | null
}

/** 单本书的统计数字（由 App 从 useStats 派生后传进来，首页不碰存储） */
export interface BookStatsView {
  /** 已学词数（认识 / 答对过的去重词数） */
  learned: number
  /** 累计学习词次 */
  reviews: number
  /** 累计学习时长（毫秒） */
  studyMs: number
  /** 错词本条目数 */
  wrongCount: number
}

interface Props {
  books: Record<BookId, BookCard>
  settings: Settings
  /** 每本书的统计；null 表示还未就绪，按 0 展示但不闪「0 词已学」的错感 */
  stats: Record<BookId, BookStatsView>
  /** 已有未完成会话时，是否提示「继续」 */
  pendingSession: (SessionState & { bookName: string }) | null
  onResume: () => void
  onStart: (session: SessionState) => void
  onOpenSettings: () => void
  /** 打开课外词书浏览 */
  onOpenBrowse: (bookId: BookId) => void
  /** 打开某本书的错词本 */
  onOpenWrongBook: (bookId: BookId) => void
}

const MODE_CARDS: { key: ReviewMode; title: string; desc: string; icon: string }[] = [
  {
    key: 'sequential',
    title: '完全顺序',
    desc: '严格按词书出现顺序，一个接一个往下推',
    icon: '☰',
  },
  {
    key: 'groupShuffle',
    title: '组内随机',
    desc: '组与组顺序固定，只在组内打乱；可从任意组开始',
    icon: '⤨',
  },
  {
    key: 'fullRandom',
    title: '完全随机',
    desc: '全书打乱，直接考中文释义四选一',
    icon: '✦',
  },
]

export default function Home({
  books,
  settings,
  stats,
  pendingSession,
  onResume,
  onStart,
  onOpenSettings,
  onOpenBrowse,
  onOpenWrongBook,
}: Props) {
  const [step, setStep] = useState<'book' | 'mode' | 'group'>('book')
  const [bookId, setBookId] = useState<BookId>('book1')
  const [mode, setMode] = useState<ReviewMode>('sequential')

  const card = books[bookId]
  const book: BookType | null = card.book

  /** 组内随机的起始组选择 */
  const groupOptions = useMemo(
    () => (book ? book.groups.map((g, i) => ({ id: g.id, title: g.title, count: g.entries.length, index: i })) : []),
    [book],
  )

  const begin = (groupStartIndex: number) => {
    // 词书还没加载好时不允许开始，避免创建出空会话
    if (!book) return
    // ★ 必须同时把所选组的 id 写进会话：
    //   背诵页右上角在没有词根时要靠 session.groupId 反查组标题显示，
    //   底部模式说明也要用它。只传 startGroupIndex 会让 groupId 落成 null，
    //   结果右上角空白、底部错显示"全书"。
    const pickedGroup = book.groups[groupStartIndex]
    const session = createSession({
      book,
      mode,
      startGroupIndex: groupStartIndex,
      groupId: pickedGroup?.id ?? null,
      retryGap: clampRetryGap(settings.retryGap),
    })
    onStart(session)
  }

  return (
    <div className="min-h-[100svh] pb-10">
      <div className="app-shell pt-5">
        {/* 顶部标题栏：
            必须 flex-1 min-w-0 + 右侧按钮 shrink-0，
            否则长书名会把标题行撑破，390px 宽的 iPhone 上卡片右侧会被裁掉 */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-bold tracking-tight text-ink-900">背单词</h1>
            <p className="mt-1 text-[13px] text-ink-400">词根拆解 · 间隔重复</p>
          </div>
          <button
            onClick={onOpenSettings}
            aria-label="设置"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-ink-500 shadow-sm ring-1 ring-ink-100 transition active:scale-95"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 003.68 15a1.65 1.65 0 00-1.51-1H2a2 2 0 110-4h.09A1.65 1.65 0 003.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 008 4.68 1.65 1.65 0 009 3.17V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.14.35.42.64.77.79H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
        </div>

        {/* 未完成会话：继续背 */}
        {pendingSession && step === 'book' && (
          <button
            onClick={onResume}
            className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-brand-500/20 bg-brand-50 px-4 py-3 text-left transition active:scale-[.99]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-brand-600 shadow-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-ink-900">继续上次</span>
              <span className="block truncate text-[12px] text-ink-500">
                {pendingSession.bookName} · 已掌握 {pendingSession.mastered}/{pendingSession.total}
                {pendingSession.wrongPool.length > 0 ? ` · 错词 ${pendingSession.wrongPool.length}` : ''}
              </span>
            </span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-500">
              <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {/* ---------- 第一步：选书（带学习统计） ---------- */}
        {step === 'book' && (
          <section className="mt-6 animate-fade-up">
            <StepTitle index={1} text="选择词书" />
            <div className="mt-3 space-y-3">
              {(Object.keys(books) as BookId[]).map((id) => (
                <BookStatCard
                  key={id}
                  id={id}
                  info={books[id]}
                  stats={stats[id]}
                  onPick={() => {
                    setBookId(id)
                    setStep('mode')
                  }}
                  onBrowse={() => onOpenBrowse(id)}
                  onWrong={() => onOpenWrongBook(id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* ---------- 第二步：选模式 ---------- */}
        {step === 'mode' && (
          <section className="mt-6 animate-fade-up">
            <button
              onClick={() => setStep('book')}
              className="mb-3 -ml-1 flex items-center gap-1 text-[13px] text-ink-400 active:text-ink-700"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {card.name}
            </button>
            <StepTitle index={2} text="选择背诵模式" />
            <div className="mt-3 space-y-2.5">
              {MODE_CARDS.map((m) => {
                const active = mode === m.key
                return (
                  <button
                    key={m.key}
                    onClick={() => setMode(m.key)}
                    className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition active:scale-[.99] ${
                      active
                        ? 'border-brand-500/40 bg-brand-50 shadow-sm'
                        : 'border-ink-100 bg-white'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[15px] ${
                        active ? 'bg-brand-500 text-white' : 'bg-ink-100 text-ink-500'
                      }`}
                    >
                      {m.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-ink-900">{m.title}</span>
                      <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-400">{m.desc}</span>
                    </span>
                    {active && (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mt-1 text-brand-500">
                        <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => {
                // 完全顺序和组内随机都要先选起始组（用户要求：两种模式都能选组）
                // 完全随机是全书打乱，没有「组」的概念，直接开始。
                if (mode === 'fullRandom') begin(0)
                else setStep('group')
              }}
              className="mt-5 w-full rounded-2xl bg-ink-900 py-3.5 text-[15px] font-semibold text-white transition active:scale-[.99] active:bg-ink-700"
            >
              开始背诵
            </button>
            <p className="mt-2.5 text-center text-[11.5px] leading-relaxed text-ink-400">
              不认识会延后 {clampRetryGap(settings.retryGap)} 个词再出现（设置里可调）
            </p>
          </section>
        )}

        {/* ---------- 第三步：选起始组（完全顺序 / 组内随机 共用） ---------- */}
        {step === 'group' && (
          <section className="mt-6 animate-fade-up">
            <button
              onClick={() => setStep('mode')}
              className="mb-3 -ml-1 flex items-center gap-1 text-[13px] text-ink-400 active:text-ink-700"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {mode === 'groupShuffle' ? '组内随机' : '完全顺序'}
            </button>
            <StepTitle index={3} text="从哪里开始" />
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-400">
              {mode === 'groupShuffle'
                ? '组间顺序不会变，只打乱组内。选中间某一组开始，前面的组会接在后面继续背，不会漏词。'
                : '词书顺序不会变。选中间某一组开始，前面的组会接在后面继续背，不会漏词。'}
            </p>
            <div className="no-scrollbar mt-3 max-h-[52vh] space-y-2 overflow-y-auto pb-2">
              <button
                onClick={() => begin(0)}
                className="flex w-full items-center justify-between rounded-xl border border-brand-500/30 bg-brand-50 px-4 py-3 text-left transition active:scale-[.99]"
              >
                <span className="text-[14px] font-semibold text-brand-600">从第一组开始</span>
                <span className="text-[12px] tabular-nums text-brand-500">
                  {card.count ?? 0} 词
                </span>
              </button>
              {groupOptions.map((g) => (
                <button
                  key={g.id}
                  onClick={() => begin(g.index)}
                  className="flex w-full items-center gap-3 rounded-xl border border-ink-100 bg-white px-4 py-3 text-left transition active:scale-[.99]"
                >
                  <span className="w-6 shrink-0 text-[12px] tabular-nums text-ink-300">{String(g.index + 1).padStart(2, '0')}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-ink-900">{g.title}</span>
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-ink-400">{g.count} 词</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

/* ============================ 单本书卡片（含统计） ============================ */

function BookStatCard({
  id,
  info,
  stats,
  onPick,
  onBrowse,
  onWrong,
}: {
  id: BookId
  info: BookCard
  stats: BookStatsView
  onPick: () => void
  onBrowse: () => void
  onWrong: () => void
}) {
  const total = info.count
  const loading = total === null
  const learned = stats.learned
  // 进度分母优先用词书真实词数，加载中时用「已学 + 0」兜底，避免出现 NaN
  const denom = total && total > 0 ? total : Math.max(learned, 1)
  const pct = Math.min(100, Math.round((learned / denom) * 100))

  return (
    <div className="card min-w-0 overflow-hidden">
      <button onClick={onPick} className="flex w-full min-w-0 items-center gap-4 p-4 text-left transition active:scale-[.99]">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[18px] ${
            id === 'book1' ? 'bg-brand-50 text-brand-600' : 'bg-amber-50 text-amber-600'
          }`}
        >
          {id === 'book1' ? 'Ⅰ' : 'Ⅱ'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[15px] font-semibold text-ink-900">
            <span className="truncate">{info.name}</span>
            {info.isMock && (
              <span className="shrink-0 rounded bg-ink-100 px-1 py-0.5 text-[10px] font-normal text-ink-400">示例</span>
            )}
          </span>
          <span className="mt-0.5 block break-words text-[12.5px] leading-snug text-ink-400">{info.desc}</span>
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-ink-300">
          <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* 进度：已学 / 总词数 + 进度条
          注意：这里用 flex-wrap + 明确间距，避免「已学」和「3051 0%」在窄屏被
          justify-between 挤到贴在一起，看起来像「30510%」这样的乱码。 */}
      <div className="px-4">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="shrink-0 text-[11.5px] text-ink-400">已学</span>
          <span className="shrink-0 text-[15px] font-semibold tabular-nums text-ink-900">{learned}</span>
          <span className="shrink-0 text-[12px] tabular-nums text-ink-300">/</span>
          <span className="shrink-0 text-[12px] tabular-nums text-ink-500">
            {loading ? <span className="text-[11px] text-ink-300">加载中</span> : total}
          </span>
          <span className="ml-auto shrink-0 text-[11px] tabular-nums text-ink-400">{pct}%</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
          <div
            className={`h-full rounded-full transition-all duration-300 ease-out ${
              id === 'book1' ? 'bg-brand-500' : 'bg-amber-400'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* 三格统计：时长 / 词次 / 错词，等分网格，390px 下不会挤压 */}
      <div className="mx-4 mt-3 grid grid-cols-3 divide-x divide-ink-100 rounded-xl bg-ink-50/70 py-2 text-center">
        <StatCell label="学习时长" value={formatDuration(stats.studyMs)} />
        <StatCell label="词次" value={String(stats.reviews)} />
        <StatCell label="错词" value={String(stats.wrongCount)} accent={stats.wrongCount > 0} />
      </div>

      {/* 两个次级入口 */}
      <div className="flex gap-2 p-4 pt-3">
        <button
          onClick={onBrowse}
          className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-ink-100 bg-white py-2.5 text-[12.5px] font-medium text-ink-700 transition active:scale-[.98] active:bg-ink-50"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
            <path d="M4 5.5A2.5 2.5 0 016.5 3H20v18H6.5A2.5 2.5 0 004 23V5.5z" strokeLinejoin="round" />
            <path d="M8 7h8M8 11h6" strokeLinecap="round" />
          </svg>
          <span className="truncate">浏览词书</span>
        </button>
        <button
          onClick={onWrong}
          className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-ink-100 bg-white py-2.5 text-[12.5px] font-medium text-ink-700 transition active:scale-[.98] active:bg-ink-50"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
            <path d="M6 4h12a1 1 0 011 1v16l-7-4-7 4V5a1 1 0 011-1z" strokeLinejoin="round" />
          </svg>
          <span className="truncate">错词本{stats.wrongCount > 0 ? ` ${stats.wrongCount}` : ''}</span>
        </button>
      </div>
    </div>
  )
}

function StatCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0 px-1">
      <div className={`truncate text-[14px] font-semibold tabular-nums ${accent ? 'text-rose-600' : 'text-ink-900'}`}>
        {value}
      </div>
      <div className="mt-0.5 truncate text-[10.5px] text-ink-400">{label}</div>
    </div>
  )
}

function StepTitle({ index, text }: { index: number; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-ink-900 text-[11px] font-bold text-white">
        {index}
      </span>
      <h2 className="text-[15px] font-semibold text-ink-900">{text}</h2>
    </div>
  )
}
