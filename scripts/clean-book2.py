#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
书2（book2.json）收尾清洗脚本  —  可重复运行、幂等。

修复项（严格限定，root / rootMeaning 一律不碰）：
  I.   memory 字段首部字体碎屑（PDF 页脚水印「Shen的背书魔法」碎片）
        'e h tend趋向+ency名词' -> 'tend趋向+ency名词'
        'S ex向外+tend伸展'      -> 'ex向外+tend伸展'
        '魔 对比：state'         -> '对比：state'
        判据：开头连续的单字母 token / 水印单字，且其后紧跟中文或长度>=2 的正经英文。
        守卫（重要）：单字母若是构词语素（a/an/i/ad + 中文释义 或 a + mate同事），保留。
              例：'a + gree绿色…' / 'a + mate同事…' / 'a + cade…' 一律不动。
        整条全是碎屑 -> 置空。
  II.  word 与释义粘连（PDF 第45页跨页续页、无表格线兜底）
        'spread传播，使分布，伸开v.' -> word='spread', meaning='传播，使分布，伸开v.'
        判据：word 含中文 -> 按首个中文字符切开，后半并进 meaning 头部。
  III. 并档词条（PDF 表格一行里塞了多行文字，被压成一个 word 字段）
        'support supporter supportive report opportunity' -> 5 条独立记录
        做法：**回到 PDF 原文**按行坐标逐条还原 word / meaning / memory，
              不做任何语义猜测；取不回则保留原值并在报告登记（绝不置空）。

约束：
  * 幂等：对已清洗文件重复运行，改动数必须为 0。
  * meaning 不允许被本脚本置空；输出前自检，若发现为空则拒绝写盘。
  * 输出前后对比统计 + 逐条明细 + JSON 报告。

用法：
  python clean-book2.py            # 清洗并写回 book2.json
  python clean-book2.py --dry-run  # 只统计不写盘
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import io
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
JSON_PATH = ROOT / "src" / "data" / "generated" / "book2.json"
REPORT_JSON = ROOT / "scripts" / "_clean_book2_report.json"
PDF_PATH = (ROOT.parent / "000资料相关" / "000考研" / "考研资料" / "英语" / "单词" /
            "核心单词速记_第1-10天_合集（打印版）.pdf")

CJK = re.compile(r"[\u4e00-\u9fff]")
WATERMARK_CHARS = set("Shen的背书魔法")
# 本身有语义、必须保留的单字母构词语素
MEANINGFUL_SINGLE = {"a", "i", "A", "I", "ad", "an"}
# 这些字母是「前后缀速记缩写」的高频形态，紧跟中文时可以认定为正文
PREFIX_LETTERS = set("aeinso")


# --------------------------------------------------------------------------
# I. memory 首部碎屑（带构词语素守卫）
# --------------------------------------------------------------------------
def _is_debris_token(tok: str) -> bool:
    if not tok:
        return False
    if len(tok) == 1 and tok.isalpha():
        return True
    if len(tok) == 1 and tok in WATERMARK_CHARS:
        return True
    return False


def _is_legit_token(tok: str) -> bool:
    """碎屑之后的首个 token 是否「正经」：含中文，或长度>=2 的字母串。"""
    if not tok:
        return False
    if CJK.search(tok):
        return True
    if len(tok) >= 2 and re.search(r"[A-Za-z]{2}", tok):
        return True
    return False


def _guard_prefix_letter(tok: str, next_tok: str) -> bool:
    """判断单字母是否为有语义的构词语素，需保留。

    命中任一即保留：
      * tok 在 MEANINGFUL_SINGLE 中（a / i / A / I / an / ad）
      * next_tok 以 '+' 开头（'a + mate同事' 这种「前缀 + 词根」写法）
      * next_tok 是纯中文（'a 大'）且 tok 属于常见前缀字母表
      * next_tok 长度>=2 的英文，tok 属于 a / e / i / o / n / s 前缀字符集，且整条不是水印形态
    """
    if not tok:
        return False
    if tok in MEANINGFUL_SINGLE:
        return True
    if next_tok.startswith("+"):
        return True
    if re.match(r"^[A-Za-z]{2,}$", next_tok or "") and tok.lower() in PREFIX_LETTERS:
        # 'a + gree绿色' 已在上面处理；这里覆盖 'a gree绿色' 之类
        return True
    return False


def strip_leading_debris(memory: str) -> tuple[str, bool, str]:
    """返回 (新值, 是否改动, 说明)。"""
    if not memory:
        return memory, False, ""
    toks = memory.split()
    if not toks:
        return memory, False, ""

    i = 0
    while i < len(toks):
        t = toks[i]
        if not _is_debris_token(t):
            # 纯中文单字也可能属于正文，只认水印字集
            break
        nxt = toks[i + 1] if i + 1 < len(toks) else ""
        if _guard_prefix_letter(t, nxt):
            # 有语义的构词语素：停止，不删
            break
        i += 1

    if i == 0:
        return memory, False, ""

    if i >= len(toks):
        return "", True, "all-debris->empty"

    if not _is_legit_token(toks[i]):
        return memory, False, f"guard-blocked(next={toks[i]!r})"

    return " ".join(toks[i:]), True, f"stripped={i}"


def strip_inline_watermark(memory: str) -> tuple[str, bool, str]:
    """移除夹在正文中间、被空格/中文标点包住的孤立水印碎片。判据从严，宁可漏清。"""
    if not memory:
        return memory, False, ""
    toks = memory.split()
    if len(toks) < 2:
        return memory, False, ""

    CJK_PUNCT = set("，。、；：！？（）【】…·—")
    HIGH_RISK = set("的法")

    def is_wm(t) -> bool:
        return len(t) == 1 and t in WATERMARK_CHARS

    drop: set[int] = set()
    n = len(toks)
    for i, t in enumerate(toks):
        if not is_wm(t):
            continue
        run, j = 1, i + 1
        while j < n and is_wm(toks[j]):
            run += 1
            j += 1
        k = i - 1
        while k >= 0 and is_wm(toks[k]):
            run += 1
            k -= 1
        if run >= 2:
            drop.add(i)
            continue
        if t in HIGH_RISK:
            prev_ascii = i > 0 and re.match(r"^[A-Za-z0-9]+\s*$", toks[i - 1] or "")
            next_ok = i + 1 < n and re.match(r"^[A-Za-z][A-Za-z\-]*", toks[i + 1] or "")
            if prev_ascii and next_ok:
                drop.add(i)
            continue
        prev_ok = i > 0 and (toks[i - 1] in CJK_PUNCT or re.match(r"^[A-Za-z0-9]", toks[i - 1] or "x"))
        if prev_ok:
            drop.add(i)

    if not drop:
        return memory, False, ""
    kept = [t for idx, t in enumerate(toks) if idx not in drop]
    new = " ".join(kept).strip()
    new = re.sub(r"^[，。、；：,.;:\s]+", "", new).strip()
    return new, True, f"inline-wm={len(drop)}"


# --------------------------------------------------------------------------
# II. word 与释义粘连
# --------------------------------------------------------------------------
def split_word_cjk(word: str, meaning: str) -> tuple[str, str, bool, str]:
    m = CJK.search(word)
    if not m:
        return word, meaning, False, ""
    idx = m.start()
    new_word = word[:idx].strip()
    tail = word[idx:].strip()
    if not new_word:
        return word, meaning, False, "cjk-at-start"
    return new_word, tail + (meaning if meaning else ""), True, "word-cjk-split"


# --------------------------------------------------------------------------
# III. 并档词条 —— 从 PDF 原文按行还原
# --------------------------------------------------------------------------
MERGE_GUARD_WORDS = {"a", "an", "the", "to", "of", "in", "on", "at", "as", "or", "and"}


def split_merged_word(word: str) -> list[str]:
    toks = word.split()
    if len(toks) < 2:
        return []
    for t in toks:
        if CJK.search(t):
            return []
        if not re.match(r"^[A-Za-z][A-Za-z\-'()/.]*$", t):
            return []
    if any(t.lower() in MERGE_GUARD_WORDS for t in toks):
        return []
    return toks


class PdfRowIndex:
    """按 (day) 建立 word -> (page, y, 各列文字) 的索引。"""

    DAY_PAGES = {1: range(0, 5), 2: range(5, 10), 3: range(10, 16), 4: range(16, 22),
                 5: range(22, 28), 6: range(28, 35), 7: range(34, 40), 8: range(39, 46),
                 9: range(45, 51), 10: range(50, 55)}

    def __init__(self, pdf_path: Path):
        self.ready = False
        self.lines: dict[int, list] = {}
        self.index: dict[tuple[int, str], tuple[int, float]] = {}
        try:
            import pymupdf  # noqa
        except Exception:
            try:
                import fitz as pymupdf  # noqa
            except Exception:
                return
        if not pdf_path.exists():
            return
        doc = pymupdf.open(str(pdf_path))
        for day, pages in self.DAY_PAGES.items():
            for p in pages:
                rows = []
                for b in doc[p].get_text("dict")["blocks"]:
                    for l in b.get("lines", []):
                        t = "".join(s["text"] for s in l["spans"]).strip()
                        if t:
                            rows.append((round(l["bbox"][1], 1), round(l["bbox"][0], 1), t))
                rows.sort()
                self.lines[p] = rows
                for y, x, t in rows:
                    self.index.setdefault((day, t), (p, y))
        self.ready = True

    def row_cols(self, day: int, word: str) -> tuple[int, float, list] | None:
        """返回 (page, y, [(x, text)...])，找不到返回 None。"""
        if not self.ready:
            return None
        hit = self.index.get((day, word))
        if not hit:
            return None
        p, y = hit
        cols = [(x, t) for yy, x, t in self.lines[p] if abs(yy - y) <= 5]
        cols.sort()
        return p, y, cols

    def locate_word_by_meaning(self, day: int, meaning: str):
        """当 word 非法时，用 meaning 的特征去反查同一行的真实单词。

        返回 (page, y, cols, word) 或 None。
        跨页续行时同一条目会出现两次（p54 断行 + p55 完整行），
        优先返回「释义更完整」的那一行。
        """
        if not self.ready or not meaning:
            return None
        fp = "".join(CJK.findall(meaning))[:4]
        if len(fp) < 2:
            return None
        best = None
        for p in self.DAY_PAGES[day]:
            rows = self.lines.get(p) or []
            for y, x, t in rows:
                if x >= 100 and fp[:2] in t:
                    cols = [(xx, tt) for yy, xx, tt in rows if abs(yy - y) <= 6]
                    cols.sort()
                    cand = [tt for xx, tt in cols
                            if xx < 100 and re.match(r"^[A-Za-z][A-Za-z\-'()/. ]*$", tt.strip())]
                    if not cand:
                        continue
                    pm, _pmem = _col_split(cols)
                    score = len(CJK.findall(pm))
                    # 释义里应含词性标记才算完整
                    if re.search(r"(?:adj|adv|n|v)\s*\.", pm):
                        score += 10
                    if best is None or score > best[0]:
                        best = (score, (p, y, cols, cand[0].strip()))
        return best[1] if best else None


def _col_split(cols: list[tuple[float, str]]) -> tuple[str, str, str]:
    """从一行各列文字里按 x 区间切出 (meaning, memory)。

    各天表格列 x 起点：
      day1  : 单词 x85  音标 x159  中文 x233  记忆 x357
      day3  : 单词 x91  中文 x173  记忆 x310
      day4-5: 单词 x95  中文 x181  记忆 x324
      day7  : 单词 x97  中文 x171  记忆 x294
    meaning 取「含中文且位于中间偏左」的那一列；memory 取最右列。
    """
    meaning_parts, memory_parts = [], []
    for x, t in cols:
        if CJK.search(t) is None:
            continue
        # 左列（词根列）x < 80 一律不算 meaning
        if x < 80:
            continue
        if x >= 280:
            memory_parts.append(t)
        else:
            meaning_parts.append(t)
    # 兜底：若 meaning 空但 memory 有中文，尝试从 memory 里拆
    return " ".join(meaning_parts).strip(), " ".join(memory_parts).strip()


def resolve_merged_from_pdf(day: int, words: list[str], pdfx: PdfRowIndex):
    """为并档的每个词到 PDF 里取回 meaning / memory。返回 {word: (meaning, memory, page)}。"""
    out = {}
    for w in words:
        got = pdfx.row_cols(day, w)
        if got is None:
            continue
        p, y, cols = got
        m, mem = _col_split(cols)
        if m:
            out[w] = (m, mem, p + 1)
    return out


# --------------------------------------------------------------------------
# 主流程
# --------------------------------------------------------------------------
def clean(data: dict, pdfx: PdfRowIndex | None = None, verbose: bool = True):
    stats = {
        "memory_stripped": [], "memory_emptied": [], "memory_inline_wm": [],
        "word_cjk_split": [], "merged_split": [], "merged_unresolved": [],
        "meaning_backfilled": [], "meaning_still_empty": [],
        "word_cjk_pdf": [], "word_repaired": [],
    }
    for g in data["groups"]:
        day = g["day"]
        new_entries = []
        for e in g["entries"]:
            toks = split_merged_word(e["word"])
            if toks:
                resolved = resolve_merged_from_pdf(day, toks, pdfx) if pdfx else {}
                stats["merged_split"].append({
                    "day": day, "word_before": e["word"], "words_after": toks,
                    "raw_meaning": e["meaning"], "raw_memory": e["memory"],
                    "resolved": {k: list(v) for k, v in resolved.items()},
                })
                miss = [w for w in toks if w not in resolved]
                if miss:
                    stats["merged_unresolved"].append({"day": day, "missing": miss})
                for w in toks:
                    if w in resolved:
                        m, mem, _ = resolved[w]
                    else:
                        # 取不回：保留原始释义挂到第一条，绝不置空
                        m = e["meaning"] if w == toks[0] else e["meaning"]
                        mem = e["memory"] if w == toks[0] else e["memory"]
                    new_entries.append({
                        "word": w, "root": e["root"], "rootMeaning": e["rootMeaning"],
                        "meaning": m, "memory": mem,
                    })
                continue

            w2, m2, changed, _ = split_word_cjk(e["word"], e["meaning"])
            if changed:
                stats["word_cjk_split"].append((day, e["word"], w2, m2))
                e = dict(e, word=w2, meaning=m2)
                # 优先级：word 拆分后，若能定位 PDF 行，则用原文整行还原 meaning/memory
                if pdfx:
                    got = pdfx.row_cols(day, w2)
                    if got:
                        p, y, cols = got
                        pm, pmem = _col_split(cols)
                        if pm:
                            e = dict(e, meaning=pm, memory=pmem or e.get("memory", ""))
                            stats["word_cjk_pdf"].append(
                                (day, w2, pm, pmem, p + 1))

            # IV. meaning 缺失 / 串行 -> 从 PDF 原文回填
            if pdfx:
                need = False
                why = ""
                if not e["meaning"].strip():
                    need, why = True, "empty"
                elif CJK.search(e["meaning"]) and _looks_contaminated(e["meaning"]):
                    need, why = True, "contaminated"
                if need:
                    got = pdfx.row_cols(day, e["word"])
                    if got:
                        p, y, cols = got
                        pm, pmem = _col_split(cols)
                        if pm and pm != e["meaning"]:
                            stats["meaning_backfilled"].append(
                                (day, e["word"], e["meaning"], pm, why, p + 1))
                            new_mem = pmem if pmem else e.get("memory", "")
                            e = dict(e, meaning=pm, memory=new_mem)
                    if not e["meaning"].strip():
                        stats["meaning_still_empty"].append((day, e["word"]))

            before = e.get("memory", "")
            after, ch, note2 = strip_leading_debris(before)
            if ch:
                stats["memory_stripped"].append((day, e["word"], before, after, note2))
                if after == "":
                    stats["memory_emptied"].append((day, e["word"], before))
                e = dict(e, memory=after)

            mid_before = e.get("memory", "")
            mid_after, ch2, note3 = strip_inline_watermark(mid_before)
            if ch2:
                stats["memory_inline_wm"].append((day, e["word"], mid_before, mid_after, note3))
                e = dict(e, memory=mid_after)

            # V. word 非法（单字母 / 明显不是单词）-> 从 PDF 原文定位真实单词
            if _suspect_word(e["word"], e["meaning"]) and pdfx:
                fixed = pdfx.locate_word_by_meaning(day, e["meaning"])
                if fixed:
                    p, y, cols, real_word = fixed
                    pm, pmem = _col_split(cols)
                    old_w = e["word"]
                    e = dict(e, word=real_word,
                             meaning=pm or e["meaning"],
                             memory=pmem or e.get("memory", ""))
                    stats["word_repaired"].append(
                        (day, old_w, real_word, e["meaning"], e["memory"], p + 1))

            new_entries.append(e)

        g["entries"] = new_entries
    return data, stats


def _looks_contaminated(meaning: str) -> bool:
    """判断 meaning 是否混入了记忆列内容（串行）。

    特征：出现「词性标记 之后又出现中文」的分段，或含明显记忆句式。
    例如 '传播，使分布，伸开v.传播n.sp生平+read阅读，生平要多多阅读，传播知识'
      -> 第 2 个词性标记 'n.' 之后还跟着大段中文，且含 '生平+read阅读' 这类记忆写法。
    """
    if not meaning:
        return False
    # 记忆句式特征：xx+yy中文 的拼接、'谐音'、'联想'、'对比：'
    if re.search(r"(谐音|联想|对比|原型|记忆)：", meaning):
        return True
    if re.search(r"[A-Za-z]+\+[A-Za-z]+", meaning):
        return True
    # 词性标记出现 >=2 次，且第二次之后仍有 >=6 个中文字符（说明后面拖着记忆段）
    marks = list(re.finditer(r"(?:adj|adv|vt|vi|n|v)\s*\.", meaning))
    if len(marks) >= 2:
        tail = meaning[marks[-1].end():]
        if len(CJK.findall(tail)) >= 6:
            return True
    # 单词尾缀粘连：'分布广的adj.wide宽的+' —— 词性标记后直接接另一段英文词根拆解
    if marks:
        tail = meaning[marks[-1].end():]
        if re.match(r"^[A-Za-z][A-Za-z\-]*", tail) and re.search(r"[A-Za-z]\+|宽|的", tail):
            return True
    if len(CJK.findall(meaning)) >= 25:
        return True
    return False


def _suspect_word(word: str, meaning: str = "") -> bool:
    """判断 word 是否为非法 / 明显错解析的单词。"""
    w = (word or "").strip()
    if not w:
        return True
    if not re.search(r"[A-Za-z]", w):
        return True
    if re.match(r"^\d", w):
        return True
    # 极短词 + 极长释义 = 典型错解析
    #   例：word='i' 而 meaning='复兴 文艺复兴时期'（原文是 renaissance）
    if len(w) <= 2 and len(CJK.findall(meaning or "")) >= 6:
        return True
    if len(w) == 1 and w.lower() not in ("a", "i"):
        return True
    return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--json", default=str(JSON_PATH))
    args = ap.parse_args()

    path = Path(args.json)
    raw = path.read_text(encoding="utf-8")
    data = json.loads(raw)
    before_tot = sum(len(g["entries"]) for g in data["groups"])

    pdfx = PdfRowIndex(PDF_PATH)
    print(f"PDF 原文索引 : {'已加载 ' + str(PDF_PATH.name) if pdfx.ready else '不可用'}")

    data, stats = clean(data, pdfx)
    after_tot = sum(len(g["entries"]) for g in data["groups"])

    out = json.dumps(data, ensure_ascii=False, indent=2)
    changed = out != raw
    empty_mean = [(g["day"], e["word"]) for g in data["groups"] for e in g["entries"]
                  if not e["meaning"].strip()]

    print("=" * 78)
    print("书2 清洗报告 (clean-book2.py)")
    print("=" * 78)
    print(f"文件           : {path}")
    print(f"模式           : {'DRY-RUN' if args.dry_run else 'WRITE'}")
    print(f"总条数         : {before_tot} -> {after_tot}")
    print(f"memory 首部碎屑: {len(stats['memory_stripped'])} 条 (清空 {len(stats['memory_emptied'])})")
    print(f"memory 中部水印: {len(stats['memory_inline_wm'])} 条")
    print(f"word 含中文拆分: {len(stats['word_cjk_split'])} 条")
    nsplit = sum(len(m["words_after"]) for m in stats["merged_split"])
    print(f"并档词条拆分   : {len(stats['merged_split'])} 条 -> {nsplit} 条"
          f" (未能从PDF取回 {len(stats['merged_unresolved'])} 条)")
    print(f"meaning 回填   : {len(stats['meaning_backfilled'])} 条 (从 PDF 原文取回)")
    print(f"word 非法修复  : {len(stats['word_repaired'])} 条")
    for day, ow, nw, mm, memm, p in stats["word_repaired"]:
        print(f"      D{day} {ow!r} -> {nw!r} (p{p})  meaning={mm!r}  memory={memm!r}")
    print(f"meaning 为空   : {len(empty_mean)}   <<< 必须为 0")
    for x in empty_mean:
        print(f"      !! {x}")
    print(f"序列化变更     : {changed}")

    if stats["meaning_backfilled"]:
        print("\n--- IV. meaning 回填 逐条 ---")
        for day, w, oldm, newm, why, p in stats["meaning_backfilled"]:
            print(f"  D{day:<2} {w:<12} (p{p}, {why})")
            print(f"       OLD={oldm!r}")
            print(f"       NEW={newm!r}")

    print("\n--- I. memory 首部碎屑 逐条 ---")
    for day, w, b, a, note in stats["memory_stripped"]:
        print(f"  D{day:<2} {w:<16} {b!r}")
        print(f"       -> {a!r}   ({note})")
    if stats["memory_inline_wm"]:
        print("\n--- I-b. memory 中部水印 ---")
        for day, w, b, a, note in stats["memory_inline_wm"]:
            print(f"  D{day:<2} {w:<16} {b!r} -> {a!r}  ({note})")

    print("\n--- II. word 含中文拆分 ---")
    for day, wb, wa, m in stats["word_cjk_split"]:
        print(f"  D{day} {wb!r} -> {wa!r}")
    for day, w, mm, memm, p in stats["word_cjk_pdf"]:
        print(f"       (p{p}) meaning={mm!r} memory={memm!r}")

    print("\n--- III. 并档词条（已从 PDF 原文还原）---")
    for m in stats["merged_split"]:
        print(f"  D{m['day']} {m['word_before']!r}")
        for w in m["words_after"]:
            r = m["resolved"].get(w)
            if r:
                print(f"     {w:<14} meaning={r[0]!r}  memory={r[1]!r}  (p{r[2]})")
            else:
                print(f"     {w:<14} <<< 未能从 PDF 取回")

    if empty_mean:
        print("\nABORT: 存在 meaning 为空的记录，拒绝写盘。")
        return 2

    if not args.dry_run and changed:
        path.write_text(out, encoding="utf-8")
        print(f"\n已写回 {path}")

    REPORT_JSON.write_text(json.dumps({
        "file": str(path), "entries_before": before_tot, "entries_after": after_tot,
        "memory_stripped_count": len(stats["memory_stripped"]),
        "memory_emptied_count": len(stats["memory_emptied"]),
        "memory_inline_wm_count": len(stats["memory_inline_wm"]),
        "empty_meaning_count": len(empty_mean),
        "memory_stripped": stats["memory_stripped"],
        "memory_emptied": stats["memory_emptied"],
        "memory_inline_wm": stats["memory_inline_wm"],
        "word_cjk_split": stats["word_cjk_split"],
        "merged_split": stats["merged_split"],
        "merged_unresolved": stats["merged_unresolved"],
        "changed": changed,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"报告 JSON -> {REPORT_JSON}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
