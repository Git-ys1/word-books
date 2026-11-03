/**
 * 词书数据接入层（按需异步加载版）。
 *
 * 为什么改成异步：
 *   两本词书 JSON 合计约 2.4MB，如果同步 import 会被全部打进主包，
 *   手机上首屏要下载 1MB+ 才看到界面，体验不可接受。
 *   改成 fetch() 后，主包只剩应用代码（约 200KB gzip），
 *   词书数据按需加载，且浏览器会走 HTTP 缓存，第二次打开几乎瞬时。
 *
 * 数据由其他 agent 从 PDF 提取后放在 public/data/ 下：
 *   /data/book1.json  书1：7天刷完5500讲义（按词根块分组）
 *   /data/book2.json  书2：核心单词速记（按天分组）
 *
 * 加载失败时回落到 mock，保证界面永远可用（开发早期 / 部署时缺数据）。
 */
import type { Book, BookId, Segment, WordEntry, WordGroup } from '../types'
import { mockBooks } from './mock'

const VALID_ROLES: Segment['role'][] = ['root', 'affix', 'meaning', 'latin', 'cjk', 'link']

/** 中日韩字符正则：出现即说明是释义，不可能是词缀 */
const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/
/** 纯英文（可含空格、点、撇号、连字符）：说明是词素/词根本体 */
const LATIN_RE = /^[A-Za-z][A-Za-z\s.'’\-]*$/

/**
 * 拆解片段语义纠偏。
 *
 * 背景（2026-11-03 实测）：提取脚本把「非词根」的片段统一标成 affix，
 * 导致中文释义（如「做」「适应」）被当成词缀渲染，语言学上是错的。
 * 这里按内容特征二次判定，把角色纠正回真实语义。
 */
function correctRole(seg: Segment): Segment {
  if (seg.role === 'link') return seg
  if (CJK_RE.test(seg.text)) return { text: seg.text, role: 'meaning' }
  if (LATIN_RE.test(seg.text)) return { text: seg.text, role: 'root' }
  return seg
}

/** 拆解片段兜底：没有 segments 时用 词根 + 释义 现场合成，保证「拆解」按钮永远有内容 */
function normalizeSegments(raw: unknown, word: string, root: string, rootMeaning: string): Segment[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return (raw as Record<string, unknown>[])
      .filter((s) => s && typeof s.text === 'string' && String(s.text).length > 0)
      .map((s) => {
        const role = VALID_ROLES.includes(String(s.role) as Segment['role'])
          ? (String(s.role) as Segment['role'])
          : 'meaning'
        return correctRole({ text: String(s.text), role })
      })
  }
  // 兜底合成：书2 的手写数据没有 segments，但 root/rootMeaning 是齐全的。
  // 拼成「词根 = 释义」的拆解式，保证点开拆解有真实信息增量，而不是又看到单词本身。
  const out: Segment[] = []
  if (root) out.push({ text: root, role: 'root' })
  if (rootMeaning) {
    if (out.length) out.push({ text: '=', role: 'link' })
    out.push({ text: rootMeaning, role: 'meaning' })
  }
  if (!out.length) out.push({ text: word, role: 'root' })
  return out
}

/** 把任意来源的 JSON 归一化成 Book，缺失字段做安全兜底 */
function normalizeBook(id: BookId, raw: unknown): Book | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>

  // 书1：{ rootGroups: [{ root, meaning, entries: [...] }] }
  if (Array.isArray(data.rootGroups)) {
    const groups: WordGroup[] = (data.rootGroups as Record<string, unknown>[]).map((g, gi) => {
      const rawRoot = String(g.root ?? '')
      // 「单列」不是词根，是 PDF 里 🔺单列 区块标记的散词区（无共同词根的词）。
      // 展示成「△ 单列」用户会莫名其妙，这里改成可读标题并单独标记。
      const isScatter = rawRoot === '单列'
      // 数据缺陷兜底：极少数组的 root 被误填成中文释义（如 #281 root='海洋' 但没有含义），
      // 让「△ 海洋」这种标题看起来很怪。若 root 含中文却缺 meaning，视为释义串位，回填到 meaning。
      let root = isScatter ? '' : rawRoot
      let rootMeaning = String(g.meaning ?? '')
      if (root && CJK_RE.test(root) && !rootMeaning) {
        rootMeaning = root
        root = ''
      }
      const rawEntries = Array.isArray(g.entries) ? (g.entries as Record<string, unknown>[]) : []
      const entries: WordEntry[] = rawEntries.map((e, ei) => {
        const word = String(e.word ?? '').trim()
        return {
          id: `${id}:${rawRoot || 'g' + gi}:${word || 'e' + ei}`,
          word,
          meaning: String(e.meaning ?? ''),
          // 散词区没有词根，强行拆解只会得到「词 = 词」，干脆不给拆解
          segments: isScatter ? [] : normalizeSegments(e.segments, word, root, rootMeaning),
          root: root || undefined,
          rootMeaning: rootMeaning || undefined,
          memory: e.memory ? String(e.memory) : undefined,
        }
      })
      return {
        id: `${id}:${rawRoot || 'g' + gi}`,
        title: isScatter
          ? `散词区（无共同词根）`
          : root
            ? `△ ${root}${rootMeaning ? ' = ' + rootMeaning : ''}`
            : `第 ${gi + 1} 组`,
        subtitle: isScatter ? `${entries.length} 个散词` : `同根 ${entries.length} 词`,
        entries,
      }
    })
    return {
      id,
      name: '考研词汇 5500（词根版）',
      desc: '按词根块组织，一个词根串起一串词',
      groups,
    }
  }

  // 书2：{ groups: [{ day, title, entries: [...] }] }
  if (Array.isArray(data.groups)) {
    const groups: WordGroup[] = (data.groups as Record<string, unknown>[]).map((g, gi) => {
      const day = Number(g.day ?? gi + 1)
      const rawEntries = Array.isArray(g.entries) ? (g.entries as Record<string, unknown>[]) : []
      const entries: WordEntry[] = rawEntries.map((e, ei) => {
        const word = String(e.word ?? '').trim()
        return {
          id: `${id}:${day}:${word || 'e' + ei}`,
          word,
          meaning: String(e.meaning ?? ''),
          segments: normalizeSegments(e.segments, word, String(e.root ?? ''), String(e.rootMeaning ?? '')),
          root: e.root ? String(e.root) : undefined,
          rootMeaning: e.rootMeaning ? String(e.rootMeaning) : undefined,
          memory: e.memory ? String(e.memory) : undefined,
        }
      })
      return {
        id: `${id}:day${day}`,
        title: String(g.title ?? `第${day}天`),
        subtitle: `${entries.length} 词`,
        entries,
      }
    })
    return {
      id,
      name: '核心单词速记',
      desc: '按天拆分，每天一组，适合按天推进',
      groups,
    }
  }

  return null
}

/** 判断一份 Book 是否有效（至少有一个词条） */
function hasContent(b: Book | null): b is Book {
  return !!b && b.groups.some((g) => g.entries.length > 0)
}

export interface BookLoadResult {
  book: Book
  /** true 表示加载失败、用的是内置示例数据 */
  isMock: boolean
}

/**
 * 按需加载一本词书。
 * 结果在内存里缓存，同一本书只请求一次（浏览器侧还有 HTTP 缓存兜底）。
 */
const cache = new Map<BookId, Promise<BookLoadResult>>()

export function loadBook(id: BookId): Promise<BookLoadResult> {
  const hit = cache.get(id)
  if (hit) return hit

  const task = (async (): Promise<BookLoadResult> => {
    try {
      // 用 import.meta.env.BASE_URL 兼容部署到子路径的情况
      const url = `${import.meta.env.BASE_URL}data/${id}.json`
      const resp = await fetch(url, { cache: 'force-cache' })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const json = await resp.json()
      const book = normalizeBook(id, json)
      if (hasContent(book)) return { book, isMock: false }
      throw new Error('数据为空')
    } catch (err) {
      // 加载失败不阻塞用户：回落示例数据，UI 上打「示例」角标提示
      console.warn(`[word-books] 加载 ${id} 失败，使用示例数据：`, err)
      return { book: mockBooks[id], isMock: true }
    }
  })()

  cache.set(id, task)
  return task
}

/** 打平词书所有词条 */
export function flattenEntries(book: Book): WordEntry[] {
  return book.groups.flatMap((g) => g.entries)
}

/** 词条索引表：id -> WordEntry，队列里只存 id，渲染时再查 */
export function buildEntryIndex(book: Book): Map<string, WordEntry> {
  const map = new Map<string, WordEntry>()
  for (const g of book.groups) for (const e of g.entries) map.set(e.id, e)
  return map
}

/** 词书统计信息（首页展示用，不需要加载全量数据） */
export const BOOK_META: Record<BookId, { name: string; desc: string }> = {
  book1: { name: '考研词汇 5500（词根版）', desc: '按词根块组织，一个词根串起一串词' },
  book2: { name: '核心单词速记', desc: '按天拆分，每天一组，适合按天推进' },
}
