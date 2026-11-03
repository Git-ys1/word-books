/**
 * 底部导航栏 —— 提升可用性，让主要功能一屏可达。
 *
 * 对标主流背单词 App（百词斩 / 墨墨 / 扇贝）的底部 Tab 结构：
 *   首页（学习） | 数据（统计） | 错词本 | 词书（浏览）
 *
 * 设计要点：
 *   - 固定底部 + 安全区适配（iPhone 手势条不能盖住按钮）
 *   - 当前 Tab 高亮为品牌色 + 顶部小横条，位置永远一致
 *   - 只在「非背诵页」显示 —— 背诵时要专注，不能被导航分散
 */
import type { ReactElement } from 'react'

export type TabKey = 'home' | 'stats' | 'wrong' | 'browse'

interface Props {
  active: TabKey
  onChange: (tab: TabKey) => void
  /** 错词本角标数字，0 不显示 */
  wrongCount?: number
}

const TABS: { key: TabKey; label: string; icon: (active: boolean) => ReactElement }[] = [
  {
    key: 'home',
    label: '学习',
    icon: (a) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8}>
        <path d="M3 10.5 12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5.5 9.5V20h13V9.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'stats',
    label: '数据',
    icon: (a) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'wrong',
    label: '错词本',
    icon: (a) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8}>
        <path d="M6 4h12a1 1 0 0 1 1 1v16l-7-4-7 4V5a1 1 0 0 1 1-1z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'browse',
    label: '词书',
    icon: (a) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8}>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v18H6.5A2.5 2.5 0 0 0 4 23V5.5z" strokeLinejoin="round" />
        <path d="M8 7h8M8 11h6" strokeLinecap="round" />
      </svg>
    ),
  },
]

export default function BottomNav({ active, onChange, wrongCount = 0 }: Props) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-white/95 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-[640px] items-stretch">
        {TABS.map((t) => {
          const on = active === t.key
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              aria-current={on ? 'page' : undefined}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition active:bg-ink-50 ${
                on ? 'text-brand-600' : 'text-ink-400'
              }`}
            >
              {/* 当前 Tab 顶部指示条 */}
              {on && <span className="absolute inset-x-5 top-0 h-[2.5px] rounded-b-full bg-brand-500" />}
              <span className="relative">
                {t.icon(on)}
                {t.key === 'wrong' && wrongCount > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold leading-none text-white">
                    {wrongCount > 99 ? '99+' : wrongCount}
                  </span>
                )}
              </span>
              <span className={`text-[10px] ${on ? 'font-medium' : ''}`}>{t.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
