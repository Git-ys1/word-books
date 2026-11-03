"""
Chrome 截图工具（修正版）。

关键教训（2026-11-03 实测）：
  headless=new 下 --window-size=390,844 实际 innerWidth 是 500，截图被缩放，
  直接拿它判断「手机端布局」会看到假的裁切/错位。
  必须显式校验 innerWidth，或用 Emulation.setDeviceMetricsOverride。

本脚本用 CDP：
  1. 启动 chrome --remote-debugging-port
  2. Emulation.setDeviceMetricsOverride 精确设定视口
  3. 等待动画播完（禁用动画）
  4. 截图 + 导出布局测量
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
            last = "no page target"
        except Exception as e:
            last = str(e)
        time.sleep(0.4)
    raise RuntimeError(f"CDP 未就绪: {last}")


class CDP:
    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, timeout=40)
        self.n = 0

    def send(self, method, params=None):
        self.n += 1
        self.ws.send(json.dumps({"id": self.n, "method": method, "params": params or {}}))
        while True:
            resp = json.loads(self.ws.recv())
            if resp.get("id") == self.n:
                if "error" in resp:
                    raise RuntimeError(f"{method} -> {resp['error']}")
                return resp.get("result", {})

    def eval(self, expr):
        r = self.send("Runtime.evaluate", {
            "expression": expr, "returnByValue": True, "awaitPromise": True})
        return r.get("result", {}).get("value")

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass


MEASURE_JS = r"""
(() => {
  const shell = document.querySelector('.app-shell');
  const cards = [...document.querySelectorAll('.card')];
  const sr = shell ? shell.getBoundingClientRect() : null;
  const offenders = [...document.querySelectorAll('body *')]
    .filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > window.innerWidth + 1;
    })
    .slice(0, 10)
    .map(el => ({tag: el.tagName, cls: String(el.className).slice(0, 80),
                 right: Math.round(el.getBoundingClientRect().right)}));
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    dpr: window.devicePixelRatio,
    docScrollWidth: document.documentElement.scrollWidth,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    shellLeft: sr ? Math.round(sr.left) : null,
    shellRight: sr ? Math.round(sr.right) : null,
    shellOverflowX: shell ? getComputedStyle(shell).overflowX : null,
    cardCount: cards.length,
    cardRights: cards.slice(0, 3).map(c => Math.round(c.getBoundingClientRect().right)),
    offenders
  };
})()
"""


def capture(url, out_png, width=390, height=844, dsf=2, port=9555, wait_ms=2500):
    prof = tempfile.mkdtemp(prefix="cdp-shot-")
    proc = subprocess.Popen(
        [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox",
         f"--user-data-dir={prof}", f"--remote-debugging-port={port}",
         "--hide-scrollbars", "--disable-extensions",
         "--no-first-run", "--no-default-browser-check", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        cdp = CDP(wait_cdp(port))
        cdp.send("Page.enable")
        cdp.send("Runtime.enable")
        cdp.send("Emulation.setDeviceMetricsOverride", {
            "width": width, "height": height,
            "deviceScaleFactor": dsf, "mobile": True,
        })
        cdp.send("Page.navigate", {"url": url})
        time.sleep(wait_ms / 1000.0)

        # 关掉动画，避免截到淡入中途的半透明帧
        cdp.eval("""
          (() => {
            const s = document.createElement('style');
            s.textContent = `*,*::before,*::after{animation-duration:.001s!important;
              animation-delay:0s!important;transition-duration:.001s!important}`;
            document.head.appendChild(s);
            return true;
          })()
        """)
        time.sleep(0.6)

        measured = cdp.eval(MEASURE_JS)
        shot = cdp.send("Page.captureScreenshot", {"format": "png"})
        with open(out_png, "wb") as f:
            f.write(base64.b64decode(shot["data"]))

        cdp.close()
        return measured
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()


def main():
    url = sys.argv[1]
    out = sys.argv[2]
    w = int(sys.argv[3]) if len(sys.argv) > 3 else 390
    h = int(sys.argv[4]) if len(sys.argv) > 4 else 844
    m = capture(url, out, w, h)
    print(json.dumps(m, ensure_ascii=False, indent=1))
    with open(os.path.splitext(out)[0] + "_measure.json", "w", encoding="utf-8") as f:
        json.dump(m, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
