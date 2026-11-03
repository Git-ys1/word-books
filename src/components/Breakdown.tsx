/**
 * 拆解内容展示组件。
 *
 * 规范见 docs/背诵逻辑规范.md「点击拆解后展开什么」。
 *
 * 核心要求：**点开拆解必须有信息增量**。
 * 绝不能出现「act → 点拆解 → 只有 act」这种空转，
 * 如果原文确实没有拆解信息，就退化为展示释义，保证用户点开一定看到有用的东西。
 *
 * 按 Segment.role 上色：
 * - root    主色蓝紫（词根是记忆锚点，用最重的色）
 * - affix   琥珀橙（词缀是可变部分，暖色区分）
 * - latin   青绿（其它词素）
 * - meaning 墨黑（中文释义，中文永远不是词缀）
 * - pos     淡灰（词性缩写 n. v. a.）
 * - link    极淡，只当分隔符号
 */
import type { Segment } from '../types'
import { ROLE_LABEL, ROLE_STYLE } from './roleStyle'

interface Props {
  segments: Segment[]
  /** 记忆方法（书2 的联想记忆、书1 的讲解） */
  memory?: string
  /** 词根串 */
  root?: string
  rootMeaning?: string
  /** 单词本身，用于判断拆解是否空转 */
  word?: string
  /** 单词释义，拆解无内容时作为兜底展示 */
  meaning?: string
}

/** 判断拆解是否「没有信息增量」：去掉 link 和与单词相同的片段后还剩什么 */
function hasRealContent(segments: Segment[], word?: string): boolean {
  const meaningful = segments.filter((s) => {
    if (s.role === 'link') return false
    const t = s.text.trim()
    if (!t) return false
    // 与单词本身完全相同、且是唯一的 root 片段 -> 视为空转
    if (word && t.toLowerCase() === word.toLowerCase()) return false
    return true
  })
  return meaningful.length > 0
}

export default function Breakdown({ segments, memory, root, rootMeaning, word, meaning }: Props) {
  const real = hasRealContent(segments, word)

  return (
    <div className="animate-fade-up">
      {root && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-ink-500">
          <span className="rounded-md bg-ink-100 px-1.5 py-0.5 font-medium text-ink-700">词根</span>
          <span className="font-word text-[15px] font-semibold text-brand-600">{root}</span>
          {rootMeaning && <span className="text-ink-500">{rootMeaning}</span>}
        </div>
      )}

      {real ? (
        <>
          {/* 彩色拆解块：自动换行，手机上两三个色块一行；link 角色渲染成内联小符号 */}
          <div className="flex flex-wrap items-stretch gap-2">
            {segments.map((s, i) => {
              const st = ROLE_STYLE[s.role] ?? ROLE_STYLE.meaning
              // 连接符单独处理：不加框、不占位，只当分隔符号
              if (s.role === 'link') {
                return (
                  <span key={`${s.text}-${i}`} className={`self-center px-0.5 text-[15px] font-light ${st.text}`}>
                    {s.text.trim() || '·'}
                  </span>
                )
              }
              return (
                <div
                  key={`${s.text}-${i}`}
                  className={`flex min-w-[64px] flex-col items-center justify-center rounded-xl border px-3 py-2 ${
                    s.role === 'root' ? 'flex-[2]' : 'flex-1'
                  } ${st.wrap}`}
                >
                  <span
                    className={`whitespace-pre-wrap break-words text-center leading-tight ${st.text} ${
                      s.role === 'latin' ? 'font-word' : ''
                    } ${s.role === 'root' ? 'text-[22px] font-bold' : 'text-[16px] font-semibold'}`}
                  >
                    {s.text}
                  </span>
                  {ROLE_LABEL[s.role] && (
                    <span className={`mt-1 text-[10px] tracking-wide ${st.tag}`}>{ROLE_LABEL[s.role]}</span>
                  )}
                </div>
              )
            })}
          </div>

          {/* 拆解式原文回显：把片段按原顺序拼成一行，方便整体记忆 */}
          <p className="mt-2.5 break-words font-word text-[13px] leading-relaxed text-ink-400">
            {segments.map((s) => s.text).join('')}
          </p>
        </>
      ) : (
        /* 空转兜底：原文没有拆解信息时，展示释义，保证点开有内容 */
        <div className="rounded-xl border border-ink-100 bg-white px-3 py-2.5">
          <p className="text-[11px] font-medium text-ink-400">这个词没有更细的拆解</p>
          {meaning && (
            <p className="mt-1 break-words text-[15px] leading-snug text-ink-900">{meaning}</p>
          )}
        </div>
      )}

      {memory && (
        <div className="mt-3 rounded-xl bg-ink-50 px-3 py-2.5 text-[13.5px] leading-relaxed text-ink-700">
          <span className="mr-1.5 text-[11px] font-medium text-ink-400">记忆</span>
          {memory}
        </div>
      )}
    </div>
  )
}
