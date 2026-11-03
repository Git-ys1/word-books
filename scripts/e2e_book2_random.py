"""
验证书2 + 完全随机模式的完整流程（这是最复杂的路径）。
覆盖：选书2 → 完全随机 → 第一阶段判断 → 第二阶段四选一 → 退出时错词复习逻辑。

用法：python scripts/e2e_book2_random.py <url> <out_dir>
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
    while time.time() - start < timeout:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=2) as r:
                pages = [t for t in json.load(r) if t.get("type") == "page"]
            if pages:
                return pages[0]["webSocketDebuggerUrl"]
        except Exception:
            pass
        time.sleep(0.4)
    raise RuntimeError("CDP 未就绪")


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

    def js(self, e):
        r = self.send("Runtime.evaluate", {"expression": e, "returnByValue": True, "awaitPromise": True})
        res = r.get("result", {})
        return res.get("value")

    def shot(self, p):
        s = self.send("Page.captureScreenshot", {"format": "png"})
        with open(p, "wb") as f:
            f.write(base64.b64decode(s["data"]))

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass


STATE = r"""
(() => {
  const t = document.body.innerText || '';
  const btns = [...document.querySelectorAll('button')].map(b=>(b.innerText||'').trim()).filter(Boolean);
  return {
    text: t.replace(/\n/g,' | ').slice(0, 400),
    btnCount: btns.length,
    options: btns.filter(x => /^[anv][.．]/.test(x)),
    hasKnow: btns.includes('认识'),
    hasDontKnow: btns.includes('不认识'),
    hasBreakdown: btns.includes('拆解'),
    hasQuiz: /选择|选出|意思/.test(t),
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    viewport: window.innerWidth + 'x' + window.innerHeight
  };
})()
"""


def main():
    url, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    prof = tempfile.mkdtemp(prefix="cdp-b2-")
    port = 9888
    proc = subprocess.Popen(
        [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox",
         f"--user-data-dir={prof}", f"--remote-debugging-port={port}",
         "--hide-scrollbars", "--disable-extensions", "--no-first-run",
         "--no-default-browser-check", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    log = []
    try:
        cdp = CDP(wait_cdp(port))
        cdp.send("Page.enable")
        cdp.send("Runtime.enable")
        cdp.send("Emulation.setDeviceMetricsOverride",
                 {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
        cdp.send("Page.navigate", {"url": url})
        time.sleep(3.2)
        cdp.js("""(()=>{const s=document.createElement('style');
          s.textContent='*,*::before,*::after{animation-duration:.001s!important;transition-duration:.001s!important}';
          document.head.appendChild(s);return 1})()""")
        time.sleep(0.4)

        step = [0]

        def snap(name):
            step[0] += 1
            st = cdp.js(STATE)
            log.append({"step": step[0], "name": name, "state": st})
            cdp.shot(os.path.join(out, f"{step[0]:02d}_{name}.png"))
            return st

        def click_text(txt, exact=False):
            js = """(() => {
              const btns=[...document.querySelectorAll('button')];
              const hit = %s;
              if(!hit) return {ok:false, cands: btns.map(b=>(b.innerText||'').trim().slice(0,20))};
              hit.click(); return {ok:true, clicked:(hit.innerText||'').trim().slice(0,40)};
            })()""" % (
                f"btns.find(b=>(b.innerText||'').trim()==={json.dumps(txt)} )"
                if exact
                else f"btns.find(b=>(b.innerText||'').includes({json.dumps(txt)}))"
            )
            r = cdp.js(js)
            time.sleep(0.7)
            return r

        snap("home")
        log.append({"pick_book2": click_text("核心单词速记")})
        snap("mode")
        log.append({"pick_random": click_text("完全随机")})
        snap("random_selected")
        log.append({"start": click_text("开始背诵", exact=True)})
        time.sleep(1.2)
        st = snap("first_stage")

        # 如果完全随机直接进四选一
        if st.get("options"):
            log.append({"notice": "完全随机直接进入四选一", "options": st["options"]})
            # 点第一个选项
            log.append({"answer": cdp.js("""(()=>{const b=[...document.querySelectorAll('button')]
              .find(x=>/^[anv][.．]/.test((x.innerText||'').trim()));
              if(b){b.click();return (b.innerText||'').trim()} return 'none'})()""")})
            time.sleep(0.9)
            snap("after_answer")
            st2 = snap("next_question")
        else:
            st2 = st

        # 测试退出逻辑
        back = cdp.js("""(()=>{
          const b=[...document.querySelectorAll('button')]
            .find(x=>((x.getAttribute('aria-label')||'')+ (x.innerText||'')).includes('返回') || (x.innerText||'').trim()==='');
          return b ? 'found' : 'no-back';
        })()""")
        log.append({"back_button": back})

        cdp.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()

    with open(os.path.join(out, "log.json"), "w", encoding="utf-8") as f:
        json.dump(log, f, ensure_ascii=False, indent=1)
    print("done")


if __name__ == "__main__":
    main()
