/**
 * 拆解片段的配色表（集中管理，方便一处改全局）。
 * Tailwind 类名必须是完整字符串，不能拼接，否则 JIT 扫不到。
 */
import type { SegmentRole } from '../types'

export const ROLE_STYLE: Record<SegmentRole, { wrap: string; text: string; tag: string }> = {
  // 词根：蓝紫主色
  root: {
    wrap: 'border-brand-500/25 bg-brand-50',
    text: 'text-brand-600',
    tag: 'text-brand-500/70',
  },
  // 词缀：琥珀
  affix: {
    wrap: 'border-amber-500/25 bg-amber-50',
    text: 'text-amber-700',
    tag: 'text-amber-600/70',
  },
  // 中文释义：墨黑
  meaning: {
    wrap: 'border-ink-200 bg-white',
    text: 'text-ink-900',
    tag: 'text-ink-400',
  },
  // 拉丁词源：青绿
  latin: {
    wrap: 'border-teal-500/25 bg-teal-50',
    text: 'text-teal-700',
    tag: 'text-teal-600/70',
  },
  // 辅助汉字：洋红
  cjk: {
    wrap: 'border-rose-500/25 bg-rose-50',
    text: 'text-rose-700',
    tag: 'text-rose-600/70',
  },
  // 连接符（+ ：等）：不占视觉重量
  link: {
    wrap: 'border-transparent bg-transparent',
    text: 'text-ink-300',
    tag: 'text-ink-200',
  },
}

export const ROLE_LABEL: Record<SegmentRole, string> = {
  root: '词根',
  affix: '词缀',
  meaning: '释义',
  latin: '词源',
  cjk: '记忆',
  link: '',
}
