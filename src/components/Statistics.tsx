/**
 * 学习数据看板 —— 对标主流背单词 App 的「统计 / 我的」页。
 *
 * 展示内容（每一项都对应一个真实可算的指标，不做假数据）：
 *   1. 今日概览     ：环形完成度（今天新学 / 每日目标）
 *   2. 核心数字     ：已学词数、累计词次、学习时长、错词数
 *   3. 近 7 天柱状图 ：每天学了多少词，一眼看出有没有断
 *   4. 累计成长曲线  ：已学词数随天数上升的折线
 *   5. 30 天热力图   ：哪天学了哪天没学，坚持度一目了然
 *   6. 词书进度条    ：两本书各学到百分之几
 *   7. 正确率       ：答对 / 总判定
 */
import { useMemo } from 'react'
import { BarChart, Heatmap, RingProgress, TrendLine } from './charts'
import type { BarDatum } from './charts'
import { formatDuration } from '../hooks/useStats'
import { localDayKey } from '../engine/recall'
import type { BookStats } from '../engine/recall'
import type { BookId } from '../types'

interface Props {
  stats: Record<BookId, BookStats>
  /** 两本书各自的错词数（错词本在 useStats 的 store.wrong 里，不在 BookStats 上） */
  wrongCounts: Record<BookId, number>
  /** 两本书各自的总词数；null 表示还在加载 */
  totals: Record<BookId, number | null>
  bookNames: Record<BookId, string>
  onBack: () => void
}

/** 每日目标：新学 30 词。可后续做成设置项 */
const DAILY_GOAL = 30

export default function Statistics({ stats, wrongCounts, totals, bookNames, onBack }: Props) {
  /** 最近 N 天的日期键（含今天，按时间正序） */
  const recentDays = (n: number) => {
    const out: string[] = []
    const now = Date.now()
    for (let i = n - 1; i >= 0; i--) {
      out.push(localDayKey(now - i * 86400000))
    }
    return out
  }

  const merged = useMemo(() => {
    const days = recentDays(30)
    const daily: Record<string, { newWords: number; reviews: number; studyMs: number; correct: number }> = {}
    // 两本书的每日数据按日期合并（用户不关心是哪本学的，只看总投入）
    for (const id of ['book1', 'book2'] as BookId[]) {
      const d = stats[id]?.daily ?? {}
      for (const [k, v] of Object.entries(d)) {
        const cur = daily[k] ?? { newWords: 0, reviews: 0, studyMs: 0, correct: 0 }
        daily[k] = {
          newWords: cur.newWords + v.newWords,
          reviews: cur.reviews + v.reviews,
          studyMs: cur.studyMs + v.studyMs,
          correct: cur.correct + v.correct,
        }
      }
    }
    return { days, daily }
  }, [stats])

  const today = localDayKey(Date.now())
  const todayStat = merged.daily[today] ?? { newWords: 0, reviews: 0, studyMs: 0, correct: 0 }

  const totalLearned = stats.book1.learnedIds.length + stats.book2.learnedIds.length
  const totalReviews = stats.book1.reviews + stats.book2.reviews
  const totalStudyMs = stats.book1.studyMs + stats.book2.studyMs
  const totalWrong = wrongCounts.book1 + wrongCounts.book2
  const totalCorrect = Object.values(merged.daily).reduce((n, d) => n + d.correct, 0)
  const accuracy = totalReviews > 0 ? Math.round((totalCorrect / totalReviews) * 100) : 0

  // 近 7 天柱状图
  const weekBars: BarDatum[] = useMemo(() => {
    const last7 = merged.days.slice(-7)
    return last7.map((k) => {
      const d = merged.daily[k]
      const isToday = k === today
      const dt = new Date(k)
      const label = isToday ? '今天' : `${dt.getMonth() + 1}/${dt.getDate()}`
      return { key: isToday ? 'today' : k, label, value: d?.newWords ?? 0 }
    })
  }, [merged, today])

  // 累计成长曲线：从第一天到今天的已学词数累加
  const trend = useMemo(() => {
    const keys = Object.keys(merged.daily).sort()
    if (!keys.length) return []
    let acc = 0
    const pts: { label: string; value: number }[] = []
    for (const k of keys) {
      acc += merged.daily[k].newWords
      const dt = new Date(k)
      pts.push({ label: `${dt.getMonth() + 1}/${dt.getDate()}`, value: acc })
    }
    return pts
  }, [merged])

  // 30 天热力图
  const heat = useMemo(
    () => merged.days.map((k) => ({ date: k, value: merged.daily[k]?.newWords ?? 0 })),
    [merged],
  )

  const cards: { label: string; value: string; hint?: string; accent?: boolean }[] = [
    { label: '已学词数', value: String(totalLearned), hint: '认识的去重词' },
    { label: '累计词次', value: String(totalReviews), hint: '判定总次数' },
    { label: '学习时长', value: formatDuration(totalStudyMs), hint: '累计投入' },
    { label: '待复习错词', value: String(totalWrong), hint: '错词本里', accent: totalWrong > 0 },
  ]

  return (
    <div className="min-h-[100svh] pb-24">
      <div className="app-shell pt-4">
        <header className="flex items-center gap-3">
          <button
            onClick={onBack}
            aria-label="返回首页"
            className="-ml-1 flex h-9 items-center gap-1 rounded-full pl-1 pr-2 text-ink-700 transition active:bg-ink-100"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[13px]">返回</span>
          </button>
          <h1 className="flex-1 text-center text-[16px] font-semibold text-ink-900">学习数据</h1>
          <div className="w-14" />
        </header>

        {/* ---------- 今日概览 ---------- */}
        <section className="card mt-4 flex items-center gap-5 p-5">
          <RingProgress
            value={todayStat.newWords}
            total={DAILY_GOAL}
            label="今日目标"
            sublabel={`${todayStat.newWords} / ${DAILY_GOAL} 词`}
          />
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] text-ink-400">今日学习</span>
              <span className="text-[13px] font-medium tabular-nums text-ink-900">
                {formatDuration(todayStat.studyMs)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] text-ink-400">今日判定</span>
              <span className="text-[13px] font-medium tabular-nums text-ink-900">{todayStat.reviews} 次</span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] text-ink-400">总体正确率</span>
              <span className="text-[13px] font-medium tabular-nums text-ink-900">
                {totalReviews > 0 ? `${accuracy}%` : '—'}
              </span>
            </div>
            <p className="pt-0.5 text-[11px] leading-relaxed text-ink-300">
              {todayStat.newWords >= DAILY_GOAL
                ? '今天达标了，保持住'
                : `还差 ${DAILY_GOAL - todayStat.newWords} 个词达标`}
            </p>
          </div>
        </section>

        {/* ---------- 核心数字 ---------- */}
        <section className="mt-3 grid grid-cols-2 gap-2.5">
          {cards.map((c) => (
            <div key={c.label} className="card p-3.5">
              <p className="text-[11.5px] text-ink-400">{c.label}</p>
              <p
                className={`mt-1 font-word text-[22px] font-bold leading-none tabular-nums ${
                  c.accent ? 'text-rose-600' : 'text-ink-900'
                }`}
              >
                {c.value}
              </p>
              {c.hint && <p className="mt-1 text-[10.5px] text-ink-300">{c.hint}</p>}
            </div>
          ))}
        </section>

        {/* ---------- 近 7 天 ---------- */}
        <section className="card mt-3 p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[13.5px] font-semibold text-ink-900">近 7 天新学</h2>
            <span className="text-[11px] tabular-nums text-ink-400">
              合计 {weekBars.reduce((n, b) => n + b.value, 0)} 词
            </span>
          </div>
          <BarChart data={weekBars} height={104} />
        </section>

        {/* ---------- 成长曲线 ---------- */}
        <section className="card mt-3 p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-[13.5px] font-semibold text-ink-900">累计成长</h2>
            <span className="text-[11px] tabular-nums text-ink-400">共 {totalLearned} 词</span>
          </div>
          <TrendLine points={trend} height={92} />
        </section>

        {/* ---------- 30 天热力图 ---------- */}
        <section className="card mt-3 p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[13.5px] font-semibold text-ink-900">近 30 天坚持度</h2>
            <span className="text-[11px] tabular-nums text-ink-400">
              打卡 {heat.filter((d) => d.value > 0).length} 天
            </span>
          </div>
          <Heatmap days={heat} />
        </section>

        {/* ---------- 词书进度 ---------- */}
        <section className="card mt-3 p-4">
          <h2 className="mb-3 text-[13.5px] font-semibold text-ink-900">词书进度</h2>
          <div className="space-y-3.5">
            {(['book1', 'book2'] as BookId[]).map((id) => {
              const learned = stats[id].learnedIds.length
              const total = totals[id] ?? 0
              const pct = total > 0 ? Math.round((learned / total) * 100) : 0
              return (
                <div key={id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-[12.5px] text-ink-700">{bookNames[id]}</span>
                    <span className="shrink-0 text-[11.5px] tabular-nums text-ink-400">
                      {learned} / {total > 0 ? total : '…'} · {pct}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        id === 'book1' ? 'bg-brand-500' : 'bg-amber-400'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <p className="mt-4 pb-2 text-center text-[10.5px] leading-relaxed text-ink-300">
          数据全部存在本机浏览器，换设备请用设置里的「导出进度」备份
        </p>
      </div>
    </div>
  )
}
