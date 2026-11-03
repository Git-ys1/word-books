# -*- coding: utf-8 -*-
"""book2 最终验收：报告声明项 vs 文件实况（可重复运行）。"""
import json, re, sys, io, hashlib
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

J = r"F:\AcademicHub\word-books\src\data\generated\book2.json"
d = json.load(open(J, encoding="utf-8"))
CJK = re.compile(r"[\u4e00-\u9fff]")

def find(w):
    for g in d["groups"]:
        for e in g["entries"]:
            if e["word"] == w:
                return g["day"], e
    return None, None

print("=" * 74)
print("A. 报告声明项 vs 文件实况")
print("=" * 74)
tot = sum(len(g["entries"]) for g in d["groups"])
print(f"  {'PASS' if tot == 1515 else 'FAIL'}  总条数 = {tot} (期望 1515)")

EMPTIED = ["arrangement","courtship","locate","allocate","intricacy","aristocratic",
           "nobility","virtually","senator","inevitable","inevitably","diffusionism"]
bad = [w for w in EMPTIED if find(w)[1] is None or find(w)[1]["memory"] != ""]
print(f"  {'PASS' if not bad else 'FAIL'}  12 条纯杂码已置空 (异常 {len(bad)})")

for w, want in [("spread","传播，使分布，伸开v. 传播n."),("widespread","分布广的adj.")]:
    _, e = find(w)
    ok = e and e["meaning"] == want and " " not in e["word"]
    print(f"  {'PASS' if ok else 'FAIL'}  {w}: {e['meaning']!r}")

MERGED = {"support":"支撑，支持，资助v.n.","supporter":"支持者n.","supportive":"给予支持的adj.",
 "report":"报告v.n.","opportunity":"机会n.","profitable":"可盈利的，有益的adj.",
 "benefit":"获益v. 好处，保险金n.","beneficial":"有帮助的adj.","benefactor":"赞助者n.",
 "potential":"潜在的adj. 潜在性n.","potentially":"潜在地adv.",
 "qualified":"合格的，有资格的adj.","qualification":"资格，条件n."}
bad = [(w,(find(w)[1] or {}).get("meaning")) for w,want in MERGED.items()
       if (find(w)[1] or {}).get("meaning") != want]
print(f"  {'PASS' if not bad else 'FAIL'}  并档 13 条 meaning 已回填 (异常 {len(bad)})")
for x in bad: print("      ", x)

_, e = find("renaissance")
print(f"  {'PASS' if e and e['meaning']=='复兴，文艺复兴时期n.' else 'FAIL'}  renaissance: {e['meaning']!r}")
_, e2 = find("i")
print(f"  {'PASS' if e2 is None else 'FAIL'}  非法 word 'i' 已不存在: {e2}")

SAMPLE = [("tendency","tend趋向+ency名词"),("extend","ex向外+tend伸展"),
          ("stake","对比：state"),("hunt","hurt受伤 猎物受伤 展开打猎搜寻 ， ，"),
          ("threaten","en 使得 ，"),
          ("vocational","vocation 谐音：我开心 我开心有这份职业 ， ，")]
for w, want in SAMPLE:
    _, e = find(w)
    ok = e and e["memory"] == want
    print(f"  {'PASS' if ok else 'FAIL'}  {w:<12} {e['memory']!r}")

print()
print("=" * 74)
print("B. 全量红线")
print("=" * 74)
em = sum(1 for g in d["groups"] for e in g["entries"] if not e["meaning"].strip())
mm = sum(1 for g in d["groups"] for e in g["entries"] if not e["memory"].strip())
wc = sum(1 for g in d["groups"] for e in g["entries"] if CJK.search(e["word"]))
sp = sum(1 for g in d["groups"] for e in g["entries"] if " " in e["word"].strip())
rc = sum(1 for g in d["groups"] for e in g["entries"] if CJK.search(e["root"]) or "Shen" in e["root"])
IPA = re.compile(r"[\u02c8\u02ccˈˌːəʊɪæʌʃʒθðŋɡɒɜɐɛɔ]")
ip = sum(1 for g in d["groups"] for e in g["entries"]
         for k in ("word","root","rootMeaning","meaning","memory") if IPA.search(e.get(k,"")))
print(f"  meaning 空       : {em}   {'PASS' if em==0 else 'FAIL'}")
print(f"  memory  空       : {mm}   (报告 109)")
print(f"  word 含中文      : {wc}   {'PASS' if wc==0 else 'FAIL'}")
print(f"  word 含空格      : {sp}   {'PASS' if sp==0 else 'FAIL'}")
print(f"  root 含中文/水印 : {rc}   {'PASS' if rc==0 else 'FAIL'}")
print(f"  IPA 混入         : {ip}   {'PASS' if ip==0 else 'FAIL'}")
print(f"\n  MD5: {hashlib.md5(open(J,'rb').read()).hexdigest().upper()}")
