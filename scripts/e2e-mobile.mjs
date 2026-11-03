/**
 * 手机端（390px）真实浏览器验收脚本。
 *
 * 不引入 playwright/puppeteer 依赖，直接走 Chrome DevTools Protocol：
 *   1. 启动一个 headless Chrome（远程调试端口）
 *   2. 用 CDP Page.setDeviceMetricsOverride 把视口锁成 390x844（iPhone 12/13/14 尺寸）
 *   3. 逐页检查：页面是否渲染出关键文案、document.scrollWidth 是否超过 390（横向溢出）
 *   4. 顺带做一遍真实交互：开始背诵 → 点「不认识」→ 回首页看统计/错词本是否变了
 *
 * 用法：node scripts/e2e-mobile.mjs [baseUrl]
 * 依赖：本机已安装 Chrome（PATH 或默认安装路径）
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

/**
 * 取 CDP 的 /json/list。
 * 这里刻意用 node:http 而不是全局 fetch：
 * 某些环境下 fetch 会走系统代理设置，对 127.0.0.1 的调试端口也发不出去（实测踩过），
 * 而 http.get 直连本地端口，稳定。
 */
function fetchJsonList(port) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/json/list', agent: false }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (body += c))
      res.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch (e) {
          reject(e)
        }
      })
    })
    // 显式 setTimeout：http.get 的 timeout 选项不会触发 destroy，
    // 之前用 options.timeout 时请求会一直挂着，表现就是「永远拿不到 target」。
    req.setTimeout(3000, () => req.destroy(new Error('CDP 端口响应超时')))
    req.on('error', reject)
  })
}

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173'
const PORT = 9333
const OUT_DIR = '.e2e'

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]

function findChrome() {
  for (const p of CHROME_CANDIDATES) if (existsSync(p)) return p
  return null
}

let pass = 0
let fail = 0
function check(name, cond, extra = '') {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name} ${extra}`)
  }
}

/** 极简 CDP 客户端 */
class CDP {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
      }
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
  /** 在页面里执行表达式并返回 JSON 结果 */
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    })
    if (r.exceptionDetails) throw new Error(`页面脚本异常：${JSON.stringify(r.exceptionDetails)}`)
    return r.result.value
  }
}

async function main() {
  const chrome = findChrome()
  if (!chrome) {
    console.error('找不到 Chrome / Edge，无法执行浏览器验收')
    process.exit(2)
  }

  // 每次运行都用全新的临时 profile：
  // 1) 固定 profile 目录一旦被上次异常退出的 Chrome 留下单实例锁，
  //    新进程就只会把请求转交给那个（已死的）实例，调试端口永远起不来；
  // 2) --user-data-dir 必须传绝对路径：实测传相对路径时 Chrome 能启动、页面也能开，
  //    但调试端口不会监听，表现为全程 ECONNREFUSED。这里统一转成绝对路径。
  const userDataDir = path.resolve(OUT_DIR, `chrome-profile-${Date.now()}`)
  mkdirSync(OUT_DIR, { recursive: true })
  console.log(`    浏览器：${chrome}`)
  console.log(`    profile：${userDataDir}`)
  console.log(`    调试端口：${PORT}`)
  // 直接把目标页作为启动参数：headless 新版里如果只传 about:blank，
  // 冷启动阶段有时还没有 page target（实测 156 版偶发），带上 URL 能稳定拿到页面。
  /** 子进程的诊断信息，失败时报出来，不靠猜 */
  let childInfo = { code: null, error: null, stderr: '' }
  const proc = spawn(
    chrome,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--hide-scrollbars',
      '--remote-allow-origins=*',
      BASE + '/',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )
  proc.on('error', (e) => {
    childInfo.error = e.message
  })
  proc.on('exit', (code) => {
    childInfo.code = code
  })
  proc.stderr?.on('data', (d) => {
    childInfo.stderr = (childInfo.stderr + String(d)).slice(-800)
  })

  try {
    // 等 Chrome 起来：先探 /json/version 确认调试端口在，再拿 page target
    let page = null
    let lastErr = null
    for (let i = 0; i < 120 && !page; i++) {
      try {
        const targets = await fetchJsonList(PORT)
        page = targets.find((t) => t.type === 'page' && !t.url.startsWith('chrome-extension'))
        if (page) break
      } catch (e) {
        lastErr = e
      }
      await sleep(250)
    }
    if (!page) {
      throw new Error(
        `Chrome 没有可用的页面 target（最后一次错误：${lastErr?.message ?? '无'}｜` +
          `子进程退出码：${childInfo.code ?? '未退出'}｜启动错误：${childInfo.error ?? '无'}｜` +
          `stderr：${childInfo.stderr.split('\n').filter(Boolean).slice(-2).join(' / ') || '空'}）`,
      )
    }

    const ws = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((res, rej) => {
      ws.addEventListener('open', res)
      ws.addEventListener('error', rej)
    })
    const cdp = new CDP(ws)

    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    // 锁死手机视口：390 宽 + 3 倍像素比，接近真机
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
    })

    const goto = async (url) => {
      await cdp.send('Page.navigate', { url })
      // 等 React 挂载 + 数据加载
      for (let i = 0; i < 80; i++) {
        await sleep(150)
        const ready = await cdp.eval('!!document.querySelector("#root")?.children.length').catch(() => false)
        if (ready) break
      }
      await sleep(600)
    }

    /** 页面诊断：横向溢出检测（scrollWidth 超过视口即失败） */
    const layout = () =>
      cdp.eval(`(() => {
        const de = document.documentElement
        const offenders = []
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect()
          if (r.width > 0 && r.right > 390.5) {
            offenders.push((el.className && typeof el.className === 'string' ? el.className.slice(0, 60) : el.tagName) + ' right=' + Math.round(r.right))
            if (offenders.length >= 5) break
          }
        }
        return {
          scrollWidth: de.scrollWidth,
          clientWidth: de.clientWidth,
          text: document.body.innerText.slice(0, 4000),
          offenders,
        }
      })()`)

    const clickByText = (selector, text) =>
      cdp.eval(`(() => {
        const els = [...document.querySelectorAll(${JSON.stringify(selector)})]
        const el = els.find(e => (e.innerText || '').replace(/\\s+/g, '').includes(${JSON.stringify(text.replace(/\s+/g, ''))}))
        if (!el) return false
        el.click()
        return true
      })()`)

    console.log(`\n[E2E] 服务地址 ${BASE}`)

    /* ---------- 1. 首页 ---------- */
    console.log('\n[E2E] 首页')
    await goto(BASE + '/')
    let s = await layout()
    check('页面渲染出「背单词」标题', s.text.includes('背单词'), s.text.slice(0, 200))
    check('两本书都列出来了', s.text.includes('5500') && s.text.includes('核心单词速记'))
    check('统计标签齐全（已学/学习时长/词次/错词）', s.text.includes('已学') && s.text.includes('学习时长') && s.text.includes('词次') && s.text.includes('错词'))
    check('有「浏览词书」入口', s.text.includes('浏览词书'))
    check('有「错词本」入口', s.text.includes('错词本'))
    check('390px 下无横向溢出', s.scrollWidth <= 390, `scrollWidth=${s.scrollWidth} offenders=${JSON.stringify(s.offenders)}`)
    writeFileSync(`${OUT_DIR}/01-home.png`, await screenshot(cdp), 'base64')

    /* ---------- 2. 开始背诵，判定一个词 ---------- */
    console.log('\n[E2E] 背诵流程（点一次「不认识」）')
    check('点击书1 进入选模式', await clickByText('button', '5500'))
    await sleep(400)
    s = await layout()
    check('进入模式选择页', s.text.includes('选择背诵模式'))
    check('模式页无横向溢出', s.scrollWidth <= 390, `scrollWidth=${s.scrollWidth}`)
    check('点击「开始背诵」', await clickByText('button', '开始背诵'))
    await sleep(900)
    s = await layout()
    const onRecite = s.text.includes('不认识') && s.text.includes('拆解')
    check('进入背诵页（有认识/不认识/拆解）', onRecite, s.text.slice(0, 200))
    check('背诵页无横向溢出', s.scrollWidth <= 390, `scrollWidth=${s.scrollWidth} offenders=${JSON.stringify(s.offenders)}`)

    if (onRecite) {
      writeFileSync(`${OUT_DIR}/02-recite.png`, await screenshot(cdp), 'base64')
      // 点两次「不认识」，制造错词
      for (let i = 0; i < 2; i++) {
        await clickByText('button', '不认识')
        await sleep(500)
      }
      // 再点两次「认识」
      for (let i = 0; i < 2; i++) {
        await clickByText('button', '认识')
        await sleep(500)
      }
    }

    /* ---------- 3. 回首页看统计是否累计 ---------- */
    console.log('\n[E2E] 统计累计 + 错词本')
    await cdp.eval(`(() => { const b = document.querySelector('button[aria-label="返回"]'); if (b) b.click(); return true })()`)
    await sleep(600)
    const exitShown = await cdp.eval('document.body.innerText.includes("要退出这一轮吗")')
    if (exitShown) {
      await clickByText('button', '退出')
      await sleep(800)
    }
    s = await layout()
    const hasStats = /已学[\s\S]{0,40}[1-9]/.test(s.text)
    check('首页已学词数已累计（>0）', hasStats, s.text.slice(0, 300))
    check('首页出现错词数量', /错词本\s*[1-9]/.test(s.text), s.text.slice(0, 300))
    check('返回首页后无横向溢出', s.scrollWidth <= 390, `scrollWidth=${s.scrollWidth}`)
    writeFileSync(`${OUT_DIR}/03-home-stats.png`, await screenshot(cdp), 'base64')

    /* ---------- 4. 错词本 ---------- */
    check('进入错词本', await clickByText('button', '错词本'))
    await sleep(700)
    s = await layout()
    check('错词本展示错词数与明细', s.text.includes('累计出错') && s.text.includes('错'), s.text.slice(0, 300))
    check('错词本有专项复习按钮', s.text.includes('专项复习'), s.text.slice(0, 300))
    check('错词本无横向溢出', s.scrollWidth <= 390, `scrollWidth=${s.scrollWidth} offenders=${JSON.stringify(s.offenders)}`)
    writeFileSync(`${OUT_DIR}/04-wrongbook.png`, await screenshot(cdp), 'base64')

    // 进入专项复习并确认能出题
    const drillOk = await clickByText('button', '专项复习')
    await sleep(1200)
    s = await layout()
    check('错词本 → 专项复习能进入背诵页', drillOk && s.text.includes('选出正确的中文释义'), s.text.slice(0, 200))
    check('专项复习页无横向溢出', s.scrollWidth <= 390, `scrollWidth=${s.scrollWidth}`)
    if (s.text.includes('选出正确的中文释义')) {
      writeFileSync(`${OUT_DIR}/05-drill.png`, await screenshot(cdp), 'base64')
    }
    // 退出背诵回到首页
    await cdp.eval(`(() => { const b = document.querySelector('button[aria-label="返回"]'); if (b) b.click(); return true })()`)
    await sleep(500)
    if (await cdp.eval('document.body.innerText.includes("要退出这一轮吗")')) {
      await clickByText('button', '退出')
      await sleep(800)
    }

    /* ---------- 5. 课外词书浏览 ---------- */
    console.log('\n[E2E] 课外词书浏览')
    check('进入浏览词书', await clickByText('button', '浏览词书'))
    await sleep(1200)
    s = await layout()
    check('浏览页展示组数与搜索框', s.text.includes('组 · 共') || s.text.includes('搜索单词'), s.text.slice(0, 300))
    const hasSearch = await cdp.eval('!!document.querySelector(\'input[aria-label="搜索单词"]\')')
    check('存在搜索输入框', hasSearch)
    check('浏览页无横向溢出', s.scrollWidth <= 390, `scrollWidth=${s.scrollWidth} offenders=${JSON.stringify(s.offenders)}`)
    writeFileSync(`${OUT_DIR}/06-browse.png`, await screenshot(cdp), 'base64')

    // 搜索
    if (hasSearch) {
      await cdp.eval(`(() => {
        const input = document.querySelector('input[aria-label="搜索单词"]')
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(input, 'act')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      })()`)
      await sleep(600)
      s = await layout()
      check('搜索 "act" 有结果', /找到\s*\d+/.test(s.text), s.text.slice(0, 300))
      check('搜索结果页无横向溢出', s.scrollWidth <= 390, `scrollWidth=${s.scrollWidth}`)
      writeFileSync(`${OUT_DIR}/07-search.png`, await screenshot(cdp), 'base64')

      // 点第一个搜索结果看拆解
      const opened = await cdp.eval(`(() => {
        const btn = [...document.querySelectorAll('li button')][0]
        if (!btn) return false
        btn.click()
        return true
      })()`)
      await sleep(600)
      s = await layout()
      check('点词弹出拆解弹层', opened && (s.text.includes('词根') || s.text.includes('释义') || s.text.includes('词缀')), s.text.slice(0, 300))
      check('拆解弹层无横向溢出', s.scrollWidth <= 390, `scrollWidth=${s.scrollWidth} offenders=${JSON.stringify(s.offenders)}`)
      writeFileSync(`${OUT_DIR}/08-breakdown.png`, await screenshot(cdp), 'base64')
    }

    // 长分组标题（书1 有很长的 △ 词根 = 释义 标题）也不能溢出
    await cdp.eval(`(() => { const b = document.querySelector('button[aria-label="关闭"]'); if (b) b.click(); return true })()`)
    await sleep(400)

    /* ---------- 6. 设置面板 + 导出/导入往返 ---------- */
    console.log('\n[E2E] 设置面板（备份）')
    // 回到首页：浏览页的返回按钮 aria-label 是「返回首页」。
    // 这里不能用 aria-label="返回"（那是背诵页的按钮，浏览页此时并不存在，容易点空或点错）。
    const backOk = await cdp.eval(`(() => {
      const b = document.querySelector('button[aria-label="返回首页"]')
      if (!b) return false
      b.click()
      return true
    })()`)
    await sleep(900)
    s = await layout()
    check('浏览页「返回」按钮可点到并回到首页', backOk && s.text.includes('选择词书'), s.text.slice(0, 160))

    await cdp.eval(`(() => { const b = document.querySelector('button[aria-label="设置"]'); if (b) b.click(); return true })()`)
    await sleep(600)
    s = await layout()
    check('设置面板有导出进度', s.text.includes('导出进度'), s.text.slice(0, 200))
    check('设置面板有导入进度', s.text.includes('导入进度'), s.text.slice(0, 200))
    check('设置面板无横向溢出', s.scrollWidth <= 390, `scrollWidth=${s.scrollWidth} offenders=${JSON.stringify(s.offenders)}`)
    check('设置面板有关闭按钮且带文字', s.text.includes('完成'), s.text.slice(0, 200))
    writeFileSync(`${OUT_DIR}/09-settings.png`, await screenshot(cdp), 'base64')

    /* ---------- 6.1 导出 → 真实拿到下载文件内容 ---------- */
    // 用 CDP 的 Browser.setDownloadBehavior 把下载落到磁盘，才能验证「导出的文件真的是合法备份」
    const dlDir = path.resolve(OUT_DIR, 'downloads')
    mkdirSync(dlDir, { recursive: true })
    await cdp.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: dlDir,
      eventsEnabled: true,
    })
    const exportOk = await cdp.eval(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('导出进度'))
      if (!btn) return 'no-button'
      btn.click()
      return 'clicked'
    })()`)
    check('导出按钮可点击且不报错', exportOk === 'clicked', String(exportOk))
    await sleep(1500)
    s = await layout()
    check('导出后出现成功提示', s.text.includes('已导出'), s.text.slice(0, 200))

    // 等下载完成并读取文件
    const { readdirSync, readFileSync } = await import('node:fs')
    let exported = null
    for (let i = 0; i < 40 && !exported; i++) {
      const files = readdirSync(dlDir).filter((f) => f.endsWith('.json'))
      if (files.length > 0) exported = files[0]
      else await sleep(250)
    }
    check('下载目录里出现了导出文件', !!exported, `目录内容：${readdirSync(dlDir).join(',') || '空'}`)
    check('文件名符合 word-books-backup-YYYY-MM-DD.json', !!exported && /^word-books-backup-\d{4}-\d{2}-\d{2}\.json$/.test(exported), String(exported))

    let backup = null
    if (exported) {
      backup = JSON.parse(readFileSync(path.join(dlDir, exported), 'utf8'))
      check('备份含 app 标识', backup.app === 'word-books', JSON.stringify(backup).slice(0, 120))
      check('备份含 version 与 exportedAt', typeof backup.version === 'number' && typeof backup.exportedAt === 'string')
      check('备份含 session/settings/stats 三个键', ['session', 'settings', 'stats'].every((k) => k in backup.keys), Object.keys(backup.keys).join(','))
      check('备份里的 stats 有实际学习记录', JSON.stringify(backup.keys.stats).length > 20)
    }

    /* ---------- 6.2 清空 → 导入 → 还原（真实往返） ---------- */
    if (backup) {
      // 先把设备上的数据清空，模拟「新手机 / 清过缓存」
      await cdp.eval(`(() => { Object.keys(localStorage).forEach(k => k.startsWith('word-books:v1:') && localStorage.removeItem(k)); return true })()`)
      await cdp.send('Page.reload')
      await sleep(1800)
      s = await layout()
      check('清空后首页统计归零', /已学[\s\S]{0,20}0/.test(s.text), s.text.slice(0, 200))

      // 通过真实的 <input type="file"> 导入（CDP DOM.setFileInputFiles 模拟用户选文件）
      const filePath = path.resolve(dlDir, exported)
      await cdp.eval(`(() => { const b = document.querySelector('button[aria-label="设置"]'); if (b) b.click(); return true })()`)
      await sleep(500)
      const doc = await cdp.send('DOM.getDocument')
      const node = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type=file]' })
      check('设置面板里有 file input', !!node.nodeId, `nodeId=${node.nodeId}`)
      if (node.nodeId) {
        await cdp.send('DOM.setFileInputFiles', { nodeId: node.nodeId, files: [filePath] })
        await sleep(900)
        s = await layout()
        check('导入后给出「备份有效」信息', s.text.includes('备份有效'), s.text.slice(0, 300))
        check('导入前要求确认覆盖', s.text.includes('导入会覆盖当前进度'), s.text.slice(0, 300))
        check('导入确认态无横向溢出', s.scrollWidth <= 390, `scrollWidth=${s.scrollWidth}`)
        writeFileSync(`${OUT_DIR}/10-import-confirm.png`, await screenshot(cdp), 'base64')

        // 点「确定覆盖」→ 页面重载
        const confirmed = await cdp.eval(`(() => {
          const btn = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '确定覆盖')
          if (!btn) return false
          btn.click()
          return true
        })()`)
        check('点「确定覆盖」触发导入', confirmed)
        await sleep(2500)
        s = await layout()
        // 还原后：首页应重新出现错词与已学数
        const restoredStats = await cdp.eval(`(() => localStorage.getItem('word-books:v1:stats'))()`)
        check('导入后 localStorage 重新出现 stats', !!restoredStats && restoredStats.length > 20, String(restoredStats).slice(0, 80))
        const expected = JSON.stringify(backup.keys.stats)
        check('导入恢复的 stats 与导出内容一致', restoredStats === expected, `导入=${String(restoredStats).slice(0, 80)} / 导出=${expected.slice(0, 80)}`)
        check('导入后页面重新渲染出统计数据', /已学/.test(s.text), s.text.slice(0, 200))
        writeFileSync(`${OUT_DIR}/11-after-import.png`, await screenshot(cdp), 'base64')
      }
    }

    // 导出后的 localStorage 完整性：stats 键应该已经落盘
    const keys = await cdp.eval('Object.entries(localStorage).map(([k,v]) => k.replace("word-books:v1:","") + ":" + String(v).length).join(", ")')
    check('localStorage 里已有 session 与 stats 键', keys.includes('session:') && keys.includes('stats:'), keys)
    console.log(`     localStorage 键：${keys}`)

    console.log(`\nE2E 结果：${pass} 项通过，${fail} 项失败`)
    console.log(`截图输出目录：${OUT_DIR}`)
    process.exitCode = fail === 0 ? 0 : 1
  } finally {
    try {
      proc.kill()
    } catch {
      /* ignore */
    }
  }
}

async function screenshot(cdp) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  return r.data
}

main().catch((e) => {
  console.error('E2E 执行失败：', e)
  process.exit(1)
})
