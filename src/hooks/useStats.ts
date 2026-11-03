/**
 * 学习记录 Hook：统计（已学词数 / 学习时长 / 学习词次）+ 每本书的错词本。
 *
 * 设计约束（对齐任务要求：不要污染现有 session 结构）：
 * - 会话（SessionState）继续只关心「当前这一轮队列」；
 * - 累计统计与错词本放在这里，走独立的 localStorage 键 <startsWith>stats，
 *   和老版本数据、会话数据互不影响；
 * - 所有写入能力都通过 setStore / 增量打卡暴露，App 只负责把会话的判定差异喂进来。
 *
 * 时长统计口径：调用方（ReciteSession）用 visibility 感知的计时器定期打卡，
 * 每次打卡带上「这一小段时间真实活跃的毫秒数」，这里做上下限夹取后累加。
 * 没有用「会话开始时间到现在」的墙钟差，是因为用户把 App 丢后台两小时再回来，
 * 墙钟差会把两小时算成学习时长，数据直接失真。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addStudyMs as addStudyMsPure,
  createEmptyStore,
  recordEvent as recordEventPure,
  sanitizeStore,
} from '../engine/recall'
import type { BookId } from '../types'
import type { RecallEvent, RecallStore, WrongWord } from '../engine/recall'
import { writeStorage } from './usePersistentState'

const STORAGE_KEY = 'stats'
/** 单次打卡的最大可信增量：5 分钟，超过就按 5 分钟算（防后台挂机刷时长） */
const MAX_TICK_MS = 5 * 60 * 1000

function readStore(): RecallStore {
  try {
    const raw = localStorage.getItem('word-books:v1:' + STORAGE_KEY)
    if (!raw) return createEmptyStore()
    return sanitizeStore(JSON.parse(raw))
  } catch {
    // 隐私模式 / JSON 损坏：回落到空记录，绝不白屏
    return createEmptyStore()
  }
}

/** 把毫秒格式化成「Xh Ym / Ym / Ys」，宽度可控，手机上一行放得下 */
export function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const totalMin = Math.floor(totalSec / 60)
  if (totalMin < 60) return `${totalMin}m`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m > 0 ? `${h}h${m}m` : `${h}h`
}

export interface StatsApi {
  /** 当前记录快照 */
  store: RecallStore
  /** 记一次判定 */
  recordEvent: (ev: RecallEvent) => void
  /** 记一段学习时长（毫秒） */
  addStudyTime: (bookId: BookId, deltaMs: number) => void
  /** 立即落盘（退出会话时调用，避免节流丢数据） */
  flush: () => void
  /** 清空全部统计与错词本 */
  clear: () => void
  /** 单本书的派生数据：已学、错词、正确率等 */
  forBook: (bookId: BookId) => {
    learned: number
    reviews: number
    studyMs: number
    wrongCount: number
    wrongList: WrongWord[]
  }
}

export function useStats() {
  const [store, setStore] = useState<RecallStore>(() => readStore())
  const timerRef = useRef<number | null>(null)
  const pendingRef = useRef<RecallStore | null>(null)

  // 防抖落盘：连续判定时不必每次都写 localStorage
  useEffect(() => {
    pendingRef.current = store
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      if (pendingRef.current) {
        writeStorage(STORAGE_KEY, pendingRef.current)
        pendingRef.current = null
      }
    }, 200)
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [store])

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (pendingRef.current) {
      writeStorage(STORAGE_KEY, pendingRef.current)
      pendingRef.current = null
    }
  }, [])

  // 切后台 / 关页面前落盘，和会话进度保持同一节奏
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', flush)
    }
  }, [flush])

  const recordEvent = useCallback((ev: RecallEvent) => {
    setStore((s) => recordEventPure(s, ev, Date.now()))
  }, [])

  const addStudyTime = useCallback((bookId: BookId, deltaMs: number) => {
    // 夹到 [0, 5min]，避免后台挂机与时钟回拨把数据带偏
    const clean = Math.max(0, Math.min(Math.floor(deltaMs), MAX_TICK_MS))
    if (clean <= 0) return
    setStore((s) => addStudyMsPure(s, bookId, clean))
  }, [])

  const clear = useCallback(() => {
    const empty = createEmptyStore()
    setStore(empty)
    writeStorage(STORAGE_KEY, empty)
  }, [])

  const forBook = useCallback(
    (bookId: BookId) => {
      const st = store.stats[bookId]
      const wrongList = store.wrong[bookId] ?? []
      return {
        learned: st ? st.learnedIds.length : 0,
        reviews: st ? st.reviews : 0,
        studyMs: st ? st.studyMs : 0,
        wrongCount: wrongList.length,
        wrongList,
      }
    },
    [store],
  )

  return { store, recordEvent, addStudyTime, flush, clear, forBook }
}
