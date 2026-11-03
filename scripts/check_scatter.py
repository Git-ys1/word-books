"""
验证书1 的「散词区」（原 PDF 的 △单列 区块）是否正确渲染，
以及组内随机模式下起始组列表的可读性。

用法：python scripts/check_scatter.py <url> <out_dir>
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
        return r.get("result", {}).get("value")

    def shot(self, p):
        s = self.send("Page.captureScreenshot", {"format": "png"})
        with open(p, "wb") as f:
            f.write(base64.b64decode(s["data"]))

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass


def main():
    url, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    prof = tempfile.mkdtemp(prefix="cdp-scatter-")
    port = 9777
    proc = subprocess.Popen(
        [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox",
         f"--user-data-dir={prof}", f"--remote-debugging-port={port}",
         "--hide-scrollbars", "--disable-extensions", "--no-first-run",
         "--no-default-browser-check", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    log = {}
    try:
        cdp = CDP(wait_cdp(port))
        cdp.send("Page.enable")
        cdp.send("Runtime.enable")
        cdp.send("Emulation.setDeviceMetricsOverride",
                 {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
        cdp.send("Page.navigate", {"url": url})
        time.sleep(3.0)
        cdp.js("""(()=>{const s=document.createElement('style');
          s.textContent='*,*::before,*::after{animation-duration:.001s!important;transition-duration:.001s!important}';
          document.head.appendChild(s);return 1})()""")
        time.sleep(0.4)

        # 进入书1 -> 组内随机（出现起始组列表）
        cdp.js("""(()=>{[...document.querySelectorAll('button')]
          .find(b=>(b.innerText||'').includes('考研词汇 5500'))?.click();return 1})()""")
        time.sleep(0.8)
        cdp.js("""(()=>{[...document.querySelectorAll('button')]
          .find(b=>(b.innerText||'').includes('组内随机'))?.click();return 1})()""")
        time.sleep(0.8)
        # 组内随机模式下要点「开始背诵」才会进入选起点组页面
        cdp.js("""(()=>{const btns=[...document.querySelectorAll('button')];
          const hit=btns.find(b=>(b.innerText||'').trim()==='开始背诵');
          if(hit){hit.click();return 1} return 0})()""")
        time.sleep(0.9)
        cdp.shot(os.path.join(out, "groups_list.png"))

        # 抓所有分组标题
        titles = cdp.js("""(()=>{
          const btns=[...document.querySelectorAll('button')];
          return btns.map(b=>(b.innerText||'').trim().replace(/\\n/g,' | ')).filter(t=>t.length>0);
        })()""")
        log["group_buttons"] = titles

        # 检查是否有「△ 单列」这种坏标题
        bad = [t for t in titles if '单列' in t and '散词区' not in t]
        log["bad_scatter_titles"] = bad
        log["has_scatter_section"] = [t for t in titles if '散词区' in t]

        # 滚到列表底部，截图看散词区的呈现
        cdp.js("""(()=>{const el=[...document.querySelectorAll('button')]
          .find(b=>(b.innerText||'').includes('散词区'));
          if(el){el.scrollIntoView({block:'center'});return 1;} return 0;})()""")
        time.sleep(0.8)
        cdp.shot(os.path.join(out, "scatter_visible.png"))

        cdp.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()

    with open(os.path.join(out, "scatter_log.json"), "w", encoding="utf-8") as f:
        json.dump(log, f, ensure_ascii=False, indent=1)
    print("done")


if __name__ == "__main__":
    main()
