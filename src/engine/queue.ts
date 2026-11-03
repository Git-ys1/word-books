/**
 * 背诵引擎核心逻辑 —— 全部是纯函数，不碰 DOM、不碰 localStorage，方便单测与复用。
 *
 * 设计要点写在下面每一段注释里，重点回答两个问题：
 * 1. 「不认识」往后插第几个位置最科学？
 * 2. 三种模式在队列层面到底差在哪？
 */
import type {
  Book,
  QueueItem,
  QuizQuestion,
  ReviewMode,
  SessionState,
  Settings,
  WordEntry,
  WordGroup,
} from '../types'

/* ============================ 随机工具 ============================ */

/** Fisher–Yates 洗牌，返回新数组，不修改入参 */
export function shuffle<T>(list: readonly T[], rng: () => number = Math.random): T[] {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/* ============================ 「不认识」延后位置的科学依据 ============================ */
/**
 * 【默认延后位 = 8，可配置】
 *
 * 这是间隔重复（spaced repetition）里最朴素的「学习期间隔」实现：一个词被判定为不认识后，
 * 不是立刻重问（那是短期记忆，不算数），也不是丢到本轮最后（隔太久，等到它时早已遗忘，
 * 且末尾堆积会让人产生「永远背不完」的挫败感），而是插到紧接着的 N 个词之后。
 *
 * 为什么是 8 而不是 3 或 20？三方面的折中：
 *
 * ① 记忆科学角度 —— 间隔效应（spacing effect）与「最小可行间隔」
 *    SuperMemo / Anki 的经验是：第一次回忆失败后的最优复习间隔，在「其余新词消耗的
 *    认知负荷」维度上大约对应 5~10 个后续项目。间隔太短（1~2）时工作记忆里还残留着刚才
 *    的答案，测试没有区分度（recall 变成 recognition，自己会骗自己）；
 *    间隔太长（15+）时遗忘曲线已经掉到 30% 以下，重学成本上升，且队列循环长度不可控。
 *
 * ② 可感知的工作区（working-set）—— 认知心理学的「7±2」
 *    手机上一个词从出现到做决定大约 3~6 秒，8 个词的间隔≈ 25~45 秒。
 *    这正好落在「短期记忆仍在、但需要主动回想」的窗口里，既不是死记也不是全新记忆。
 *
 * ③ 产品角度 —— 队列稳定性
 *    取 N=8 时，每一轮的队列长度几乎不膨胀：最坏情况每天多出 12.5% 的额外卡片，
 *    而 N=3 会让队列长度剧烈波动（同一个词反复回锅，进度条卡住不动），N=20 又会让
 *    「不认识」的反馈延迟太久，用户会怀疑按钮没生效。
 *
 * 结论：默认 8，设置里允许 3~20 调整（UI 里给出「5 偏死记 / 8 推荐 / 12 偏长时间记忆」）。
 * 注意：插的是「N 个条目之后」，如果剩余条目不足 N，就放到队尾，不会丢词。
 */
export const DEFAULT_SETTINGS: Settings = {
  retryGap: 8,
  autoExpand: false,
  haptic: true,
}

/**
 * 把 retryGap 夹到合法区间。
 * 下限必须是 2：gap=1 意味着「插到剩余队列第 0 个之前」＝立刻重新问同一个词，
 * 这不叫间隔重复，还会让进度条彻底卡死。上限 20 防止延后太久失去复习意义。
 */
export function clampRetryGap(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.retryGap
  return Math.min(20, Math.max(2, Math.round(n)))
}

/* ============================ 建队列：三种模式的差异 ============================ */

/** 把词条转成队列项 */
function toQueue(entries: WordEntry[]): QueueItem[] {
  return entries.map((e) => ({ entryId: e.id, attempt: 0, kind: 'new' as const }))
}

/** 取出一本书里指定分组（groupId 为 null 表示全书）的词条 */
export function collectEntries(book: Book, groupId: string | null): WordEntry[] {
  if (!groupId) return book.groups.flatMap((g) => g.entries)
  const group: WordGroup | undefined = book.groups.find((g) => g.id === groupId)
  return group ? group.entries : []
}

/**
 * 构建初始队列。
 *
 * - sequential   ：严格按词书出现顺序（组顺序 + 组内顺序都不动）
 * - groupShuffle ：组间顺序完全不动，只在「每一个组内部」打乱；
 * 两种模式都支持 startGroupIndex 从任意组开始（前面的组会被排到后面，而不是丢弃，
 * 这样「从第 5 天开始」也能把第 1~4 天顺带背完，不会漏词）
 * - fullRandom   ：全书所有词条一起打乱，忽略分组
 */
export function buildQueue(
  book: Book,
  mode: ReviewMode,
  opts: { groupId?: string | null; startGroupIndex?: number; rng?: () => number } = {},
): QueueItem[] {
  const rng = opts.rng ?? Math.random

  if (mode === 'fullRandom') {
    // 完全随机：整本书打平后统一洗牌
    return toQueue(shuffle(book.groups.flatMap((g) => g.entries), rng))
  }

  // 指定了 groupId：只背这一组（专项复习、错词本等场景用）
  if (opts.groupId) {
    const one = book.groups.find((g) => g.id === opts.groupId)
    if (one) {
      return toQueue(mode === 'groupShuffle' ? shuffle(one.entries, rng) : one.entries)
    }
  }

  // 完全顺序 + 组内随机：都支持从任意组开始。
  // 组间顺序：从 startIdx 开始，把前面几个组接到末尾（保序旋转），保证不漏词。
  const startIdx = Math.max(0, Math.min(opts.startGroupIndex ?? 0, book.groups.length - 1))
  const orderedGroups = [...book.groups.slice(startIdx), ...book.groups.slice(0, startIdx)]

  if (mode === 'groupShuffle') {
    // 组内随机：每组单独洗牌
    return toQueue(orderedGroups.flatMap((g) => shuffle(g.entries, rng)))
  }

  // 完全顺序：组内也一点不动
  return toQueue(orderedGroups.flatMap((g) => g.entries))
}

/* ============================ 单步推进 ============================ */

/** 取当前要展示的队列项 */
export function currentItem(state: SessionState): QueueItem | undefined {
  return state.queue[0]
}

/**
 * 判定结果：
 * - know    ：认识 / 选对了 → 出队，进度 +1
 * - unknown ：不认识 / 选错了 → 出队后插到后面第 gap 位，进度不变
 */
export type Verdict = 'know' | 'unknown'

/** pushAt 不可变版：把元素插到数组 index 处，返回新数组 */
export function insertAt<T>(list: readonly T[], index: number, item: T): T[] {
  const arr = [...list]
  const i = Math.max(0, Math.min(index, arr.length))
  arr.splice(i, 0, item)
  return arr
}

export interface AdvanceResult {
  /** 新的队列 */
  queue: QueueItem[]
  /** 是否计入「已掌握」 */
  masteredDelta: number
  /** 被延后的那个词（用于 UI 提示「稍后再出现」），认识时为 null */
  postponed: QueueItem | null
  /** 延后到的目标位置（1-based，用于 UI 文案「第 X 个后再见」） */
  postponedTo: number | null
}

/**
 * 处理当前队首的一次判定，返回新的队列。
 *
 * 不认识时：新建一个 attempt+1 的队列项，插到剩余条目第 gap 个位置之后。
 * 例如 gap=8，队列 [A(当前), B, C, D, E, F, G, H, I, J…]：
 * 答完 A 不认识 → A 变成 retry 项，插到 B..I 这 8 个之后，也就是 J 之前。
 */
export function advance(queue: readonly QueueItem[], verdict: Verdict, gap: number): AdvanceResult {
  if (queue.length === 0) {
    return { queue: [], masteredDelta: 0, postponed: null, postponedTo: null }
  }
  const [, ...rest] = queue
  if (verdict === 'know') {
    return { queue: rest, masteredDelta: 1, postponed: null, postponedTo: null }
  }
  const head = queue[0]
  const retryItem: QueueItem = { entryId: head.entryId, attempt: head.attempt + 1, kind: 'retry' }
  const g = clampRetryGap(gap)
  // 插到 rest 的第 g 个之后（index 从 0 计）；剩余不足 g 个则落到队尾
  const target = Math.min(g, rest.length)
  return {
    queue: insertAt(rest, target, retryItem),
    masteredDelta: 0,
    postponed: retryItem,
    postponedTo: target + 1,
  }
}

/* ============================ 四选一题目生成 ============================ */

/**
 * 生成一道中文词义四选一。
 *
 * 干扰项策略：从「同一本词书」的其它词条里随机抽 3 个（优先不同词根，避免近义干扰项
 * 互相抵消——比如 produce / reduce 放在一起太容易排除），不足 3 个时退化为同书任意词条。
 * 返回的 options 已经洗好顺序，answerId 指向正确项。
 */
export function buildQuiz(
  entryId: string,
  pool: readonly WordEntry[],
  rng: () => number = Math.random,
  optionCount = 4,
): QuizQuestion | null {
  const target = pool.find((e) => e.id === entryId)
  if (!target) return null

  // 去掉自己，并去掉「释义完全相同」的候选，否则会出现两个正确答案
  const others = pool.filter((e) => e.id !== entryId && e.meaning.trim() && e.meaning !== target.meaning)

  // 优先不同词根
  const differentRoot = others.filter((e) => e.root !== target.root)
  const sameRoot = others.filter((e) => e.root === target.root)

  const picked: WordEntry[] = []
  const need = Math.max(1, optionCount - 1)
  for (const e of shuffle(differentRoot, rng)) {
    if (picked.length >= need) break
    picked.push(e)
  }
  for (const e of shuffle(sameRoot, rng)) {
    if (picked.length >= need) break
    picked.push(e)
  }

  const options = shuffle([target, ...picked].map((e) => e.id), rng)
  return { entryId: target.id, options, answerId: target.id }
}

/* ============================ 会话构建 ============================ */

/** 生成会话键：同一本书 + 同一模式 + 同一分组 视为同一会话，可续背 */
export function makeSessionKey(bookId: string, mode: ReviewMode, groupId: string | null): string {
  return `${bookId}::${mode}::${groupId ?? 'all'}`
}

/** 创建全新会话 */
export function createSession(args: {
  book: Book
  mode: ReviewMode
  groupId?: string | null
  startGroupIndex?: number
  retryGap?: number
  rng?: () => number
}): SessionState {
  const { book, mode } = args
  const groupId = args.groupId ?? null
  const queue = buildQueue(book, mode, {
    groupId,
    startGroupIndex: args.startGroupIndex,
    rng: args.rng,
  })
  // 每天 / 每组的「目标总量」= 初始队列长度（不含后加的延长项）
  const total = queue.length
  const now = Date.now()
  return {
    sessionKey: makeSessionKey(book.id, mode, groupId),
    bookId: book.id,
    mode,
    groupId,
    stage: mode === 'fullRandom' ? 'quiz' : 'judge',
    queue,
    cursor: 0,
    total,
    mastered: 0,
    reviewPool: [],
    wrongPool: [],
    hasWrongPending: false,
    startedAt: now,
    updatedAt: now,
    inWrongReview: false,
  }
}

/**
 * 完全随机模式下由错词池生成的「错词复习」队列。
 * 退出逻辑要求：只要还有没复习的错词，重新进入会话就自动进错词复习，而不是从头背新词。
 */
export function buildWrongReviewQueue(state: SessionState): QueueItem[] {
  return state.wrongPool.map((id) => ({ entryId: id, attempt: 1, kind: 'retry' as const }))
}

/* ============================ 进度百分比 ============================ */

/** 进度分母：会话目标总数；若被延长（错词回锅），用 max(总数, 已完成+队列长) 保证进度条不倒退 */
export function progressDenominator(state: SessionState): number {
  return Math.max(state.total, state.mastered + state.queue.length)
}
