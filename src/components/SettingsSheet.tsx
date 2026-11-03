/**
 * 设置面板：底部抽屉式弹层（手机上从底部上滑，桌面上居中）。
 * 暴露三类选项，避免设置页变成参数垃圾场：
 *   1. 手感参数（延后位、自动展开、震动）
 *   2. 数据备份（导出 / 导入 JSON，纯前端，无后端）
 *   3. 危险操作（清空进度 / 清空统计），一律二次确认
 */
import { useRef, useState } from 'react'
import type { Settings } from '../types'
import { clampRetryGap } from '../engine/queue'
import {
  applyBackup,
  downloadBackup,
  formatExportTime,
  parseBackup,
  readFileAsText,
} from '../lib/backup'
import type { BackupFile } from '../lib/backup'

interface Props {
  settings: Settings
  onChange: (s: Settings) => void
  onClose: () => void
  /** 清空所有本地进度 */
  onClearProgress: () => void
  /** 清空统计与错词本（学习时长 / 词次 / 错词都归零，不影响会话进度） */
  onClearStats?: () => void
}

/** 「不认识」延后位的预设，文案给出取舍理由 */
const GAP_PRESETS = [
  { v: 4, label: '4', hint: '很快复现' },
  { v: 8, label: '8', hint: '推荐' },
  { v: 12, label: '12', hint: '间隔更长' },
]

/** 提示条类型：成功 / 失败 / 普通信息 */
type Notice = { tone: 'ok' | 'err' | 'info'; text: string } | null

export default function SettingsSheet({
  settings,
  onChange,
  onClose,
  onClearProgress,
  onClearStats,
}: Props) {
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmClearStats, setConfirmClearStats] = useState(false)

  /* ---------- 备份相关状态 ---------- */
  const fileRef = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState<Notice>(null)
  /** 已校验通过、等待用户确认覆盖的备份 */
  const [pending, setPending] = useState<{ file: BackupFile; keys: string[] } | null>(null)
  /** 导入后重载页面前先落盘，避免节流中的写入把新数据盖掉 */
  const [importing, setImporting] = useState(false)

  /** 导出：组装备份对象 → Blob → <a download> */
  const handleExport = () => {
    try {
      const name = downloadBackup()
      setNotice({ tone: 'ok', text: `已导出 ${name}` })
    } catch {
      setNotice({ tone: 'err', text: '导出失败：浏览器不允许下载文件，请换个浏览器试试。' })
    }
  }

  /** 选中文件 → 读取 → 结构校验 → 进入待确认态（此时还没写任何东西） */
  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setNotice(null)
    setPending(null)
    try {
      const text = await readFileAsText(file)
      const res = parseBackup(text)
      if (!res.ok) {
        setNotice({ tone: 'err', text: res.message })
        return
      }
      setPending({ file: res.file, keys: res.keys })
      setNotice({
        tone: 'info',
        text: `备份有效（导出于 ${formatExportTime(res.file.exportedAt)}，包含 ${res.keys.length} 项数据）`,
      })
    } catch {
      setNotice({ tone: 'err', text: '读取文件失败，请确认文件没有损坏。' })
    } finally {
      // 允许用户重复选择同一个文件（否则第二次选同一文件不触发 change）
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  /** 用户点了「确定覆盖」之后才真正写 localStorage */
  const confirmImport = () => {
    if (!pending) return
    const written = applyBackup(pending.file)
    if (written.length === 0) {
      setNotice({ tone: 'err', text: '导入失败：没有写入任何数据。' })
      return
    }
    setPending(null)
    setImporting(true)
    setNotice({ tone: 'ok', text: '导入成功，正在重新载入…' })
    // 会话/统计分散在各个 Hook 的内部 state 里，整页重载是最稳的生效方式
    window.setTimeout(() => window.location.reload(), 350)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-ink-900/30 backdrop-blur-[2px]" onClick={onClose} />

      {/* 弹层主体：内容可能比屏幕高，内部滚动，手机上不会把按钮挤到屏幕外 */}
      <div className="relative max-h-[88svh] w-full max-w-[640px] animate-fade-up overflow-y-auto rounded-t-3xl bg-white p-5 pb-8 shadow-lift sm:rounded-3xl sm:pb-5">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink-200 sm:hidden" />

        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-ink-900">设置</h2>
          {/* 关闭按钮：原来只有图标没文字，手机上不够明确，也影响可访问性。
              改成「完成」文字按钮，点哪里都能退出，同时保留 aria-label。 */}
          <button
            onClick={onClose}
            aria-label="关闭设置"
            className="-mr-1 flex h-8 items-center gap-1 rounded-full px-2.5 text-[13px] font-medium text-ink-500 transition active:bg-ink-100 active:text-ink-800"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
            完成
          </button>
        </div>

        {/* 延后位 */}
        <section className="mt-5">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[14px] font-medium text-ink-900">「不认识」延后位置</h3>
            <span className="text-[12px] tabular-nums text-ink-400">第 {clampRetryGap(settings.retryGap)} 个之后</span>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-400">
            发现不会的词，不会立刻重问，也不会丢到队尾，而是插到后面第 N 个词之后。
            8 是默认值：既能让记忆还没凉，又不会让你在同一屏反复卡壳。
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {GAP_PRESETS.map((p) => {
              const active = clampRetryGap(settings.retryGap) === p.v
              return (
                <button
                  key={p.v}
                  onClick={() => onChange({ ...settings, retryGap: p.v })}
                  className={`rounded-xl border py-3 transition active:scale-[.98] ${
                    active ? 'border-brand-500/40 bg-brand-50' : 'border-ink-100 bg-white'
                  }`}
                >
                  <span className={`block text-[17px] font-bold tabular-nums ${active ? 'text-brand-600' : 'text-ink-900'}`}>
                    {p.label}
                  </span>
                  <span className={`mt-0.5 block text-[11px] ${active ? 'text-brand-500' : 'text-ink-400'}`}>{p.hint}</span>
                </button>
              )
            })}
          </div>
          {/* 精细调节 2~20（最小 2：1 等于立刻重问，没有间隔意义） */}
          <input
            type="range"
            min={2}
            max={20}
            step={1}
            value={clampRetryGap(settings.retryGap)}
            onChange={(e) => onChange({ ...settings, retryGap: Number(e.target.value) })}
            className="mt-3 w-full accent-brand-500"
          />
        </section>

        {/* 开关项 */}
        <section className="mt-5 divide-y divide-ink-100 rounded-2xl border border-ink-100">
          <Toggle
            title="自动展开拆解"
            desc="进入每个词就先展开彩色拆解"
            value={settings.autoExpand}
            onChange={(v) => onChange({ ...settings, autoExpand: v })}
          />
          <Toggle
            title="震动反馈"
            desc="判定时轻微震动（部分浏览器支持）"
            value={settings.haptic}
            onChange={(v) => onChange({ ...settings, haptic: v })}
          />
        </section>

        {/* ---------- 数据备份：导出 / 导入 ---------- */}
        <section className="mt-5">
          <h3 className="text-[14px] font-medium text-ink-900">进度备份</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-400">
            进度只保存在这台设备的浏览器里。换手机、清缓存前导出一下，就能在别处导入恢复。
          </p>

          <div className="mt-3 flex gap-2">
            <button
              onClick={handleExport}
              disabled={importing}
              className="flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink-900 px-3 text-[13.5px] font-semibold text-white transition active:scale-[.98] active:bg-ink-700 disabled:opacity-50"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                <path d="M12 3v12M7 10l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 20h16" strokeLinecap="round" />
              </svg>
              导出进度
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 text-[13.5px] font-semibold text-ink-900 transition active:scale-[.98] active:bg-ink-50 disabled:opacity-50"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                <path d="M12 16V4M7 9l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 20h16" strokeLinecap="round" />
              </svg>
              导入进度
            </button>
          </div>

          {/* 原生 file input 隐藏，靠上面的按钮代理点击（iOS 上自定义样式的按钮更可靠） */}
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />

          {/* 提示条 */}
          {notice && (
            <div
              role="status"
              className={`mt-2.5 break-words rounded-xl px-3 py-2.5 text-[12px] leading-relaxed ${
                notice.tone === 'ok'
                  ? 'bg-emerald-50 text-emerald-700'
                  : notice.tone === 'err'
                    ? 'bg-rose-50 text-rose-700'
                    : 'bg-ink-50 text-ink-600'
              }`}
            >
              {notice.text}
            </div>
          )}

          {/* 覆盖确认：导入是破坏性操作，必须让用户明确点一下 */}
          {pending && (
            <div className="mt-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3">
              <p className="text-[12.5px] font-semibold leading-relaxed text-amber-800">
                导入会覆盖当前进度，确定吗？
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-amber-700">
                将要覆盖：{pending.keys.join(' / ')}。当前设备上的对应数据会被替换，且无法撤销。
              </p>
              <div className="mt-2.5 flex gap-2">
                <button
                  onClick={() => {
                    setPending(null)
                    setNotice(null)
                  }}
                  className="flex-1 rounded-lg bg-white py-2.5 text-[13px] font-medium text-ink-700 active:bg-ink-100"
                >
                  取消
                </button>
                <button
                  onClick={confirmImport}
                  className="flex-1 rounded-lg bg-amber-600 py-2.5 text-[13px] font-semibold text-white active:bg-amber-700"
                >
                  确定覆盖
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ---------- 危险操作 ---------- */}
        <section className="mt-5 space-y-2">
          {/* 清空统计：只影响统计与错词本，不动正在背的会话 */}
          {onClearStats && (
            <>
              {!confirmClearStats ? (
                <button
                  onClick={() => {
                    setConfirmClearStats(true)
                    setConfirmClear(false)
                  }}
                  className="w-full rounded-xl border border-ink-100 py-3 text-[13.5px] text-ink-500 transition active:bg-ink-50"
                >
                  清空统计与错词本
                </button>
              ) : (
                <div className="rounded-xl border border-ink-100 p-2">
                  <p className="px-1 pb-2 text-[11.5px] leading-relaxed text-ink-400">
                    学习时长、词次、已学词数、错词本都会归零，背诵进度保留。
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmClearStats(false)}
                      className="flex-1 rounded-lg bg-ink-100 py-2.5 text-[13px] font-medium text-ink-700 active:bg-ink-200"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => {
                        onClearStats()
                        setConfirmClearStats(false)
                      }}
                      className="flex-1 rounded-lg bg-rose-500 py-2.5 text-[13px] font-semibold text-white active:bg-rose-600"
                    >
                      确认清空
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* 清空进度：二次确认（点一下只是进入确认态，再点才是真删） */}
          {!confirmClear ? (
            <button
              onClick={() => {
                setConfirmClear(true)
                setConfirmClearStats(false)
              }}
              className="w-full rounded-xl border border-ink-100 py-3 text-[13.5px] text-ink-500 transition active:bg-ink-50"
            >
              清空本地学习进度
            </button>
          ) : (
            <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-2">
              <p className="px-1 pb-2 text-[11.5px] leading-relaxed text-rose-700">
                当前这一轮的队列和掌握进度会被删除，且无法撤销。建议先导出一份备份。
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmClear(false)}
                  className="flex-1 rounded-xl bg-ink-100 py-3 text-[13.5px] font-medium text-ink-700"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    onClearProgress()
                    setConfirmClear(false)
                    onClose()
                  }}
                  className="flex-1 rounded-xl bg-rose-500 py-3 text-[13.5px] font-semibold text-white"
                >
                  确认清空
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function Toggle({
  title,
  desc,
  value,
  onChange,
}: {
  title: string
  desc: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button onClick={() => onChange(!value)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium text-ink-900">{title}</span>
        <span className="mt-0.5 block text-[11.5px] text-ink-400">{desc}</span>
      </span>
      <span
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${value ? 'bg-brand-500' : 'bg-ink-200'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            value ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  )
}
