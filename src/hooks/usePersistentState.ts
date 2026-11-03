/**
 * localStorage 持久化 Hook（自写，不引入 zustand，减少依赖体积）。
 *
 * 设计：
 * - 写入节流：手机端连续两下点击会触发两次 state 更新，这里统一用 200ms 防抖落盘，
 *   但「卸载 / 切后台」时会立即 flush，避免丢进度。
 * - 版本号：存储结构一旦改动，靠 version 字段让老数据自动失效，不会读到半截脏数据。
 * - 失败静默：隐私模式 / 存储满 / JSON 损坏，一律回落到初始值，绝不白屏。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_PREFIX = 'word-books:v1:'

/** 读取 JSON，失败返回 fallback */
export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as T
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

/** 写入 JSON，失败静默 */
export function writeStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value))
  } catch {
    /* 隐私模式 / 配额满：忽略，不影响当前会话使用 */
  }
}

/** 删除 */
export function removeStorage(key: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + key)
  } catch {
    /* ignore */
  }
}

/**
 * usePersistentState：和 useState 用法一致，但会自动读写 localStorage。
 * @param key 存储键（不含前缀）
 * @param initial 初始值 / 首次为空时的回落值
 */
export function usePersistentState<T>(key: string, initial: T | (() => T)) {
  const [value, setValue] = useState<T>(() => {
    const fallback = typeof initial === 'function' ? (initial as () => T)() : initial
    return readStorage<T>(key, fallback)
  })

  // 保存最新的待写值，用于防抖与 flush
  const pendingRef = useRef<{ key: string; value: T } | null>(null)
  const timerRef = useRef<number | null>(null)

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const pending = pendingRef.current
    if (pending) {
      writeStorage(pending.key, pending.value)
      pendingRef.current = null
    }
  }, [])

  useEffect(() => {
    pendingRef.current = { key, value }
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(flush, 200)
    return () => {
      // 组件卸载前落盘
      flush()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value])

  // 切到后台 / 关闭页面时立刻落盘，手机上「直接切应用」是最常见的退出方式
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

  return [value, setValue, flush] as const
}
