"""
书2（核心单词速记）提取器 v9 —— 最终版，用 PyMuPDF 原生 find_tables。

前面 8 个版本全部失败的教训（记录在此，不再重复踩）：
  v1-v4  词根「遇空继承上一行」  -> 合并单元格跨组污染下一组，词根被 "/" 切碎
  v5     把「竖线条数」当列数    -> 整体错位
  v6     天数标记不继承          -> 丢 47 页
  v7     词根 y 区间跨整页        -> 一页多表时并成一条长线，root 全空
  v8     按表头行切块            -> 续页无表头，18 页被判「无表头」而丢弃

  ★ 真正的正解：PyMuPDF 的 page.find_tables() 已经能正确识别这份 PDF 的表格，
    53/55 页直接识别成功，列结构和合并单元格（空格表示同属上一格）都是对的。
    手写解析是在重新造轮子，而且必然漏掉边界情况。

本版策略：
  1. find_tables() 取表格，按表头识别每列语义（词根/单词/音标/中文/记忆）
  2. 词根列按「向下填充」还原合并单元格 —— 这次是安全的，
     因为 find_tables 已经把合并单元格展开成「首行有值、续行空」的标准形式，
     而且表格边界由 bbox 限定，不会跨到下一张表
  3. 剔除页脚水印「Shen的背书魔法」，以及渗进单元格的零散字（魔/法/背/书）
  4. p45、p55 是表格跨页续页（无表格线），用纯文字流兜底解析
  5. Day3-7 是 4 列无音标，Day8-10 是 3 列无词根，均按表头自适应
"""

import json
import os
import re
import sys
from collections import Counter

import pymupdf

PDF = r"F:\AcademicHub\000资料相关\000考研\考研资料\英语\单词\核心单词速记_第1-10天_合集（打印版）.pdf"
OUT = r"F:\AcademicHub\word-books\src\data\generated\book2.json"

CJK = re.compile(r"[\u4e00-\u9fff]")
LATIN_START = re.compile(r"^[A-Za-z]")
PHONETIC_ONLY = re.compile(r"^[/\sˈˌəɪʊɛɔæɑʌθðʃʒŋːə.\-]+$")
DAY_RE = re.compile(r"第\s*([一二三四五六七八九十]|\d{1,2})\s*天")
CN_NUM = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}
CN_INV = {v: k for k, v in CN_NUM.items()}

# 页脚水印，出现在每一页
WATERMARK = "Shen的背书魔法"


def clean_cell(s):
    """
    清洗单元格文字：去水印、去换行、压空白。

    ★ 血泪教训：绝对不能把 WATERMARK 拆成字符集合去做 ^[..] 清理。
      水印里含有 S/h/e/n/书/法 等字符，按单字清理会把 extend 变成 xtend、
      extensive 变成 xtensive、essential 变成 ssential —— 成千上万个单词首字母被吃掉。
      只删完整的水印词组，绝不按单字删。
    """
    if not s:
        return ""
    s = s.replace("\n", " ")
    s = s.replace(WATERMARK, "")
    # 水印被换行拆开时（如「Shen的背书\n魔法」），再按词组整体删一次
    for frag in ("Shen的背书", "的背书魔法", "背书魔法"):
        s = s.replace(frag, "")
    s = re.sub(r"\s{2,}", " ", s)
    return s.strip()


def header_semantics(cells):
    """
    根据表头单元格判断每一列的语义。返回 [语义 or None]。

    ★ 判断顺序至关重要：必须先判「记忆」，再判「词根」。
      因为「词根记忆」这个表头同时含有「词根」，若先判词根，
      记忆列会被误认成词根列，导致真正的词根列被忽略、root 全空。
      这个顺序 bug 曾让 10 天 1504 条记录里 root 几乎全为空。
    """
    sem = []
    for c in cells:
        t = (c or "").replace("\n", "").strip()
        t = t.replace(WATERMARK, "")
        if "记忆" in t:
            sem.append("memory")
        elif "词根" in t or "原型" in t:
            sem.append("root")
        elif "单词" in t:
            sem.append("word")
        elif "音标" in t:
            sem.append("phonetic")
        elif "中文" in t:
            sem.append("meaning")
        else:
            sem.append(None)
    return sem


def looks_like_header(cells):
    joined = "".join(clean_cell(c or "") for c in cells)
    return ("单词" in joined) and ("中文" in joined)


def split_root(raw):
    """
    合并单元格文字 -> (root, rootMeaning, memory)

    处理两种形态：
      「tend/tent\n/tens\n伸展，趋向\n记忆：疼的」  -> 换行分隔
      「law法律」「gene基因」                        -> 词根与释义黏在一起，无换行
    后者必须按「首个中文字符」切开，否则整个词根会被判进释义，root 变空。
    """
    if not raw.strip():
        return "", "", ""
    lines = [l.strip() for l in raw.split("\n") if l.strip()]
    root_parts, meaning_parts, memory_parts = [], [], []
    stage = "root"
    for l in lines:
        if re.match(r"^(记忆|对比|联想|谐音|记|注|原型)\s*[:：]", l):
            stage = "memory"
        elif CJK.search(l) and stage == "root":
            # 同一行里可能「英文词根 + 中文释义」黏着，先切开
            m = CJK.search(l)
            head, tail = l[: m.start()].strip(), l[m.start():].strip()
            if head:
                root_parts.append(head)
            if tail:
                meaning_parts.append(tail)
            stage = "meaning"
            continue
        if stage == "root":
            root_parts.append(l)
        elif stage == "meaning":
            meaning_parts.append(l)
        else:
            memory_parts.append(l)
    root = ""
    if root_parts:
        m = "".join(root_parts)
        # 词根名内部不该有空格：「tend/tent /tens」要还原成「tend/tent/tens」。
        # 但空格也可能是词根之间的正常分隔（「cap(t) cep(t)」），
        # 所以只在「去掉空格后斜杠连接更合理」时才压掉：即整串以字母/括号/斜杠为主且含斜杠。
        if "/" in m:
            m = re.sub(r"\s*/\s*", "/", m)
            m = re.sub(r"(?<=[A-Za-z()])\s+(?=[A-Za-z(])", "/", m)
        m = re.sub(r"^/+", "", m)
        m = re.sub(r"/{2,}", "/", m)
        m = re.sub(r"/+$", "", m)
        root = m.strip()
    meaning = " ".join(meaning_parts).strip()
    memory = " ".join(memory_parts).strip()
    memory = re.sub(r"^(记忆|对比|联想|谐音|记|注|原型)\s*[:：]\s*", "", memory)
    return root, meaning, memory


def detect_day(page):
    m = DAY_RE.search(page.get_text())
    if not m:
        return None
    s = m.group(1)
    return CN_NUM.get(s) or int(s)


def parse_with_tables(page):
    """
    用 find_tables 解析。返回 [(word, root, rootMeaning, meaning, memory)]。
    """
    out = []
    tabs = page.find_tables()
    for t in tabs.tables:
        data = t.extract()
        if not data:
            continue
        # 找表头行（可能不是第一行，前面可能有跨页残留）
        hdr_idx = None
        for i, row in enumerate(data):
            if looks_like_header(row):
                hdr_idx = i
                break
        if hdr_idx is None:
            # 没表头时按列数猜：4 列=词根|单词|中文|记忆，3 列=单词|中文|记忆
            if len(data[0]) >= 5:
                sem = ["root", "word", "phonetic", "meaning", "memory"]
            elif len(data[0]) == 4:
                sem = ["root", "word", "meaning", "memory"]
            elif len(data[0]) == 3:
                sem = ["word", "meaning", "memory"]
            else:
                continue
            body = data
        else:
            sem = header_semantics(data[hdr_idx])
            body = data[hdr_idx + 1:]

        if "word" not in sem:
            continue
        wi = sem.index("word")
        ri = sem.index("root") if "root" in sem else None
        mi = sem.index("meaning") if "meaning" in sem else None
        memi = sem.index("memory") if "memory" in sem else None

        cur_root = ""
        cur_root_mean = ""
        for row in body:
            if not row:
                continue
            def g(i):
                return clean_cell(row[i]) if (i is not None and i < len(row)) else ""

            word = g(wi).strip()
            if not word:
                continue
            # 单词列偶尔混入音标或一句话，过滤掉
            if not LATIN_START.match(word):
                continue
            if PHONETIC_ONLY.match(word):
                continue

            if ri is not None:
                raw_root_cell = row[ri] if ri < len(row) else ""
                cleaned = clean_cell(raw_root_cell)
                if cleaned and cleaned.lower() != "词根/原型":
                    # 首行有值 -> 新词根
                    r, rm, _ = split_root(cleaned)
                    cur_root, cur_root_mean = r, rm
                # 续行为空 -> 沿用 cur_root（合并单元格的语义）

            meaning = g(mi).strip()
            memory = g(memi).strip()
            out.append({
                "word": word,
                "root": cur_root,
                "rootMeaning": cur_root_mean,
                "meaning": meaning,
                "memory": memory,
            })
    return out


def parse_text_fallback(page):
    """
    p45 / p55 这类跨页续页没有表格线，按「单词 中文 联想记忆」的固定 x 分栏解析。
    """
    ws = page.get_text("words")
    # 剥掉水印
    ws = [w for w in ws if WATERMARK not in w[4] and w[4].strip() not in ("Shen的背书魔法", "Shen的背书", "的背书魔法")]
    if not ws:
        return []
    # 按 y 聚行
    rows = []
    for w in sorted(ws, key=lambda t: (t[1], t[0])):
        for r in rows:
            if abs(r["y"] - w[1]) <= 4:
                r["items"].append(w)
                break
        else:
            rows.append({"y": w[1], "items": [w]})
    for r in rows:
        r["items"].sort(key=lambda t: t[0])

    # 用 x 分布定中文列/记忆列边界：取所有词块 x 的三分位
    xs = sorted(w[0] for w in ws)
    if len(xs) < 9:
        return []
    x1 = xs[len(xs) // 3]
    x2 = xs[2 * len(xs) // 3]

    out = []
    for r in rows:
        word_parts = [w[4] for w in r["items"] if w[0] < x1 + 10]
        mean_parts = [w[4] for w in r["items"] if x1 + 10 <= w[0] < x2 + 10]
        mem_parts = [w[4] for w in r["items"] if w[0] >= x2 + 10]
        word = "".join(word_parts).strip()
        if not word or not LATIN_START.match(word) or PHONETIC_ONLY.match(word):
            continue
        out.append({
            "word": word,
            "root": "",
            "rootMeaning": "",
            "meaning": "".join(mean_parts).strip(),
            "memory": " ".join(mem_parts).strip(),
        })
    return out


def main():
    doc = pymupdf.open(PDF)
    days = {}
    current_day = None
    stats = Counter()

    for pno in range(doc.page_count):
        page = doc[pno]
        found = detect_day(page)
        if found is not None:
            current_day = found
        if current_day is None:
            continue

        entries = parse_with_tables(page)
        if entries:
            stats["tables"] += 1
        else:
            entries = parse_text_fallback(page)
            if entries:
                stats["fallback"] += 1

        days.setdefault(current_day, []).extend(entries)

    doc.close()

    groups = []
    for day in sorted(days):
        seen, uniq = set(), []
        for e in days[day]:
            k = e["word"].lower()
            if k in seen:
                continue
            seen.add(k)
            uniq.append(e)
        groups.append({"day": day, "title": f"第{CN_INV.get(day, day)}天", "entries": uniq})

    data = {"book": "book2", "groups": groups}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)

    total = sum(len(g["entries"]) for g in groups)
    print(f"表格页={stats['tables']} 兜底页={stats['fallback']}")
    print(f"天分组={len(groups)} 总词条={total}")
    for g in groups:
        er = sum(1 for e in g["entries"] if not e["root"])
        print(f"  第{g['day']}天: {len(g['entries'])} 条, root空 {er}")


if __name__ == "__main__":
    main()
