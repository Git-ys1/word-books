/**
 * 全应用核心数据结构定义。
 * 词书数据由其它 agent 从 PDF 提取，生成到 src/data/generated/book1.json / book2.json，
 * 这里定义的接口就是双方约定的契约；在真实数据到位前，src/data/mock.ts 提供同构的模拟数据。
 */

/* ============================ 词条拆解 ============================ */

/**
 * 拆解片段角色：
 * - root      词根本体（如 act / spect）
 * - affix     词缀（前缀、后缀，如 pre- / -tion）
 * - meaning   中文释义片段（如 「做；驱使」）
 * - latin     英文词素原文（如 facere、tend）——数据源实际用它标所有英文部分
 * - cjk       中文提示/释义片段（如 「疼的」、「向外」）
 * - link      连接符与标点（如 「 + 」、「：」），不承载语义，渲染时弱化处理
 * - pos       词性缩写（n. v. a. ad. adj.），数据源用它标词性标签
 */
export type SegmentRole = 'root' | 'affix' | 'meaning' | 'latin' | 'cjk' | 'link' | 'pos'

/** 一个拆解片段：UI 会按 role 上不同的颜色 */
export interface Segment {
  /** 片段文本 */
  text: string
  /** 角色，决定配色 */
  role: SegmentRole
}

/* ============================ 词条 ============================ */

/** 统一词条：两本书最终都归一化成这个结构交给背诵引擎 */
export interface WordEntry {
  /** 稳定唯一 ID，用于 localStorage 进度键、复习队列定位。约定格式 book1:act 或 book2:1:trend */
  id: string
  /** 单词原文，如 act、action */
  word: string
  /** 中文释义（已剔除英文同义词） */
  meaning: string
  /** 拆解片段列表，可能为空（纯派生词无拆解） */
  segments: Segment[]
  /** 词根字符串，如 act、tend/tent/tens；书2 特有，书1 也尽量填 */
  root?: string
  /** 词根中文含义，如 「做；驱使」 */
  rootMeaning?: string
  /** 记忆提示（书2 的「词根记忆 / 联想记忆」列） */
  memory?: string
  /** 音标；产品规则不需要音标，默认不填 */
  phonetic?: string
}

/* ============================ 分组 ============================ */

/**
 * 背诵分组：
 * - 书1 按词根块分组（每个 △词根 是一个 group）
 * - 书2 按天分组（第1天 ~ 第10天）
 */
export interface WordGroup {
  /** 分组唯一 ID，如 book1:act、book2:day3 */
  id: string
  /** 展示用标题，如 「△ act = 做；驱使」、「第三天」 */
  title: string
  /** 分组副标题，可选 */
  subtitle?: string
  /** 组内词条，顺序即词书原始出现顺序 */
  entries: WordEntry[]
}

/** 一本词书 */
export interface Book {
  /** book1 | book2 */
  id: BookId
  /** 展示名 */
  name: string
  /** 简介，模式选择页用 */
  desc: string
  /** 分组列表，顺序固定不变 */
  groups: WordGroup[]
}

export type BookId = 'book1' | 'book2'

/* ============================ 背诵模式 ============================ */

/**
 * 三种背诵模式：
 * - sequential   完全顺序：严格按词书出现顺序，不随机
 * - groupShuffle 组内随机：组间顺序固定，只打乱组内；支持从任意组开始
 * - fullRandom   完全随机：全书打乱，不分组
 */
export type ReviewMode = 'sequential' | 'groupShuffle' | 'fullRandom'

/** 学习阶段：第一阶段（看词判断）/ 第二阶段（中文释义四选一） */
export type Stage = 'judge' | 'quiz'

/* ============================ 会话与进度 ============================ */

/** 排队中的一个条目（队列里可能同一个词出现多次，因为「不认识」会延后重排） */
export interface QueueItem {
  /** 词条 ID，对应 WordEntry.id */
  entryId: string
  /** 这是第几次看到它（从 0 开始），用于 UI 显示「第 1 轮 / 第 2 轮」提示 */
  attempt: number
  /** 来源：新词 or 错词重排 */
  kind: 'new' | 'retry'
}

/** 一次背诵会话的全部状态，会整体持久化到 localStorage */
export interface SessionState {
  /** 会话唯一 ID，换一本书/一个模式就是一个新会话 */
  sessionKey: string
  bookId: BookId
  mode: ReviewMode
  /** groupShuffle 模式下选中的分组 ID，null 表示全书 */
  groupId: string | null
  /** 当前学习阶段 */
  stage: Stage
  /** 待复习队列（引用 entryId） */
  queue: QueueItem[]
  /** 当前队首下标（等价于「已掌握数」；我们采用出队式队列，这里始终为 0，保留字段便于展示） */
  cursor: number
  /** 本轮总目标数（用于进度显示分母） */
  total: number
  /** 已掌握数（进度显示分子） */
  mastered: number
  /** 完全随机模式下的复习池：认识过的词（错词复习阶段从这里出题） */
  reviewPool: string[]
  /** 完全随机模式下的错词池：不认识/选错的词 */
  wrongPool: string[]
  /** 原书中出现过的错词（用于「退出自动进入错词复习」判定） */
  hasWrongPending: boolean
  /** 会话开始时间戳 */
  startedAt: number
  /** 最近一次更新时间戳 */
  updatedAt: number
  /** 是否处于错词复习阶段（完全随机模式退出后触发的加练） */
  inWrongReview: boolean
}

/** 用户偏好设置 */
export interface Settings {
  /** 「不认识」的词插到后面第几个位置（天然形成间隔重复） */
  retryGap: number
  /** 是否自动展开拆解内容（默认不自动，留给用户点） */
  autoExpand: boolean
  /** 是否开启震动反馈 */
  haptic: boolean
}

/* ============================ 四选一 ============================ */

/** 一道中文释义四选一题 */
export interface QuizQuestion {
  entryId: string
  /** 四个选项，纵向排列；每项是被选中的词条 ID */
  options: string[]
  /** 正确项 ID */
  answerId: string
}
