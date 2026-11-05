/**
 * 应用根组件：负责页面切换、会话状态、持久化与退出逻辑。
 *
 * 页面状态机（没有引入路由库）：
 *   home  →  recite（背诵）
 *   home  →  browse（课外词书浏览，只读，完全不影响会话）
 *   home  →  wrong （错词本）
 *   wrong →  recite（错词本专项复习）
 *   弹出层：设置、退出确认
 *
 * 三层数据各管各的 localStorage 键，互不污染：
 *   session  —— 当前这一轮的队列与进度（SessionState，见 types.ts，结构未改动）
 *   settings —— 用户偏好
 *   stats    —— 累计统计 + 错词本（见 hooks/useStats.ts）
 *
 * 记账链路：
 *   ReciteSession 每完成一次判定 → onRecall(结构化事件)
 *   → App.recordRecall 判定「这次算不算错词复习」→ useStats.recordEvent（纯函数）
 * 也就是说「已学词数 / 累计词次 / 错词本」全部由判定事件派生，
 * 不需要在会话结构里加任何新字段，老版本存下的会话数据依旧能读。
 *
 * 词书数据是异步按需加载的（见 src/data/index.ts），
 * 这样首屏只下载应用代码，不把 2.4MB 词书塞进主包。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import BookBrowser from './components/BookBrowser'
import BottomNav from './components/BottomNav'
import type { TabKey } from './components/BottomNav'
import ExitDialog from './components/ExitDialog'
import Home from './components/Home'
import type { BookCard, BookStatsView } from './components/Home'
import ReciteSession from './components/ReciteSession'
import type { RecallSubmit } from './components/ReciteSession'
import SettingsSheet from './components/SettingsSheet'
import Statistics from './components/Statistics'
import WrongBook from './components/WrongBook'
import { BOOK_META, buildEntryIndex, flattenEntries, loadBook } from './data'
import type { BookLoadResult } from './data'
import { clampRetryGap, DEFAULT_SETTINGS } from './engine/queue'
import type { BookId, SessionState, Settings } from './types'
import { usePersistentState, removeStorage } from './hooks/usePersistentState'
import { useStats } from './hooks/useStats'

type Screen = 'home' | 'recite' | 'browse' | 'wrong' | 'stats'

const KEY_SESSION = 'session'
const KEY_SETTINGS = 'settings'

/**
 * 错词本专项复习的「轮次标记」。
 * 为什么需要它：判定事件里必须知道「这次判定算不算错词复习」——
 * 复习答对时是「出错次数 -1」，而不是像普通会话那样整条删掉。
 * 标记写进 sessionKey 前缀，刷新页面后依然可辨认。
 */
const DRILL_PREFIX = 'drill:'

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [session, setSession, flushSession] = usePersistentState<SessionState | null>(KEY_SESSION, null)
  const [settings, setSettings] = usePersistentState<Settings>(KEY_SETTINGS, DEFAULT_SETTINGS)
  const [showSettings, setShowSettings] = useState(false)
  const [showExit, setShowExit] = useState(false)
  /** 浏览页当前选中的书（独立于会话的纯 UI 状态） */
  const [browseBookId, setBrowseBookId] = useState<BookId>('book1')
  /** 错词本当前选中的书 */
  const [wrongBookId, setWrongBookId] = useState<BookId>('book1')

  const stats = useStats()
  const recordEvent = stats.recordEvent
  const addStudyTime = stats.addStudyTime
  const statsForBook = stats.forBook

  /* ---------- 词书异步加载 ---------- */

  // 已加载词书缓存（bookId -> 结果），避免切换时重复请求
  const [loaded, setLoaded] = useState<Partial<Record<BookId, BookLoadResult>>>({})
  // 首页要展示两本书的统计，进入时预取。
  // 顺序有讲究：book2 体积小（约 240KB）先拉，book1 大（约 930KB）后拉，
  // 这样手机弱网下也能尽快看到一本书可用，而不是两本都在转圈。
  useEffect(() => {
    let alive = true
    const order: BookId[] = ['book2', 'book1']
    order.forEach((id) => {
      loadBook(id).then((r) => {
        if (alive) setLoaded((prev) => ({ ...prev, [id]: r }))
      })
    })
    return () => {
      alive = false
    }
  }, [])

  // 背诵 / 浏览 / 错词本如果指向某本还没加载完的书，也要拉一次
  useEffect(() => {
    const need: BookId | null =
      screen === 'recite' ? session?.bookId ?? null : screen === 'browse' ? browseBookId : screen === 'wrong' ? wrongBookId : null
    if (!need || loaded[need]) return
    let alive = true
    loadBook(need).then((r) => {
      if (alive) setLoaded((prev) => ({ ...prev, [need]: r }))
    })
    return () => {
      alive = false
    }
  }, [screen, session, loaded, browseBookId, wrongBookId])

  const activeBook = session ? loaded[session.bookId]?.book ?? null : null
  const entryIndex = useMemo(
    () => (activeBook ? buildEntryIndex(activeBook) : new Map()),
    [activeBook],
  )
  const allEntries = useMemo(
    () => (activeBook ? flattenEntries(activeBook) : []),
    [activeBook],
  )

  /** 每本书的展示信息（名称 / 描述 / 是否示例数据 / 词数 / 词书本体） */
  const books = useMemo(
    () =>
      ({
        book1: {
          ...BOOK_META.book1,
          name: loaded.book1?.book.name ?? BOOK_META.book1.name,
          isMock: loaded.book1?.isMock ?? false,
          count: loaded.book1 ? flattenEntries(loaded.book1.book).length : null,
          book: loaded.book1?.book ?? null,
        },
        book2: {
          ...BOOK_META.book2,
          name: loaded.book2?.book.name ?? BOOK_META.book2.name,
          isMock: loaded.book2?.isMock ?? false,
          count: loaded.book2 ? flattenEntries(loaded.book2.book).length : null,
          book: loaded.book2?.book ?? null,
        },
      }) as Record<BookId, BookCard>,
    [loaded],
  )

  /** 首页统计视图：从 useStats 派生，只给首页要用的 4 个数字 */
  const statsView = useMemo(() => {
    const make = (id: BookId): BookStatsView => {
      const s = statsForBook(id)
      return { learned: s.learned, reviews: s.reviews, studyMs: s.studyMs, wrongCount: s.wrongCount }
    }
    return { book1: make('book1'), book2: make('book2') } as Record<BookId, BookStatsView>
  }, [statsForBook])

  /* ---------- 会话操作 ---------- */

  /**
   * 判定记账。
   * 用 ref 读当前 session，避免 session 一变就重建回调，
   * 进而让 ReciteSession 内部的 submit useCallback 反复抖动。
   */
  const sessionRef = useRef(session)
  sessionRef.current = session

  const recordRecall = useCallback(
    (ev: RecallSubmit) => {
      const cur = sessionRef.current
      if (!cur) return
      recordEvent({
        bookId: cur.bookId,
        entryId: ev.entryId,
        word: ev.word,
        meaning: ev.meaning,
        root: ev.root,
        verdict: ev.verdict,
        // 会话 key 带 drill 前缀 → 这次是错词本专项复习，结算口径不同
        drill: cur.sessionKey.startsWith(DRILL_PREFIX),
      })
    },
    [recordEvent],
  )

  /** 计时打卡：带上当前会话所在的书 */
  const studyTick = useCallback(
    (ms: number) => {
      const cur = sessionRef.current
      if (!cur) return
      addStudyTime(cur.bookId, ms)
    },
    [addStudyTime],
  )

  const startSession = useCallback(
    (s: SessionState) => {
      setSession(s)
      setScreen('recite')
    },
    [setSession],
  )

  /** 继续上次会话 */
  const resumeSession = useCallback(() => {
    if (!session) return
    // 完全随机模式：队尾空了但还有错词，自动进入错词复习
    if (session.mode === 'fullRandom' && session.queue.length === 0 && session.wrongPool.length > 0) {
      setSession({
        ...session,
        queue: session.wrongPool.map((id) => ({ entryId: id, attempt: 1, kind: 'retry' as const })),
        wrongPool: [],
        inWrongReview: true,
        stage: 'quiz',
        updatedAt: Date.now(),
      })
    }
    setScreen('recite')
  }, [session, setSession])

  /** 进入错词复习（完全随机模式退出时的强制复习） */
  const enterWrongReview = useCallback(() => {
    if (!session) return
    setSession({
      ...session,
      queue: session.wrongPool.map((id) => ({ entryId: id, attempt: 1, kind: 'retry' as const })),
      wrongPool: [],
      inWrongReview: true,
      stage: 'quiz',
      updatedAt: Date.now(),
    })
    setShowExit(false)
    setScreen('recite')
  }, [session, setSession])

  /**
   * 错词本 → 专项复习。
   * 构造一个独立的临时会话（覆盖当前 session 键，和「开始背诵」的语义一致：
   * 一次只有一个会话在跑，错词复习也不例外），要点：
   * - 队列 = 选中的错词，打乱顺序，避免按错词本顺序背出惯性
   * - 阶段走 quiz（中文释义四选一）：错词大多已见过一次，四选一更接近真实检验
   * - sessionKey 带 drill 前缀，用于记账时区分结算口径
   */
  const startDrill = useCallback(
    async (bookId: BookId, ids: string[]) => {
      if (ids.length === 0) return
      const res = await loadBook(bookId)
      const index = buildEntryIndex(res.book)
      const valid = ids.filter((id) => index.has(id))
      if (valid.length === 0) return
      // 洗牌（Fisher–Yates），就地打乱副本
      const shuffled = [...valid]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      const now = Date.now()
      setSession({
        sessionKey: `${DRILL_PREFIX}${bookId}:${now}`,
        bookId,
        mode: 'fullRandom',
        groupId: null,
        stage: 'quiz',
        queue: shuffled.map((entryId) => ({ entryId, attempt: 1, kind: 'retry' as const })),
        cursor: 0,
        total: shuffled.length,
        mastered: 0,
        reviewPool: [],
        wrongPool: [],
        hasWrongPending: false,
        startedAt: now,
        updatedAt: now,
        inWrongReview: true,
      })
      setScreen('recite')
    },
    [setSession],
  )

  /** 真正退出到首页 */
  const exitToHome = useCallback(() => {
    flushSession()
    stats.flush()
    setShowExit(false)
    setScreen('home')
  }, [flushSession, stats])

  /** ★关键安全点：先把词书同步拉好，再切到背诵页。
   *  否则会出现「session 存在但词书还在加载」的中间态，页面白屏。
   *  加载函数内部有缓存，已加载过就是同步秒回。 */
  const handleBack = useCallback(async () => {
    if (!session) {
      setScreen('home')
      return
    }
    // 确保当前书的词书数据已就绪，避免背诵页白屏
    await loadBook(session.bookId)
    setShowExit(true)
  }, [session])

  /** 清空所有背诵进度（会话） */
  const clearProgress = useCallback(() => {
    setSession(null)
    removeStorage(KEY_SESSION)
  }, [setSession])

  /** 清空统计与错词本（和「清空进度」分开，粒度更细，避免误删） */
  const clearStats = useCallback(() => {
    stats.clear()
  }, [stats])

  /* ---------- 渲染 ---------- */

  const browseBook = books[browseBookId].book
  const wrongBook = books[wrongBookId].book
  // 条件渲染里不能直接调 Hook，词条索引统一在顶层算好
  const wrongEntryIndex = useMemo(
    () => (wrongBook ? buildEntryIndex(wrongBook) : new Map()),
    [wrongBook],
  )

  return (
    <>
      {screen === 'home' && (
        <Home
          books={books}
          settings={settings}
          stats={statsView}
          pendingSession={session ? { ...session, bookName: books[session.bookId].name } : null}
          onResume={resumeSession}
          onStart={startSession}
          onOpenSettings={() => setShowSettings(true)}
          onOpenBrowse={(id) => {
            // 浏览页只切页面，完全不碰 session，正在进行的会话原样保留
            setBrowseBookId(id)
            setScreen('browse')
          }}
          onOpenWrongBook={(id) => {
            setWrongBookId(id)
            setScreen('wrong')
          }}
        />
      )}

      {/* ---------- 学习数据看板 ---------- */}
      {screen === 'stats' && (
        <Statistics
          stats={stats.store.stats}
          wrongCounts={{ book1: statsView.book1.wrongCount, book2: statsView.book2.wrongCount }}
          rootGroups={
            loaded.book1?.book.groups.map((g) => {
              // WordGroup 的 title 形如「△ act = 做；驱使」或「散词区（无共同词根）」
              const title = g.title || ''
              const m = title.match(/^△\s*(.+?)(?:\s*=\s*(.*))?$/)
              return {
                root: m ? (m[1] || '') : '',
                meaning: m ? (m[2] || '') : '',
                entries: g.entries.map((e) => ({ id: e.id })),
              }
            }) ?? null
          }
          totals={{ book1: books.book1.count, book2: books.book2.count }}
          bookNames={{ book1: books.book1.name, book2: books.book2.name }}
          dailyGoal={settings.dailyGoal ?? 30}
          onBack={() => setScreen('home')}
        />
      )}

      {/* ---------- 底部导航：背诵时隐藏，专注不被打断 ---------- */}
      {screen !== 'recite' && (
        <BottomNav
          active={
            screen === 'stats'
              ? 'stats'
              : screen === 'wrong'
                ? 'wrong'
                : screen === 'browse'
                  ? 'browse'
                  : 'home'
          }
          onChange={(tab: TabKey) => {
            // 记住「上次背的是哪本书」：从导航进词书/错词本时默认打开它，
            // 否则用户刚背完书2，点进去看到的却是书1，等于白学。
            const lastBookId: BookId = session?.bookId ?? 'book1'
            // 只有那本书确实有错词时才优先给它，否则挑有错词的那本
            const wrongBook: BookId =
              statsView[lastBookId].wrongCount > 0
                ? lastBookId
                : statsView.book1.wrongCount >= statsView.book2.wrongCount
                  ? 'book1'
                  : 'book2'
            if (tab === 'home') setScreen('home')
            else if (tab === 'stats') setScreen('stats')
            else if (tab === 'wrong') {
              setWrongBookId(wrongBook)
              setScreen('wrong')
            } else {
              setBrowseBookId(lastBookId)
              setScreen('browse')
            }
          }}
          wrongCount={statsView.book1.wrongCount + statsView.book2.wrongCount}
        />
      )}

      {screen === 'recite' && session && activeBook && (
        <ReciteSession
          book={activeBook}
          entryIndex={entryIndex}
          allEntries={allEntries}
          session={session}
          settings={{ ...settings, retryGap: clampRetryGap(settings.retryGap) }}
          onChange={setSession}
          onExit={handleBack}
          onRecall={recordRecall}
          onStudyTick={studyTick}
        />
      )}

      {/* 背诵页但词书还没加载好：给一个不闪白的中性等待态 */}
      {screen === 'recite' && session && !activeBook && (
        <div className="flex min-h-[100svh] items-center justify-center text-[14px] text-ink-400">
          正在加载词书…
        </div>
      )}

      {/* ---------- 课外词书浏览（只读） ---------- */}
      {screen === 'browse' &&
        (browseBook ? (
          <BookBrowser
            book={browseBook}
            onBack={() => setScreen('home')}
            learnedIds={new Set(stats.store.stats[browseBookId]?.learnedIds ?? [])}
            wrongIds={new Set(stats.store.wrong[browseBookId]?.map((w) => w.id) ?? [])}
            bookTabs={[
              { id: 'book1', name: books.book1.name },
              { id: 'book2', name: books.book2.name },
            ]}
            currentBookId={browseBookId}
            onSwitchBook={(id) => setBrowseBookId(id as BookId)}
          />
        ) : (
          <LoadingState onBack={() => setScreen('home')} />
        ))}

      {/* ---------- 错词本 ---------- */}
      {screen === 'wrong' &&
        (wrongBook ? (
          <WrongBook
            bookId={wrongBookId}
            bookName={books[wrongBookId].name}
            list={statsForBook(wrongBookId).wrongList}
            entryIndex={wrongEntryIndex}
            onBack={() => setScreen('home')}
            onReview={(ids) => void startDrill(wrongBookId, ids)}
          />
        ) : (
          <LoadingState onBack={() => setScreen('home')} />
        ))}

      {showSettings && (
        <SettingsSheet
          settings={settings}
          onChange={setSettings}
          onClose={() => setShowSettings(false)}
          onClearProgress={clearProgress}
          onClearStats={clearStats}
        />
      )}

      {showExit && session && (
        <ExitDialog
          wrongCount={session.mode === 'fullRandom' ? session.wrongPool.length : 0}
          onStay={() => setShowExit(false)}
          onExit={exitToHome}
          onWrongReview={enterWrongReview}
        />
      )}
    </>
  )
}

/** 词书还没加载好时的中性等待态（浏览页 / 错词本共用） */
function LoadingState({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex min-h-[100svh] flex-col items-center justify-center gap-3 text-[14px] text-ink-400">
      正在加载词书…
      <button
        onClick={onBack}
        className="rounded-xl bg-ink-100 px-4 py-2 text-[13px] text-ink-700 active:bg-ink-200"
      >
        返回首页
      </button>
    </div>
  )
}
