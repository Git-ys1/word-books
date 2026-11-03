/**
 * 数据可视化组件集 —— 全部纯 SVG 手写，不引第三方图表库。
 *
 * 为什么不用 recharts / chart.js：
 *   1. 它们会让主包再涨 100~200KB，手机上首屏更慢
 *   2. 我们只需要 4 种简单图形（环形进度、柱状、折线、日历热力），手写反而更可控
 *   3. SVG 天然清晰、支持深色模式、打印不失真
 *
 * 组件清单（对标主流背单词 App 的统计页）：
 *   - RingProgress  环形完成度（"今天完成 68%"）
 *   - BarChart      每日学习量柱状图（近 7 天 / 14 天）
 *   - TrendLine     累计成长折线（已学词数随时间上升的曲线）
 *   - Heatmap       学习热力图（类似 GitHub 贡献图，一眼看出坚持了几天）
 */
import { useMemo } from 'react'

/* ============================ 环形进度 ============================ */

export function RingProgress({
  value,
  total,
  label,
  sublabel,
  size = 132,
  stroke = 11,
}: {
  value: number
  total: number
  label?: string
  sublabel?: string
  size?: number
  stroke?: number
}) {
  const pct = total > 0 ? Math.min(1, value / total) : 0
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = c * pct

  return (
    <div className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* 底环 */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef1f5" strokeWidth={stroke} />
        {/* 进度环 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          style={{ transition: 'stroke-dasharray .6s cubic-bezier(.4,0,.2,1)' }}
        />
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4f7cff" />
            <stop offset="100%" stopColor="#7c5cff" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-word text-[26px] font-bold leading-none tabular-nums text-ink-900">
          {Math.round(pct * 100)}
          <span className="ml-0.5 text-[13px] font-medium text-ink-400">%</span>
        </span>
        {label && <span className="mt-1 text-[11.5px] text-ink-400">{label}</span>}
        {sublabel && <span className="mt-0.5 text-[10.5px] tabular-nums text-ink-300">{sublabel}</span>}
      </div>
    </div>
  )
}

/* ============================ 柱状图 ============================ */

export interface BarDatum {
  key: string
  label: string
  value: number
}

export function BarChart({ data, unit = '', height = 96 }: { data: BarDatum[]; unit?: string; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div>
      <div className="flex items-end justify-between gap-1" style={{ height }}>
        {data.map((d) => {
          const h = (d.value / max) * (height - 22)
          const isToday = d.key === 'today'
          return (
            <div key={d.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[9.5px] tabular-nums text-ink-400">{d.value > 0 ? d.value : ''}</span>
              <div
                className={`w-full max-w-[22px] rounded-t-md ${
                  isToday ? 'bg-gradient-to-t from-brand-500 to-brand-400' : 'bg-ink-200'
                }`}
                style={{ height: Math.max(d.value > 0 ? 3 : 1, h), transition: 'height .4s ease' }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex justify-between gap-1">
        {data.map((d) => (
          <span
            key={d.key}
            className={`min-w-0 flex-1 truncate text-center text-[9.5px] ${
              d.key === 'today' ? 'font-medium text-brand-600' : 'text-ink-300'
            }`}
          >
            {d.label}
          </span>
        ))}
      </div>
      {unit && <p className="mt-1 text-center text-[10px] text-ink-300">单位：{unit}</p>}
    </div>
  )
}

/* ============================ 累计成长折线 ============================ */

export function TrendLine({
  points,
  height = 88,
}: {
  points: { label: string; value: number }[]
  height?: number
}) {
  const { path, area, max } = useMemo(() => {
    if (points.length < 2) return { path: '', area: '', max: 0 }
    const w = 100
    const maxV = Math.max(1, ...points.map((p) => p.value))
    const step = w / (points.length - 1)
    // 用平滑曲线（Catmull-Rom 简化成二次贝塞尔）让线条更自然
    let d = ''
    points.forEach((p, i) => {
      const x = i * step
      const y = 100 - (p.value / maxV) * 92
      if (i === 0) {
        d += `M ${x} ${y}`
      } else {
        const px = (i - 1) * step
        const py = 100 - (points[i - 1].value / maxV) * 92
        const cx = (px + x) / 2
        d += ` C ${cx} ${py}, ${cx} ${y}, ${x} ${y}`
      }
    })
    return { path: d, area: `${d} L 100 100 L 0 100 Z`, max: maxV }
  }, [points])

  if (points.length < 2) {
    return (
      <div className="flex h-[88px] items-center justify-center text-[12px] text-ink-300">
        再学几天就能看到成长曲线了
      </div>
    )
  }

  return (
    <div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height, width: '100%' }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4f7cff" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#4f7cff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#trendFill)" />
        <path
          d={path}
          fill="none"
          stroke="#4f7cff"
          strokeWidth="2"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-1 flex justify-between text-[9.5px] text-ink-300">
        <span>{points[0].label}</span>
        <span className="tabular-nums text-ink-400">累计 {max}</span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  )
}

/* ============================ 学习热力图 ============================ */

export function Heatmap({ days }: { days: { date: string; value: number }[] }) {
  // 按强度分 4 档，颜色越深学得越多
  const levelOf = (v: number, max: number): number => {
    if (v <= 0) return 0
    const r = v / Math.max(1, max)
    if (r > 0.75) return 4
    if (r > 0.5) return 3
    if (r > 0.25) return 2
    return 1
  }
  const max = Math.max(1, ...days.map((d) => d.value))
  const colors = ['bg-ink-100', 'bg-brand-200', 'bg-brand-300', 'bg-brand-400', 'bg-brand-500']

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => (
          <div
            key={d.date}
            title={`${d.date}：${d.value} 词`}
            className={`aspect-square rounded-[5px] ${colors[levelOf(d.value, max)]}`}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[9.5px] text-ink-300">
        <span>少</span>
        {colors.map((c, i) => (
          <span key={i} className={`h-2.5 w-2.5 rounded-[3px] ${c}`} />
        ))}
        <span>多</span>
      </div>
    </div>
  )
}
