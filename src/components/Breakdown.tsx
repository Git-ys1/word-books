/**
 * 拆解展示 —— 一行彩色拆解式，用户明确要求的唯一形态。
 *
 * 核心形态（这是标准答案，不要发明别的排版）：
 *      ex向外 + tend伸展 = 扩大
 *   不同构件用不同颜色区分，一眼看出「哪些是前缀、哪些是词根、哪些是中文」。
 *
 * 两种词书的格式本来就不同：
 *   书1（词根版）：词条行是 `单词=拆解式=中文对照=词义`
 *        counter + act = 相反 + 做
 *   书2（速记版）：没有拆解式，只有「词根记忆 / 联想记忆」一列原文
 *        pro前 + ceed走，前进
 *
 * 右上角已经显示词根，**拆解区不再单独放词根块**。
 */
import type { Segment } from '../types'

interface Props {
  segments: Segment[]
  /** 书2 的记忆列原文 */
  memory?: string
  /** 单词释义，展示在拆解式下方 */
  meaning?: string
  /** 词书 id：book1 用 segments 拼拆解式，book2 用 memory */
  bookId?: string
}

/** 构件颜色：不同词性角色不同颜色，中文和英文一眼区分 */
const ROLE_STYLE: Record<string, { text: string; en?: boolean }> = {
  root: { text: 'text-brand-600', en: true }, // 词根：蓝紫
  affix: { text: 'text-amber-600', en: true }, // 前缀/后缀：琥珀
  latin: { text: 'text-teal-600', en: true }, // 其它英文词素：青绿
  meaning: { text: 'text-ink-900' }, // 中文对照：墨黑
  cjk: { text: 'text-ink-900' },
  pos: { text: 'text-ink-400' }, // 词性 n. v. a.
  link: { text: 'text-ink-300' }, // 连接符 + = 
}

/**
 * 书1：把 segments 渲染成一行彩色拆解式。
 * 原书的 segments 顺序本身就是 `a + b = A + B`，
 * 直接按顺序输出，靠颜色区分角色，不再拆成上下两行。
 */
function InlineBreakdown({ segments }: { segments: Segment[] }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-0.5 gap-y-1 leading-relaxed">
      {segments.map((s, i) => {
        const st = ROLE_STYLE[s.role] ?? ROLE_STYLE.meaning
        const isLink = s.role === 'link'
        const text = s.text.trim()
        if (!text) return null
        // 严格按词书原样展示：词性标记（a. n. v. ad.）是原书对英文构件的解释，
        // 说明「这一段是形容词/名词/动词」，属于拆解内容的一部分，必须保留。
        // 之前把它过滤掉是本末倒置 —— 原书每一段都要如实呈现。
        return (
          <span
            key={i}
            className={`${st.text} ${isLink ? 'px-1 text-[15px] font-light' : st.en ? 'font-word text-[17px] font-semibold' : 'text-[15px] font-medium'}`}
          >
            {text}
          </span>
        )
      })}
    </div>
  )
}

export default function Breakdown({ segments, memory, meaning, bookId }: Props) {
  const isBook2 = bookId === 'book2'

  /* ---------- 书2：原文只有「词根记忆 / 联想记忆」一列 ---------- */
  if (isBook2) {
    return (
      <div className="animate-fade-up space-y-2.5">
        {memory ? (
          <div className="rounded-xl bg-white px-3 py-2.5">
            <ColorizedMemory text={memory} />
          </div>
        ) : (
          <p className="rounded-xl bg-ink-50 px-3 py-2.5 text-[13px] text-ink-400">
            原书这一条没有记忆内容
          </p>
        )}
        {meaning && <MeaningLine meaning={meaning} />}
      </div>
    )
  }

  /* ---------- 书1：一行彩色拆解式 ex向外 + tend伸展 = 扩大 ---------- */
  // 需要「有拆解」才算数：去掉 link 后至少还有 1 个构件，且不是单词自身
  const real = (segments || []).some(
    (s) => s.role !== 'link' && s.text.trim() && s.role !== 'pos',
  )

  return (
    <div className="animate-fade-up space-y-2.5">
      {real ? (
        <div className="rounded-xl bg-white px-3 py-2.5">
          <InlineBreakdown segments={segments} />
        </div>
      ) : (
        <p className="rounded-xl bg-ink-50 px-3 py-2.5 text-[13px] text-ink-400">
          原书这个词没有拆解
        </p>
      )}
      {meaning && <MeaningLine meaning={meaning} />}
    </div>
  )
}

function MeaningLine({ meaning }: { meaning: string }) {
  return (
    <p className="break-words rounded-xl bg-ink-50 px-3 py-2 text-[14px] leading-snug text-ink-700">
      {meaning}
    </p>
  )
}

/**
 * 书2 的记忆列上色。
 *
 * 原书这一列形如「pro前 + ceed走，前进」「ex向外 + tend伸展」，
 * 本身就是「英文构件 + 中文含义」的紧凑写法。
 * 这里按 + 号切片，再把每片里「英文前缀」和「中文」分色，
 * 保持与书1 拆解式一致的视觉语言：英文一种色、中文墨黑。
 */
function ColorizedMemory({ text }: { text: string }) {
  // 按 + 切成构件，保留分隔符
  const parts = text.split(/(\s*\+\s*)/)
  return (
    <p className="break-words leading-relaxed">
      {parts.map((part, i) => {
        if (/^\s*\+\s*$/.test(part)) {
          return (
            <span key={i} className="px-1 text-[15px] font-light text-ink-300">
              +
            </span>
          )
        }
        // 一片里的「英文部分」和「中文部分」分色
        const m = part.match(/^([A-Za-z][A-Za-z()\-\s]*)([\s\S]*)$/)
        if (m && m[2]) {
          return (
            <span key={i}>
              <span className="font-word text-[16px] font-semibold text-brand-600">{m[1].trimEnd()}</span>
              <span className="text-[15px] text-ink-900">{m[2]}</span>
            </span>
          )
        }
        return (
          <span key={i} className="font-word text-[16px] font-semibold text-brand-600">
            {part}
          </span>
        )
      })}
    </p>
  )
}
