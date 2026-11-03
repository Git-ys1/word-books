/**
 * 背诵会话主界面 —— 第一阶段（看词判断）+ 第二阶段（中文释义四选一）。
 *
 * 交互契约（对齐用户给的截图）：
 * - 顶部：返回按钮 + 「1/10」进度 + 细进度条
 * - 中上：大字单词；右上角词缀（root / 前缀后缀）
 * - 中部：「拆解」按钮，点击展开彩色拆解
 * - 底部：判断模式下「不认识 / 认识」；完全随机模式下改为中文释义四选一
 * - 四选一：4 个选项纵向排列，点完立刻给对错反馈，答对进度 +1，答错进度不变、错词延后
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Book, QueueItem, SessionState, Settings, WordEntry } from '../types'
import { advance, buildQuiz, clampRetryGap, insertAt, progressDenominator } from '../engine/queue'
import Breakdown from './Breakdown'

interface Props {
  book: Book
  entryIndex: Map<string, WordEntry>
  allEntries: WordEntry[]
  session: SessionState
  settings: Settings
  /** 每次判定后回写新会话 */
  onChange: (next: SessionState) => void
  /** 点返回：由外层决定是弹确认框还是直接退 */
  onExit: () => void
  /** 每完成一次判定向上报一次（统计与错词本记账用）；不传则完全不影响原流程 */
  onRecall?: (ev: RecallSubmit) => void
  /** 计时打卡：每隔一段时间上报「这段时间真实活跃的毫秒数」 */
  onStudyTick?: (ms: number) => void
}

/** 一次判定的结构化事件，App 拿它去累计统计 / 写错词本 */
export interface RecallSubmit {
  entryId: string
  word: string
  meaning: string
  root?: string
  verdict: 'know' | 'unknown'
}

/** 计时打卡间隔：20 秒足够精细，又不会让每次判定都触发 state 更新 */
const TICK_MS = 20_000

/** 轻震动反馈：手机上确认手感，桌面/不支持时静默 */
function haptic(settings: Settings, pattern: number | number[]) {
  if (!settings.haptic) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* 不支持就算了 */
  }
}

export default function ReciteSession({
  book,
  entryIndex,
  allEntries,
  session,
  settings,
  onChange,
  onExit,
  onRecall,
  onStudyTick,
}: Props) {
  const [expanded, setExpanded] = useState(settings.autoExpand)
  const [picked, setPicked] = useState<string | null>(null)
  const [justPostponed, setJustPostponed] = useState<number | null>(null)
  // 上一帧的队首，用于判断「词变了」时重置动画与展开状态
  const lastHeadRef = useRef<string | null>(null)

  /* ---------- 学习时长统计 ----------
     只在「页面可见」时累计：手机切后台 / 锁屏不算学习时间。
     用 ref 存计时起点，避免每 20 秒重渲染时把起点重置掉。 */
  const tickStartRef = useRef<number>(Date.now())
  const onTickRef = useRef(onStudyTick)
  onTickRef.current = onStudyTick

  useEffect(() => {
    if (!onTickRef.current) return
    const flushTick = () => {
      const now = Date.now()
      const delta = now - tickStartRef.current
      tickStartRef.current = now
      if (delta > 0) onTickRef.current?.(delta)
    }
    // 切走时把「切走前那一小段」补记上，但后台时间不计入
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushTick()
      } else {
        tickStartRef.current = Date.now()
      }
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') flushTick()
    }, TICK_MS)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      // 卸载（返回首页）时把最后一段也记上
      flushTick()
    }
  }, [])

  const item: QueueItem | undefined = session.queue[0]
  const entry = item ? entryIndex.get(item.entryId) : undefined

  // 换词时复位：收起拆解、清空选择、清掉延后提示
  const headKey = item ? `${item.entryId}#${item.attempt}` : '__end__'
  useEffect(() => {
    if (lastHeadRef.current !== headKey) {
      lastHeadRef.current = headKey
      setExpanded(settings.autoExpand)
      setPicked(null)
    }
  }, [headKey, settings.autoExpand])

  // 延后提示 2 秒后自动消失
  useEffect(() => {
    if (justPostponed === null) return
    const t = window.setTimeout(() => setJustPostponed(null), 2000)
    return () => window.clearTimeout(t)
  }, [justPostponed])

  /** 生成当前题的四选一选项（与当前词绑定，避免每次渲染重算导致选项跳动） */
  const question = useMemo(() => {
    if (!entry) return null
    if (session.mode !== 'fullRandom') return null
    if (session.stage !== 'quiz') return null
    return buildQuiz(entry.id, allEntries)
  }, [entry, allEntries, session.mode, session.stage])

  /** 统一提交判定 */
  const submit = useCallback(
    (verdict: 'know' | 'unknown') => {
      if (!entry || !item) return
      const res = advance(session.queue, verdict, clampRetryGap(settings.retryGap))

      // 完全随机模式：认识进复习池，不认识进错词池（去重）
      let { reviewPool, wrongPool } = session
      if (session.mode === 'fullRandom') {
        if (verdict === 'know') {
          if (!reviewPool.includes(entry.id)) reviewPool = [...reviewPool, entry.id]
        } else {
          if (!wrongPool.includes(entry.id)) wrongPool = [...wrongPool, entry.id]
          // 答对了就从错词池里摘掉，避免「已经会了还反复考」
          reviewPool = reviewPool.includes(entry.id) ? reviewPool : [...reviewPool, entry.id]
        }
      }

      const next: SessionState = {
        ...session,
        queue: res.queue,
        mastered: session.mastered + res.masteredDelta,
        reviewPool,
        wrongPool,
        hasWrongPending: session.hasWrongPending || verdict === 'unknown',
        updatedAt: Date.now(),
      }
      onChange(next)

      // 记账：把「这一次判定」结构化上报，统计与错词本由外层负责
      onRecall?.({
        entryId: entry.id,
        word: entry.word,
        meaning: entry.meaning,
        root: entry.root,
        verdict: verdict === 'know' ? 'know' : 'unknown',
      })

      if (verdict === 'unknown') {
        haptic(settings, 30)
        if (res.postponedTo) setJustPostponed(res.postponedTo)
      } else {
        haptic(settings, 12)
      }
    },
    [entry, item, session, settings, onChange, onRecall],
  )

  /** 四选一选择 */
  const answer = useCallback(
    (optionId: string) => {
      if (picked !== null || !entry || !question) return
      setPicked(optionId)
      const correct = optionId === question.answerId
      // 稍微延迟一点再推进，让用户看清对错反馈色
      window.setTimeout(() => {
        submit(correct ? 'know' : 'unknown')
      }, correct ? 320 : 900)
    },
    [picked, entry, question, submit],
  )

  if (!entry || !item) {
    return <EmptyState session={session} onExit={onExit} />
  }

  const denom = progressDenominator(session)
  const shown = Math.min(session.mastered + 1, Math.max(1, denom))
  const pct = denom > 0 ? Math.min(100, (session.mastered / denom) * 100) : 0

  return (
    <div className="flex min-h-[100svh] flex-col pb-4">
      {/* ---------- 顶部：返回 + 进度 ---------- */}
      <header className="app-shell pt-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            aria-label="返回"
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-ink-700 transition active:scale-95 active:bg-ink-100"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div className="flex flex-1 items-center justify-center gap-2">
            <span className="font-word text-[17px] font-semibold tabular-nums text-ink-900">
              {shown}
              <span className="text-ink-300">/{denom}</span>
            </span>
            {session.inWrongReview && (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-600">错词复习</span>
            )}
          </div>

          <div className="w-9" />
        </div>

        {/* 细进度条 */}
        <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-ink-100">
          <div
            className="h-full rounded-full bg-brand-500 transition-all duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </header>

      {/* ---------- 主体：大卡片 ---------- */}
      <main className="app-shell flex flex-1 flex-col">
        <div className="card mt-4 flex flex-1 flex-col overflow-hidden">
          {/* 单词区 */}
          <div className="relative px-5 pb-2 pt-7">
            {/* 右上角：词根 + 词根中文释义
                规范见 docs/背诵逻辑规范.md「① 右上角」
                - 书1：显示 △ 行的「词根 = 释义」，如 act = 做；驱使
                - 书2：显示 PDF 第一列原文，如 tend/tent/tens 伸展，趋向
                - 没有词根时显示组标题，不留空白
                绝不能只显示英文词根而丢掉中文释义。 */}
            <div className="absolute right-4 top-4 max-w-[52%] text-right">
              {entry.root || entry.rootMeaning ? (
                <span className="inline-block rounded-lg bg-brand-50 px-2 py-1 text-right leading-tight">
                  {entry.root && (
                    <span className="block font-word text-[12.5px] font-semibold text-brand-600">
                      {entry.root}
                    </span>
                  )}
                  {entry.rootMeaning && (
                    <span className="mt-0.5 block text-[11.5px] font-medium text-brand-500">
                      {entry.rootMeaning}
                    </span>
                  )}
                </span>
              ) : (
                /* 没有词根时显示组标题，绝不留空白。
                   先按 session.groupId 精确找；找不到就用当前词反查它所属的组；
                   再找不到就显示「第 N 组」兜底。 */
                <span className="text-[11px] leading-tight text-ink-400">
                  {(() => {
                    const byId = book.groups.find((g) => g.id === session.groupId)
                    if (byId) return byId.title
                    const byWord = book.groups.find((g) => g.entries.some((x) => x.id === entry.id))
                    if (byWord) return byWord.title
                    const idx = book.groups.findIndex((g) => g.entries.some((x) => x.id === entry.id))
                    return idx >= 0 ? `第 ${idx + 1} 组` : ''
                  })()}
                </span>
              )}
            </div>

            <h1
              key={headKey}
              className="animate-pop-in pr-16 font-word text-[40px] font-bold leading-[1.15] tracking-tight text-ink-900 sm:text-[46px]"
              style={{ wordBreak: 'break-word' }}
            >
              {entry.word}
            </h1>

            {/* 题干提示：随机模式直接问「选中文释义」 */}
            <p className="mt-2 text-[13px] text-ink-400">
              {session.mode === 'fullRandom' ? '选出正确的中文释义' : '先自己回忆一下，再决定认不认识'}
            </p>

            {justPostponed !== null && (
              <p className="mt-2 animate-fade-up text-[12.5px] font-medium text-amber-600">
                稍后再见 · 已排到第 {justPostponed} 个之后
              </p>
            )}
          </div>

          {/* 拆解按钮 + 展开区 */}
          <div className="px-5">
            {!expanded ? (
              <button
                onClick={() => {
                  setExpanded(true)
                  haptic(settings, 10)
                }}
                className="group flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-ink-200 bg-ink-50/60 py-3 text-[14px] font-medium text-ink-500 transition active:scale-[.99] active:bg-ink-100"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
                拆解
              </button>
            ) : (
              <div className="rounded-2xl border border-ink-100 bg-ink-50/40 p-3">
                <Breakdown
                  segments={entry.segments}
                  memory={entry.memory}
                  meaning={entry.meaning}
                  bookId={book.id}
                />
                <button
                  onClick={() => setExpanded(false)}
                  className="mt-2.5 w-full rounded-xl py-1.5 text-[12.5px] text-ink-400 transition active:text-ink-600"
                >
                  收起
                </button>
              </div>
            )}
          </div>

          {/* 底部操作区：
              四选一模式下选项较多，不能用 mt-auto 全顶到底部，
              否则中间空出半屏，拇指也够不到。改为柔性间距 + 最大宽度约束。 */}
          <div
            className={
              session.mode === 'fullRandom' && session.stage === 'quiz' && question
                ? 'px-5 pb-5 pt-4'
                : 'mt-auto px-5 pb-5 pt-5'
            }
          >
            {session.mode === 'fullRandom' && session.stage === 'quiz' && question ? (
              <QuizOptions
                question={question}
                entryIndex={entryIndex}
                picked={picked}
                onPick={answer}
              />
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={() => submit('unknown')}
                  className="btn-verdict bg-ink-100 text-ink-700 active:bg-ink-200"
                >
                  不认识
                </button>
                <button
                  onClick={() => submit('know')}
                  className="btn-verdict bg-ink-900 text-white active:bg-ink-700"
                >
                  认识
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 底部小字：当前模式说明 + 实际选中的起始组
            之前 groupShuffle 只判断 groupId 是否存在，导致选了「第30组」仍显示「全书」。
            现在直接显示所选组标题，让用户清楚自己从哪一组开始。 */}
        <p className="pb-2 pt-3 text-center text-[11.5px] text-ink-400">
          {(() => {
            const curGroup = book.groups.find((g) => g.id === session.groupId)
            const suffix = curGroup ? ` · 从「${curGroup.title}」开始` : ''
            if (session.mode === 'sequential') return `完全顺序 · 严格按词书顺序${suffix}`
            if (session.mode === 'groupShuffle') return `组内随机 · 组间顺序固定${suffix}`
            return '完全随机 · 中文释义四选一'
          })()}
        </p>
      </main>
    </div>
  )
}

/* ============================ 四选一选项 ============================ */

function QuizOptions({
  question,
  entryIndex,
  picked,
  onPick,
}: {
  question: ReturnType<typeof buildQuiz>
  entryIndex: Map<string, WordEntry>
  picked: string | null
  onPick: (id: string) => void
}) {
  if (!question) return null
  return (
    <div className="flex flex-col gap-2.5">
      {question.options.map((id, i) => {
        const e = entryIndex.get(id)
        if (!e) return null
        const isAnswer = id === question.answerId
        const isPicked = picked === id
        // 已作答后的三种视觉状态
        let cls = 'border-ink-200 bg-white text-ink-900 active:bg-ink-50'
        if (picked !== null) {
          if (isAnswer) cls = 'border-emerald-400 bg-emerald-50 text-emerald-800'
          else if (isPicked) cls = 'border-rose-400 bg-rose-50 text-rose-700'
          else cls = 'border-ink-100 bg-white text-ink-300'
        }
        return (
          <button
            key={id}
            disabled={picked !== null}
            onClick={() => onPick(id)}
            className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all duration-150 active:scale-[.995] ${cls}`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[12px] font-semibold ${
                picked !== null && isAnswer
                  ? 'bg-emerald-500 text-white'
                  : picked !== null && isPicked
                    ? 'bg-rose-500 text-white'
                    : 'bg-ink-100 text-ink-500'
              }`}
            >
              {String.fromCharCode(65 + i)}
            </span>
            <span className="flex-1 text-[15px] leading-snug">{e.meaning}</span>
            {picked !== null && isAnswer && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {picked !== null && isPicked && !isAnswer && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ============================ 空状态 ============================ */

function EmptyState({ session, onExit }: { session: SessionState; onExit: () => void }) {
  // 队列空了但还有错词没复习：完全随机模式的退出逻辑在这里兜底
  const hasWrong = session.wrongPool.length > 0
  return (
    <div className="flex min-h-[100svh] items-center justify-center px-5">
      <div className="card w-full max-w-[420px] animate-fade-up p-7 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="text-[19px] font-semibold text-ink-900">这一轮结束</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-500">
          本次掌握 <span className="font-semibold text-ink-900">{session.mastered}</span> 词
          {hasWrong && `，错词 ${session.wrongPool.length} 个`}
        </p>
        <button
          onClick={onExit}
          className="mt-6 w-full rounded-2xl bg-ink-900 py-3.5 text-[15px] font-semibold text-white transition active:scale-[.99] active:bg-ink-700"
        >
          {hasWrong ? '进入错词复习' : '返回首页'}
        </button>
      </div>
    </div>
  )
}

/* 供外部使用的小工具：把某个词插到队列末尾（错词复习阶段用得到） */
export function appendToQueue(queue: QueueItem[], ids: string[]): QueueItem[] {
  let q = queue
  for (const id of ids) q = insertAt(q, q.length, { entryId: id, attempt: 1, kind: 'retry' })
  return q
}
