/**
 * 学习记录（统计 + 错词本）的纯函数层。
 *
 * 为什么单独放一个文件、而不是塞进 src/engine/queue.ts：
 *   queue.ts 是背诵引擎的「核心逻辑」，有 selftest 保护、有既定验收口径；
 *   统计与错词本属于「周边统计」，改动频率更高、出错代价更小。
 *   两者解耦后，统计逻辑再怎么改都不会波及背诵流程。
 *
 * 这里的函数全部满足：输入不可变、输出新对象、无副作用，
 * 因此可以直接被 node 自检脚本（scripts/recall-selftest.mts）导入执行。
 */
import type { BookId } from '../types'

/* ============================ 数据结构 ============================ */

/**
 * 一本书的学习统计。
 *
 * 字段口径（写进 UI 之前先对齐，避免「时长算得不对」的扯皮）：
 * - learnedIds  ：认识 / 答对过的词（单词集合），它的 size 就是「已学词数」，
 *                 因为用 Set 语义去重，同一个词重复认识不会把进度刷过总词数。
 * - reviews     ：累计学习词次 = 每一次判定（认识 + 不认识 + 选对 + 选错），
 *                 这是「练了多少遍」，不是「学了多少词」。
 * - studyMs     ：累计学习时长（毫秒），由 useStats 用每次会话打卡的 delta 累加。
 * - updatedAt   ：最后一次变动的本地时间戳（渲染阶段读它，保证 SSR 渲染稳定）。
 */
export interface BookStats {
  learnedIds: string[]
  reviews: number
  studyMs: number
  updatedAt: number
}

/** 错词本里的一条：某个词、错了几次、释义与词根（用来直接展示，不必回查词书） */
export interface WrongWord {
  /** 词条 ID */
  id: string
  /** 单词原文（快照） */
  word: string
  /** 中文释义（快照） */
  meaning: string
  /** 词根，可选，用于列表右侧展示 */
  root?: string
  /** 累计答错次数 */
  count: number
  /** 最近一次答错的时间戳 */
  lastAt: number
}

/** 全部本地学习记录（统计 + 错词本），整体持久化到 localStorage 的独立键 */
export interface RecallStore {
  /** localStorage 结构版本，方便将来迁移 */
  version: number
  stats: Record<BookId, BookStats>
  wrong: Record<BookId, WrongWord[]>
}

/** 空的新词记录：每次 rehydrate 都重新构造，绝不复用同一个引用 */
export function createEmptyStore(): RecallStore {
  return {
    version: 1,
    stats: { book1: emptyStats(), book2: emptyStats() },
    wrong: { book1: [], book2: [] },
  }
}

function emptyStats(): BookStats {
  return { learnedIds: [], reviews: 0, studyMs: 0, updatedAt: 0 }
}

/* ============================ 一次判定的记账 ============================ */

/** 普通判定与错词复习判定的唯一出口，都汇总成这个事件 */
export interface RecallEvent {
  bookId: BookId
  /** 当前判定的词 */
  entryId: string
  word: string
  meaning: string
  root?: string
  /** 判定结果 */
  verdict: 'know' | 'unknown'
  /** 本次属于「错词本专项复习」（结算口径不同，见 recordEvent） */
  drill: boolean
}

/**
 * 把一次判定记进 store。
 *
 * 两条容易踩的口径，这里一次说清楚：
 * 1. 已学词数：只要「认识 / 选对」就记入 learnedIds。错词复习里答对也算学会，
 *    用户不关心这个词是怎么进错词本的。
 * 2. 错词本：
 *    - 普通会话答错 → count + 1，写进错词本；
 *    - 普通会话答对 → 从错词本移除（在别处已经证明会了，就不该再挂在错词本里）；
 *    - 错词复习答对 → 只减 1 次，归零才移除。否则点一次「认识」就把累积的错误次数
 *      全抹掉，错词本的可信度直接归零；答错则 + 1，继续留在本子里。
 */
export function recordEvent(store: RecallStore, ev: RecallEvent, now: number): RecallStore {
  const stats = store.stats[ev.bookId] ?? emptyStats()
  const list = store.wrong[ev.bookId] ?? []

  // ---- 统计 ----
  const learned = new Set(stats.learnedIds)
  if (ev.verdict === 'know') learned.add(ev.entryId)
  const nextStats: BookStats = {
    learnedIds: [...learned],
    reviews: stats.reviews + 1,
    studyMs: stats.studyMs,
    updatedAt: now,
  }

  // ---- 错词本 ----
  const idx = list.findIndex((w) => w.id === ev.entryId)
  let nextList: WrongWord[]
  if (ev.verdict === 'unknown') {
    if (idx >= 0) {
      nextList = list.map((w, i) => (i === idx ? { ...w, count: w.count + 1, lastAt: now } : w))
    } else {
      nextList = [
        ...list,
        { id: ev.entryId, word: ev.word, meaning: ev.meaning, root: ev.root, count: 1, lastAt: now },
      ]
    }
  } else if (idx < 0) {
    nextList = list
  } else if (ev.drill) {
    const hit = list[idx]
    nextList = hit.count <= 1 ? list.filter((_, i) => i !== idx) : list.map((w, i) => (i === idx ? { ...w, count: w.count - 1, lastAt: now } : w))
  } else {
    nextList = list.filter((_, i) => i !== idx)
  }

  return {
    ...store,
    stats: { ...store.stats, [ev.bookId]: nextStats },
    wrong: { ...store.wrong, [ev.bookId]: nextList },
  }
}

/**
 * 累计学习时长。
 *
 * delta 是「这次会话从上次打卡到现在真实停留的秒数」，跨会话、跨天都会累加。
 * 约束：单次增量上限 5 分钟、下限 0。
 *   - 上限：合上手机睡一觉，回来 tab 还在后台，不该白记 8 小时；
 *   - 下限：时钟回拨（系统时间被改）时 delta 为负，直接丢弃而不是倒扣。
 */
export function addStudyMs(store: RecallStore, bookId: BookId, deltaMs: number): RecallStore {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return store
  const capped = Math.min(Math.round(deltaMs), 5 * 60 * 1000)
  const stats = store.stats[bookId] ?? emptyStats()
  return {
    ...store,
    stats: { ...store.stats, [bookId]: { ...stats, studyMs: stats.studyMs + capped } },
  }
}

/* ============================ 展示用的派生数据 ============================ */

/** 错词本排序：错得多的在前，同次数按最近出错时间倒序 */
export function sortWrongList(list: readonly WrongWord[]): WrongWord[] {
  return [...list].sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
}

/** 记忆折扣率：4 次以上才算 S 级老虎机（红色高亮），避免人人都红 */
export function wrongLevel(count: number): 'high' | 'mid' | 'low' {
  if (count >= 4) return 'high'
  if (count >= 2) return 'mid'
  return 'low'
}

/**
 * 读取 store 时做结构修复。
 * localStorage 里的数据可能来自旧版本 / 被手改 / 半截写入，直接信任会白屏，
 * 所以每个字段都按「类型不对就回空」处理。
 */
export function sanitizeStore(raw: unknown): RecallStore {
  const empty = createEmptyStore()
  if (!raw || typeof raw !== 'object') return empty
  const data = raw as Record<string, unknown>
  const statsRaw = (data.stats ?? {}) as Record<string, unknown>
  const wrongRaw = (data.wrong ?? {}) as Record<string, unknown>

  const pickStats = (v: unknown): BookStats => {
    if (!v || typeof v !== 'object') return emptyStats()
    const o = v as Record<string, unknown>
    return {
      learnedIds: Array.isArray(o.learnedIds)
        ? o.learnedIds.filter((x): x is string => typeof x === 'string')
        : [],
      reviews: typeof o.reviews === 'number' && Number.isFinite(o.reviews) && o.reviews > 0 ? Math.floor(o.reviews) : 0,
      studyMs: typeof o.studyMs === 'number' && Number.isFinite(o.studyMs) && o.studyMs > 0 ? Math.floor(o.studyMs) : 0,
      updatedAt: typeof o.updatedAt === 'number' && Number.isFinite(o.updatedAt) ? o.updatedAt : 0,
    }
  }

  const pickWrong = (v: unknown): WrongWord[] => {
    if (!Array.isArray(v)) return []
    return v
      .filter((w): w is Record<string, unknown> => !!w && typeof w === 'object')
      .filter((w) => typeof w.id === 'string' && typeof w.word === 'string')
      .map((w) => ({
        id: String(w.id),
        word: String(w.word),
        meaning: typeof w.meaning === 'string' ? w.meaning : '',
        root: typeof w.root === 'string' && w.root ? w.root : undefined,
        count: typeof w.count === 'number' && w.count > 0 ? Math.floor(w.count) : 1,
        lastAt: typeof w.lastAt === 'number' && Number.isFinite(w.lastAt) ? w.lastAt : 0,
      }))
  }

  return {
    version: 1,
    stats: {
      book1: pickStats(statsRaw.book1),
      book2: pickStats(statsRaw.book2),
    },
    wrong: {
      book1: pickWrong(wrongRaw.book1),
      book2: pickWrong(wrongRaw.book2),
    },
  }
}
