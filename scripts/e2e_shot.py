"""
端到端交互验收：真实点击「选书 → 选模式 → 进入背诵 → 拆解 → 认识/不认识」，
逐步截图，验证核心背诵流程在 390px 手机视口下真实可用。

用法：python scripts/e2e_shot.py <url> <out_dir>
"""
import base64
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request

import websocket

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"


def wait_cdp(port, timeout=25):
    start = time.time()
    last = ""
    while time.time() - start < timeout:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=2) as r:
                data = json.load(r)
            pages = [t for t in data if t.get("type") == "page"]
            if pages:
                return pages[0]["webSocketDebuggerUrl"]
            last = "no page"
        except Exception as e:
            last = str(e)
        time.sleep(0.4)
    raise RuntimeError(f"CDP 未就绪: {last}")


class CDP:
    def __init__(self, ws):
        self.ws = websocket.create_connection(ws, timeout=40)
        self.n = 0

    def send(self, m, p=None):
        self.n += 1
        self.ws.send(json.dumps({"id": self.n, "method": m, "params": p or {}}))
        while True:
            r = json.loads(self.ws.recv())
            if r.get("id") == self.n:
                if "error" in r:
                    raise RuntimeError(f"{m} -> {r['error']}")
                return r.get("result", {})

    def js(self, expr):
        r = self.send("Runtime.evaluate",
                      {"expression": expr, "returnByValue": True, "awaitPromise": True})
        res = r.get("result", {})
        if res.get("subtype") == "error":
            return {"__error__": res.get("description")}
        return res.get("value")

    def shot(self, path):
        s = self.send("Page.captureScreenshot", {"format": "png"})
        with open(path, "wb") as f:
            f.write(base64.b64decode(s["data"]))

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass


# 用可见文本点击按钮的通用函数
CLICK_BY_TEXT = r"""
(sel, text) => {
  const els = [...document.querySelectorAll(sel)];
  const hit = els.find(e => (e.innerText || '').includes(text));
  if (!hit) return {ok:false, reason:'not found', candidates: els.map(e=>(e.innerText||'').slice(0,30))};
  hit.click();
  return {ok:true, clicked:(hit.innerText||'').slice(0,40)};
}
"""

SNAPSHOT = r"""
(() => {
  const txt = document.body.innerText || '';
  return {
    text: txt.slice(0, 500),
    buttons: [...document.querySelectorAll('button')].map(b => (b.innerText||'').trim().slice(0,24)).filter(Boolean),
    hasBreakdownBtn: txt.includes('拆解'),
    hasKnow: txt.includes('认识'),
    hasDontKnow: txt.includes('不认识'),
    optionCount: [...document.querySelectorAll('button')].filter(b=>/^[anv]\./.test((b.innerText||'').trim())).length,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1
  };
})()
"""


def main():
    url = sys.argv[1]
    out = sys.argv[2]
    os.makedirs(out, exist_ok=True)
    prof = tempfile.mkdtemp(prefix="cdp-e2e-")
    port = 9666
    proc = subprocess.Popen(
        [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox",
         f"--user-data-dir={prof}", f"--remote-debugging-port={port}",
         "--hide-scrollbars", "--disable-extensions",
         "--no-first-run", "--no-default-browser-check", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    log = []
    try:
        cdp = CDP(wait_cdp(port))
        cdp.send("Page.enable")
        cdp.send("Runtime.enable")
        cdp.send("Emulation.setDeviceMetricsOverride",
                 {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
        cdp.send("Page.navigate", {"url": url})
        time.sleep(3.0)

        # 关动画
        cdp.js("""(()=>{const s=document.createElement('style');
          s.textContent='*,*::before,*::after{animation-duration:.001s!important;transition-duration:.001s!important}';
          document.head.appendChild(s);return 1})()""")
        time.sleep(0.4)

        step = 0

        def snap(name, js=None):
            nonlocal step
            step += 1
            if js:
                r = cdp.js(js)
                log.append({"step": step, "name": name, "action": r})
            else:
                log.append({"step": step, "name": name, "action": None})
            st = cdp.js(SNAPSHOT)
            log[-1]["state"] = st
            cdp.shot(os.path.join(out, f"{step:02d}_{name}.png"))
            return st

        # 1. 首页
        snap("home")

        # 2. 点击书1
        snap("pick_book1", f"({CLICK_BY_TEXT})('button', '考研词汇 5500')")
        time.sleep(0.8)

        # 3. 选完全顺序模式
        st = cdp.js(SNAPSHOT)
        modes = cdp.js("[...document.querySelectorAll('button')].map(b=>(b.innerText||'').trim().slice(0,30))")
        log.append({"step": "modes_available", "buttons": modes})
        snap("pick_mode_seq", f"({CLICK_BY_TEXT})('button', '完全顺序')")
        time.sleep(0.8)

        # 4. 开始背诵（精确匹配，避免误点「组内随机...可从任意组开始」）
        st = cdp.js(SNAPSHOT)
        log.append({"step": "before_start", "buttons": st.get("buttons")})
        snap("start", f"""
          (() => {{
            const btns = [...document.querySelectorAll('button')];
            const hit = btns.find(b => (b.innerText||'').trim() === '开始背诵')
                     || btns.find(b => (b.innerText||'').trim().endsWith('开始背诵'));
            if (!hit) return {{ok:false, cands: btns.map(b=>(b.innerText||'').trim().slice(0,20))}};
            hit.click();
            return {{ok:true, clicked:(hit.innerText||'').trim()}};
          }})()
        """)
        time.sleep(1.2)

        # 5. 背诵第一阶段
        snap("judge_stage")

        # 6. 点拆解
        snap("breakdown", f"({CLICK_BY_TEXT})('button', '拆解')")
        time.sleep(0.6)
        snap("breakdown_open")

        # 7. 点认识（精确匹配，避免命中「不认识」）
        snap("mark_known", f"""
          (() => {{
            const btns = [...document.querySelectorAll('button')];
            const hit = btns.find(b => (b.innerText||'').trim() === '认识');
            if (!hit) return {{ok:false, cands: btns.map(b=>(b.innerText||'').trim().slice(0,20))}};
            hit.click(); return {{ok:true}};
          }})()
        """)
        time.sleep(0.6)
        snap("after_known")

        # 8. 点不认识（精确匹配）
        snap("mark_unknown", f"""
          (() => {{
            const btns = [...document.querySelectorAll('button')];
            const hit = btns.find(b => (b.innerText||'').trim() === '不认识');
            if (!hit) return {{ok:false, cands: btns.map(b=>(b.innerText||'').trim().slice(0,20))}};
            hit.click(); return {{ok:true}};
          }})()
        """)
        time.sleep(0.6)
        snap("after_unknown")

        cdp.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()

    with open(os.path.join(out, "e2e_log.json"), "w", encoding="utf-8") as f:
        json.dump(log, f, ensure_ascii=False, indent=1)
    print(f"完成 {len(log)} 步，输出到 {out}")


if __name__ == "__main__":
    main()
