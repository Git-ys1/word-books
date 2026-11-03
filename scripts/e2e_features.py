"""
验证新增功能：统计 / 错词本 / 词书浏览 / 导出导入。
手机 390x844，真实 CDP 视口测量，不用 --window-size（那个不准）。

用法：python scripts/e2e_features.py <url> <out_dir>
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

STATE = r"""
(() => {
  const t = document.body.innerText || '';
  const btns = [...document.querySelectorAll('button')].map(b=>(b.innerText||'').trim()).filter(Boolean);
  return {
    text: t.replace(/\n/g,' | ').slice(0, 500),
    btns: btns.slice(0, 30),
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    vw: window.innerWidth,
    hasExport: /导出/.test(t),
    hasImport: /导入/.test(t),
    hasStats: /已学|学习时长|进度/.test(t),
    hasWrong: /错词/.test(t),
    hasBrowser: /浏览|词书内容|全部单词/.test(t)
  };
})()
"""


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

    def js(self, e, retry=4):
        """执行 JS。页面导航中会报 'Inspected target navigated or closed'，需要重试。"""
        last = None
        for _ in range(retry):
            try:
                r = self.send("Runtime.evaluate",
                              {"expression": e, "returnByValue": True, "awaitPromise": True})
                return r.get("result", {}).get("value")
            except RuntimeError as ex:
                last = ex
                if "navigated" in str(ex) or "closed" in str(ex) or "Cannot find context" in str(ex):
                    time.sleep(1.0)
                    continue
                raise
        raise last

    def shot(self, p):
        s = self.send("Page.captureScreenshot", {"format": "png"})
        with open(p, "wb") as f:
            f.write(base64.b64decode(s["data"]))

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass


def pick_free_port(start=9920, end=9999):
    """挑一个真正空闲的端口，避免和其他 agent 并行跑的 Chrome 抢端口。"""
    import socket
    for p in range(start, end):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", p))
                return p
            except OSError:
                continue
    raise RuntimeError("找不到空闲端口")


def main():
    url, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    prof = tempfile.mkdtemp(prefix="cdp-feat-")
    port = pick_free_port()
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
        time.sleep(3.5)
        cdp.js("""(()=>{const s=document.createElement('style');
          s.textContent='*,*::before,*::after{animation-duration:.001s!important;transition-duration:.001s!important}';
          document.head.appendChild(s);return 1})()""")
        time.sleep(0.5)

        step = [0]

        def snap(name):
            step[0] += 1
            st = cdp.js(STATE)
            log.append({"step": step[0], "name": name, "state": st})
            cdp.shot(os.path.join(out, f"{step[0]:02d}_{name}.png"))
            return st

        def click(txt, exact=False):
            js = """(() => {
              const btns=[...document.querySelectorAll('button')];
              const hit = %s;
              if(!hit) return {ok:false, cands: btns.map(b=>(b.innerText||'').trim().slice(0,24))};
              hit.click(); return {ok:true, clicked:(hit.innerText||'').trim().slice(0,40)};
            })()""" % (
                f"btns.find(b=>(b.innerText||'').trim()==={json.dumps(txt)})"
                if exact else
                f"btns.find(b=>(b.innerText||'').includes({json.dumps(txt)}))"
            )
            r = cdp.js(js)
            time.sleep(0.8)
            return r

        snap("home")

        # 打开设置，看有无导出/导入
        r = click("设置")
        if not r.get("ok"):
            # 设置按钮可能是图标，找 aria-label
            r = cdp.js("""(()=>{const b=[...document.querySelectorAll('button')]
              .find(x=>(x.getAttribute('aria-label')||'').includes('设置'));
              if(b){b.click();return {ok:true}}return{ok:false}})()""")
            time.sleep(0.8)
        snap("settings")

        # 关闭设置
        cdp.js("""(()=>{const b=[...document.querySelectorAll('button')]
          .find(x=>/关闭|完成|确定|收起/.test((x.innerText||'')));
          if(b)b.click();return 1})()""")
        time.sleep(0.7)

        # 词书浏览
        r = click("浏览")
        snap("browser")
        if not r.get("ok"):
            r2 = click("词书")
            snap("browser2")

        # 回首页：不要用 history.back()，会把 SPA 导航出应用导致空白页。
        # 改用页面内的返回按钮。
        cdp.js("""(()=>{
          const b=[...document.querySelectorAll('button')]
            .find(x=>/返回|首页|关闭|返回首页/.test((x.innerText||'')+(x.getAttribute('aria-label')||'')));
          if(b){b.click();return 'clicked'}
          return 'no-back-btn';
        })()""")
        time.sleep(0.9)
        snap("back_home")

        # 错词本
        r = click("错词")
        snap("wrongbook")

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
