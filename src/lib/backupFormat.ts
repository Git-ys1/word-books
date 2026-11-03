/**
 * 进度备份的「纯逻辑」部分：结构定义 + 校验 + 时间格式化。
 *
 * 为什么和 backup.ts 拆开：
 * backup.ts 里要碰 localStorage / Blob / FileReader，只能跑在浏览器；
 * 而「导入文件该怎么校验」恰恰是最容易出错、最需要用自动测试盯住的部分。
 * 把纯函数单独放这里，node 自检脚本（scripts/recall-selftest.mts）就能直接导入执行，
 * 不用为了测一个校验函数去搭 jsdom。
 */

/** 备份文件里的应用标识 */
export const BACKUP_APP = 'word-books'
/** 当前支持的备份结构版本 */
export const BACKUP_VERSION = 1
/**
 * 允许进备份的存储键白名单。
 * 前缀 word-books:v1: 由 usePersistentState 统一加，这里只写裸键。
 * 新增持久化键时记得同步加到这里，否则导出会漏数据。
 */
export const KEY_WHITELIST = ['session', 'settings', 'stats'] as const

export type BackupKey = (typeof KEY_WHITELIST)[number]

/** 备份文件结构 */
export interface BackupFile {
  app: string
  version: number
  exportedAt: string
  keys: Partial<Record<BackupKey, unknown>>
}

/** 导入结果：要么成功（带校验过的文件与键列表），要么带一条「用户能看懂」的错误 */
export type ImportResult =
  | { ok: true; file: BackupFile; keys: BackupKey[] }
  | { ok: false; message: string }

/** 把日期格式化成 2026-11-03（本地时区，不是 UTC） */
export function dateStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 下载文件名：word-books-backup-2026-11-03.json */
export function backupFileName(d: Date = new Date()): string {
  return `${BACKUP_APP}-backup-${dateStamp(d)}.json`
}

/** 把导出的时间戳格式化成「2026-11-03 20:15」用于界面提示 */
export function formatExportTime(iso: string): string {
  if (!iso) return '未知时间'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '未知时间'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * 校验并解析一份备份文本。
 *
 * 只做「结构校验 + 解析」，不写任何存储——
 * 写入由调用方在用户确认覆盖之后调 applyBackup，这样「点了取消」不会留脏数据。
 *
 * 错误提示分四类，让用户能自己判断该换文件还是换版本：
 *  1. JSON 本身坏了   → 「文件不是合法的 JSON」
 *  2. 不是本应用的    → 「缺少 app 标记」
 *  3. 版本不认识      → 「比当前应用支持的更新」/「缺少 version」
 *  4. 内容不匹配      → 「缺少 keys」/「没有任何本应用认识的数据」
 */
export function parseBackup(text: string): ImportResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, message: '文件不是合法的 JSON，可能选错了文件或文件已损坏。' }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, message: '文件内容不是备份对象，无法识别。' }
  }
  const obj = data as Record<string, unknown>

  // 应用标识：防止把别的 App 导出的 JSON 误导进来
  if (obj.app !== BACKUP_APP) {
    return {
      ok: false,
      message: `这不是本应用导出的备份（缺少 app: "${BACKUP_APP}" 标记），已拒绝导入。`,
    }
  }
  // 版本：必须有 version 字段，且不能高于本版认识的上限
  if (typeof obj.version !== 'number' || !Number.isFinite(obj.version)) {
    return { ok: false, message: '备份文件缺少 version 字段，无法判断版本，已拒绝导入。' }
  }
  if (obj.version > BACKUP_VERSION) {
    return {
      ok: false,
      message: `备份版本 v${obj.version} 比当前应用支持的 v${BACKUP_VERSION} 更新，请先升级应用再导入。`,
    }
  }
  // 内容
  if (!obj.keys || typeof obj.keys !== 'object' || Array.isArray(obj.keys)) {
    return { ok: false, message: '备份文件缺少 keys 内容，没有可导入的数据。' }
  }
  const rawKeys = obj.keys as Record<string, unknown>
  const keys: BackupKey[] = []
  for (const k of KEY_WHITELIST) {
    // 只认白名单里的键，其它键静默丢弃（不报错也不写入）
    if (k in rawKeys && rawKeys[k] !== null && rawKeys[k] !== undefined) keys.push(k)
  }
  if (keys.length === 0) {
    return { ok: false, message: '备份里没有任何本应用认识的进度数据，已拒绝导入。' }
  }

  return {
    ok: true,
    file: {
      app: BACKUP_APP,
      version: obj.version,
      exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : '',
      keys: Object.fromEntries(keys.map((k) => [k, rawKeys[k]])) as BackupFile['keys'],
    },
    keys,
  }
}
