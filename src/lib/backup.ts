/**
 * 进度备份：导出 / 导入的「浏览器侧」实现。
 *
 * 产品口径（用户已确认）：不接后端、不做云同步，
 * 就是 localStorage 本地保存 + 手动导出 JSON 备份 + 手动导入恢复。
 *
 * 校验逻辑见同目录 backupFormat.ts（纯函数，可被 node 自检脚本直接测试）。
 *
 * 安全边界：
 * 1. 白名单：只导出/导入 KEY_WHITELIST 里的键，localStorage 里别的东西一概不碰；
 * 2. 覆盖前必须确认：导入是破坏性操作，UI 层拿到 parseBackup 通过的结果后还要用户点一次「确定覆盖」；
 * 3. 写入后整页重载：会话、统计分散在多个 Hook 的内部 state 里，
 *    逐个同步既容易漏又容易写出半截状态，重载是最稳且最容易验证的做法。
 */
import { readStorage, writeStorage } from '../hooks/usePersistentState'
import { BACKUP_APP, BACKUP_VERSION, KEY_WHITELIST, backupFileName } from './backupFormat'
import type { BackupFile, BackupKey } from './backupFormat'

// 重新导出，组件只需要 import './lib/backup' 一处
export { backupFileName, formatExportTime, parseBackup } from './backupFormat'
export type { BackupFile, BackupKey, ImportResult } from './backupFormat'

/** 收集当前 localStorage 里所有本应用的键，组装成备份对象 */
export function collectBackup(now: Date = new Date()): BackupFile {
  const keys: Partial<Record<BackupKey, unknown>> = {}
  for (const k of KEY_WHITELIST) {
    const v = readStorage<unknown>(k, undefined as unknown)
    if (v !== undefined && v !== null) keys[k] = v
  }
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    keys,
  }
}

/**
 * 触发浏览器下载并返回文件名。
 *
 * 手机上为什么必须走 <a download>：
 * - window.open 在 iOS Safari 里经常被拦截，或被当成新标签页打开导致直接显示 JSON 文本；
 * - a.download 是唯一在三大移动浏览器里都稳定「另存为文件」的路径。
 * URL.revokeObjectURL 延后释放，避免个别浏览器在点击瞬间还没读完 blob 就被回收。
 */
export function downloadBackup(file: BackupFile = collectBackup()): string {
  const name = backupFileName()
  const text = JSON.stringify(file, null, 2)
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  // 个别浏览器要求 a 必须在文档里才会触发下载
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return name
}

/** 把校验通过的备份写进 localStorage；返回实际写入的键 */
export function applyBackup(file: BackupFile): BackupKey[] {
  const written: BackupKey[] = []
  for (const k of KEY_WHITELIST) {
    const v = file.keys[k]
    if (v === undefined || v === null) continue
    writeStorage(k, v)
    written.push(k)
  }
  return written
}

/** 读取用户选中的 File（手机上也可能是文件 App 里的），返回文本 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsText(file, 'utf-8')
  })
}
