# -*- coding: utf-8 -*-
"""
book1 提取器：《7天刷完考研词汇5500》讲义 → 结构化 JSON

已实测验证的事实：
1. PDF 有文字层，484 页，页面 960x540。每页首/次行是固定页眉「7天刷完考研词汇5500」（右对齐 x≈576），丢弃
2. 词根块以「△」开头，511 行；同一词根块跨页时续页会重复打一遍 △ 行，需按词根去重合并
3. 词条行三种形态：
     act=act=做=v.行动；n.法令         4 段：[单词, 拆分, 拆分释义, 词义]
     action=n.行动                     2 段：[单词, 词义]
     caption=n.标题  capacity=n.容量   同一行多个词条，用「空格+英文=」再切
4. 折行：长词条会被切成两行。首行右端顶到 x≥≈900，续行是同页下一行或下一页顶部行。
   续行判定（实测唯一可靠特征）：
     续行窗口 = 紧跟当前行之后的行，且是「下一页首行」或「同页下一行」；
     只要窗口非空且首行右端 ≥ RIGHT_EDGE 就拼接——PDF 实证：所有 x1≥900 的行都被截断过，
     唯一的假阳性（封面「考研英语5500词汇全贯通」等 4 行）已用「该行无英文单词」排除。
5. 字形：PDF 用 CJK 部首冒充汉字（103 种 1855 处）。
   U+2F00–2FDF（康熙部首）NFKC 可修；U+2E80–2EFF（部首补充）NFKC 不处理，需手工映射表。
"""
import sys
import io
import os
import json
import re
import unicodedata
import collections

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pymupdf  # noqa: E402

ROOT = r'F:\AcademicHub\word-books'
PDF = r'F:\AcademicHub\000资料相关\000考研\考研资料\英语\单词\7天刷完5500讲义（全）.pdf'
OUT_JSON = os.path.join(ROOT, 'src', 'data', 'generated', 'book1.json')
OUT_REPORT = os.path.join(ROOT, 'scripts', 'extract-book1-report.md')
OUT_ABNORMAL = os.path.join(ROOT, 'scripts', '_book1_abnormal_after.json')

HEADER_TEXT = '7天刷完考研词汇5500'
DELTA = '\u25b3'          # △
RIGHT_EDGE = 900          # 首行右端 ≥ 此值 ⇒ 发生过自动折行
LEFT_MARGIN_MAX = 60      # 续行从左边距起排

# ---- U+2E80–U+2EFF（CJK 部首补充）NFKC 无法转换，手工映射 ----
CJK_RADICAL_SUPPLEMENT = {
    '\u2e9f': '母', '\u2ea0': '民', '\u2ec4': '西', '\u2ec5': '见',
    '\u2ec6': '角', '\u2ecb': '车', '\u2ed3': '长', '\u2ed4': '门',
    '\u2ed8': '青', '\u2edb': '风', '\u2edc': '飞', '\u2edd': '食',
    '\u2ee2': '马', '\u2ee3': '骨', '\u2ee6': '鸟', '\u2ee8': '麦',
    '\u2eee': '齿', '\u2ef0': '龙',
}

CJK_RE = re.compile(r'[\u3400-\u9fff]')
POS_WORDS = r'(?:adj|adv|prep\.ad|prep|pron|conj|num|art|int|aux|n|v|a|ad)'
POS_RE = re.compile(r'\b' + POS_WORDS + r'\b\.?')


def normalize_text(s: str) -> str:
    """先手工映射部首补充区，再 NFKC。"""
    s = ''.join(CJK_RADICAL_SUPPLEMENT.get(ch, ch) for ch in s)
    return unicodedata.normalize('NFKC', s)


def radical_chars(s: str) -> list:
    return [ch for ch in s if 0x2E80 <= ord(ch) <= 0x2FDF or 0xF900 <= ord(ch) <= 0xFAFF]


# ---------------- 1) 抽行 ----------------
def extract_rows(doc):
    rows = []
    stats = {'pages': doc.page_count, 'header_dropped': 0, 'empty_lines': 0}
    for pno in range(doc.page_count):
        for b in doc[pno].get_text('dict')['blocks']:
            for l in b.get('lines', []):
                raw = ''.join(s['text'] for s in l['spans'])
                t = normalize_text(raw).strip()
                if not t:
                    stats['empty_lines'] += 1
                    continue
                if t == HEADER_TEXT:
                    stats['header_dropped'] += 1
                    continue
                rows.append({'page': pno, 'y': l['bbox'][1], 'x0': l['bbox'][0],
                             'x1': l['bbox'][2], 'text': t})
    return rows, stats


# ---------------- 2) 折行拼接 ----------------
def has_latin_word(s):
    return bool(re.search(r'[A-Za-z]{2,}', s))


def is_continuation_candidate(prev, nxt):
    """nxt 是否可能是 prev 的折行续行（只看位置，不看内容）"""
    if nxt['x0'] > LEFT_MARGIN_MAX:
        return False
    if nxt['page'] == prev['page']:
        return True
    if nxt['page'] == prev['page'] + 1:
        # 下一页首行（页眉已剔除）
        return True
    return False


def ends_complete(text):
    """
    判断该行内容是否已经「说完了」——用来避免把完整词条误判成折行首行。

    ★ 血泪教训（2026-11-03）：原逻辑只看 x1 >= 900 就认定是折行，去吃下一行。
      但 p46 的 `block=来自balk=大块,障碍=n.块;街区;障碍物 v.阻塞;阻止` 本身就完整，
      只是因为文字较长、右端顶到 937 就被判成折行，
      结果把下一行的完整词条 `boundary=...` 整条吞掉，其后的释义全部错位一条，
      造成 13 条串行错误（clone 显示「决定性的」、household 显示「幽默」）。

    判据（满足任一即视为「说完了」，不该再吃下一行）：
      1. 结尾是中文（汉字），说明释义已写完
      2. 结尾是中文标点或句点
      3. 结尾是完整词性缩写（n. / v. / a. / adj. 等）
    """
    t = text.rstrip()
    if not t:
        return True
    # 结尾是汉字
    if CJK_RE.search(t[-1]):
        return True
    # 结尾是标点
    if t[-1] in '。；;，,、.！!？?）)':
        return True
    # 结尾是完整词性缩写
    if re.search(r'(?:' + POS_WORDS + r')\.$', t):
        return True
    return False


def join_rows(rows):
    logical, joins = [], []
    i, n = 0, len(rows)
    while i < n:
        r = rows[i]
        text = r['text']
        first = r
        j = i + 1
        # 续行只在：首行右端顶边 且 首行确实被截断（含英文、不以 △ 开头、**结尾不是完整内容**）时才吃。
        # 最后一条 ends_complete 是关键修正，见其 docstring。
        while (j < n
               and rows[j - 1]['x1'] >= RIGHT_EDGE
               and has_latin_word(rows[j - 1]['text'])
               and not ends_complete(rows[j - 1]['text'])
               and not rows[j]['text'].startswith(DELTA)
               and is_continuation_candidate(rows[j - 1], rows[j])):
            nx = rows[j]
            joins.append({'page': rows[j - 1]['page'], 'head': text[:50],
                          'fragment': nx['text'], 'frag_page': nx['page']})
            text += nx['text']
            j += 1
            # 续行本身若也顶到右边缘，继续吃（连锁）
        logical.append({'page': first['page'], 'text': text})
        i = j
    return logical, joins


# ---------------- 3) 字段解析 ----------------
def is_chinese_tail(s):
    """不含英文且含中文 → 不是新词条起点"""
    return bool(CJK_RE.search(s)) and not re.search(r'[A-Za-z]', s)


MULTI_ENTRY_RE = re.compile(r' {2,}([A-Za-z][A-Za-z\-]*=)')
# 词条内部的“空格 + 词性缩写”，会被误判成词条分隔：'... actually=a.实际上' 中的 ' actually='
POS_AFTER_SPACE_RE = re.compile(r'( {2,})([A-Za-z][A-Za-z\-]*=)([A-Za-z]*\.)')
# 形如 ' n. 互动' 的释义也含空格：'...=n.互动 interactive=a.互动的'


def split_entry_chunks(text):
    """把一行切成多个词条。

    实测规律：
      - 词条之间的分隔多数用 **连续 2 个以上空格**，但**也会只用 1 个空格**：
            'caption=n.标题  capacity=n.容量 captious=a.吹毛求疵的'   ← 前一个 2 空格、后一个 1 空格
            'embarrassed=a.尴尬的 embarrassment=n.尴尬'
      - 词条内部（释义里夹小写英文同义词）也用 **单个空格**：
            'actual=a.实际的 actually=ad.实际上'

    所以不能只看空格数量，必须看**语义形态**：
      切点右侧必须是「英文词 + = + 词性缩写」，即一个合法词条的起头。
    而且补切必须**对每一段递归做**，否则像上面那行，
    第一刀切完后剩下的 'capacity=... captious=...' 里的单空格切点就漏了。

    ★ 这就是 `capacity` 拿到 `captious` 释义、`captious` 整条消失的根因。
    """
    POS_SET = {'adj', 'adv', 'prep', 'pron', 'conj', 'num', 'art', 'int', 'aux',
               'n', 'v', 'a', 'ad'}
    # 合法词条起头：词 + = + 词性缩写
    ENTRY_HEAD_RE = re.compile(r'(?<![A-Za-z])([A-Za-z][A-Za-z\-()]*)=((?:' + POS_WORDS + r')\.)')

    def single_pass(seg, allow_single_space):
        cuts = []
        # ① 2+ 空格切分
        for m in MULTI_ENTRY_RE.finditer(seg):
            cut = m.start() + len(re.match(r' +', m.group(0)).group(0))
            left_seg = seg[:m.start()]
            left = re.search(r'([A-Za-z][A-Za-z\-]*)$', left_seg)
            left_word = left.group(1) if left else ''
            cand = m.group(1)[:-1].rstrip('=')
            if left_word and left_word.lower() == cand.lower():
                continue
            cuts.append(cut)
        # ② 单空格补切（仅当允许时）
        if allow_single_space:
            for m in ENTRY_HEAD_RE.finditer(seg):
                cut = m.start()
                if cut == 0 or any(abs(cut - c) <= 1 for c in cuts):
                    continue
                left_seg = seg[:cut]
                # 必须紧邻空白，否则属于词内部。
                # 注意用 isspace 而不是只判 ' '：PDF 里可能混入全角空格 U+3000 或不换行空格。
                if not left_seg or not left_seg[-1].isspace():
                    continue
                # ★ 核心判据（这里踩了两次坑，写清楚）：
                #   切点左侧若以**中文**结尾（末字是汉字），说明上一个词条的释义已经写完，
                #   右边必然是新词条起点，直接切。
                #   只有左侧以**英文**结尾时，才需要判断那个英文是不是词性缩写/同义词。
                #   之前的写法是在 'capacity=n.容量 ' 里用 [A-Za-z]+ 抓左侧英文，
                #   抓到的是释义里的词性标记 'n'，于是被 POS_SET 误判成"这不是新词条"，
                #   captious 永远切不出来 —— capacity 拿到 captious 释义的根因就在这。
                stripped = left_seg.rstrip()
                if stripped and CJK_RE.search(stripped[-1]):
                    cuts.append(cut)      # 左侧以汉字收尾 -> 新词条起点
                    continue
                left = re.search(r'([A-Za-z][A-Za-z\-]*)[^A-Za-z]*$', stripped)
                if not left:
                    cuts.append(cut)      # 左侧没有裸英文 -> 也是新词条起点
                    continue
                word = left.group(1).lower()
                if word in POS_SET:
                    continue      # 左侧以词性缩写收尾，说明在释义中间，不切
                if word == m.group(1).lower():
                    continue      # 自指
                cuts.append(cut)
        cuts = sorted(set(cuts))
        if not cuts:
            return [seg]
        out, last = [], 0
        for c in cuts:
            out.append(seg[last:c])
            last = c
        out.append(seg[last:])
        return [x.strip() for x in out if x.strip()]

    # 第一遍：2+ 空格切；第二遍：对每段再做单空格补切
    pass1 = single_pass(text, allow_single_space=False)
    final = []
    for seg in pass1:
        final.extend(single_pass(seg, allow_single_space=True))
    return final


def strip_english_synonyms(s):
    """移除释义里夹带的英文近义词，保留词性缩写与中文。"""
    marks = []

    def protect(m):
        marks.append(m.group(0))
        return '\x00%d\x00' % (len(marks) - 1)

    s2 = POS_RE.sub(protect, s)
    s2 = re.sub(r'[A-Za-z]+', '', s2)
    s2 = re.sub(r'\x00(\d+)\x00', lambda m: marks[int(m.group(1))], s2)
    s2 = re.sub(r'\s+', ' ', s2).strip(' ;；,，')
    s2 = re.sub(r'\s+', ' ', s2).strip()
    return s2


def parse_chunk(chunk):
    """chunk 形如 单词(=拆分(=释义))*=词义  → entry"""
    chunk = chunk.strip()
    problems = []

    # ★ 括号保护（2026-11-03）：括号内的 = 不是分段符，是原文写法。
    #   例如 'kilo=kilo=千=n.千克(=kilogram' 里，'(=kilogram' 属于释义的一部分，
    #   若直接按 = 切分，kilogram 会被当成拆解片段，释义只剩 'n.千克(' 后被清空。
    #   先用占位符把括号段整体藏起来，解析完再还原。
    protected = []
    def _protect(mo):
        protected.append(mo.group(0))
        return '\x01%d\x01' % (len(protected) - 1)

    # 先处理成对括号，再处理「只有左括号、没有右括号」的未闭合情况（原文排版缺陷）。
    # 不处理未闭合的情况，'n.千克(=kilogram' 里的 = 仍会被当分段符，
    # 结果 kilogram 被剥成拆解片段，释义变成空的。
    chunk_p = re.sub(r'\([^()]*\)', _protect, chunk)
    chunk_p = re.sub(r'\([^()]*$', _protect, chunk_p)

    parts = chunk_p.split('=')
    head_p = parts[0].strip()

    # 词干里的括号是被保护过的占位符，必须还原后再校验，
    # 否则 afterward(s) 会变成 'afterward\x010\x01' 而通不过词干正则。
    def _restore_early(s):
        return re.sub(r'\x01(\d+)\x01', lambda mo: protected[int(mo.group(1))], s)

    head = _restore_early(head_p).strip()
    # 词干允许带括号变体：afterward(s)、favo(u)r、judg(e)ment
    if not re.fullmatch(r"[A-Za-z][A-Za-z\-'’ ()]*", head):
        problems.append({'type': 'bad_word_head', 'chunk': chunk, 'head': head})
        return None, problems
    if len(head.split()) > 1:
        problems.append({'type': 'multiword_head', 'chunk': chunk, 'head': head})
    segs = [{'text': head, 'role': 'root'}]

    if len(parts) == 1:
        meaning_raw = ''
    elif len(parts) == 2:
        meaning_raw = parts[1]
    else:
        for k in range(1, len(parts) - 1):
            piece = parts[k]
            segs.append({'text': '=', 'role': 'link'})
            for sub in re.split(r'(\+)', piece):
                if not sub:
                    continue
                if sub == '+':
                    segs.append({'text': '+', 'role': 'link'})
                elif CJK_RE.search(sub):
                    # 中文是「拆解释义」，例如 act=act=做 里的「做」
                    segs.append({'text': sub, 'role': 'meaning'})
                else:
                    # ★ 非中文片段的角色判定（2026-11-03 修正）：
                    #   原逻辑一律标 affix，导致词根复现（act=act=做 的第二个 act）
                    #   和普通词素被当成词缀，语言学上错误，前端配色也会误导学习。
                    #   规则：
                    #     纯英文且与本词根拼写一致（忽略括号）  -> root（词根复现）
                    #     纯英文片段                            -> latin（其它词素）
                    #     形如 -xx / xx- / 常见前后缀           -> affix
                    cand = sub.strip()
                    root_norm = re.sub(r'[()\s]', '', head).lower()
                    cand_norm = re.sub(r'[()\s]', '', cand).lower()
                    if cand_norm and cand_norm == root_norm:
                        segs.append({'text': sub, 'role': 'root'})
                    elif re.fullmatch(r'[A-Za-z]+', cand):
                        segs.append({'text': sub, 'role': 'latin'})
                    else:
                        segs.append({'text': sub, 'role': 'affix'})
        meaning_raw = parts[-1]

    meaning = strip_english_synonyms(meaning_raw) if meaning_raw else ''

    # 还原括号占位符（保护阶段用 \x01N\x01 藏起来的原文片段）
    def _restore(s):
        if not s:
            return s
        return re.sub(r'\x01(\d+)\x01', lambda mo: protected[int(mo.group(1))], s)

    segs = [{'text': _restore(s['text']), 'role': s['role']} for s in segs]
    meaning = _restore(meaning)

    # 原书括号未闭合导致的截断释义：'n.千克(=kilogram' 缺右括号和句点。
    # 补上闭合括号与句点，让释义可读（属原文排版缺陷，不是提取错误）。
    if meaning and meaning.count('(') > meaning.count(')'):
        meaning = meaning + ')'
        if not meaning.rstrip().endswith(('.', '。', ';', '；')):
            meaning = meaning.rstrip() + '.'

    return {'word': _restore(head), 'segments': segs, 'meaning': meaning}, problems


def parse_line(text):
    entries, problems = [], []
    for ch in split_entry_chunks(text):
        e, p = parse_chunk(ch)
        problems.extend(p)
        if e:
            entries.append(e)
    return entries, problems


# ---------------- 4) 主流程 ----------------
def main():
    doc = pymupdf.open(PDF)
    rows, rowstats = extract_rows(doc)
    logical, joins = join_rows(rows)
    print('[1] 原始行 %d  页眉丢弃 %d  折行拼接 %d' % (len(rows), rowstats['header_dropped'], len(joins)))

    root_groups, root_index = [], {}
    problems, unparsed = [], []
    current = None
    delta_count = 0

    for lg in logical:
        t = lg['text']
        if t.startswith(DELTA):
            delta_count += 1
            body = t[1:].strip()
            root_part, _, meaning_part = body.partition('=')
            root, rm = root_part.strip(), meaning_part.strip()
            if root in root_index:
                current = root_index[root]
                if rm and rm != current['meaning']:
                    problems.append({'type': 'root_meaning_conflict', 'page': lg['page'],
                                     'root': root, 'kept': current['meaning'], 'ignored': rm})
                continue
            grp = {'root': root,
                   'meaning': rm if root != '单列' else '单列词（无共同词根）',
                   'entries': []}
            root_groups.append(grp)
            root_index[root] = grp
            current = grp
            continue

        # 封面等无词根块内容
        if current is None:
            if re.search(r'[A-Za-z]{2,}=', t):
                unparsed.append({'page': lg['page'], 'text': t, 'reason': 'no_root_block_yet'})
            continue

        ents, probs = parse_line(t)
        for p in probs:
            p['page'] = lg['page']
            problems.append(p)
        ents, probs = parse_line(t)
        for p in probs:
            p['page'] = lg['page']
            problems.append(p)

        if not ents:
            # ★ 关键修复（2026-11-03）：这里原来直接 continue 丢弃整行，
            #   而原书里有一类「不含 = 的续行/说明行」——它们是上一个词条释义的续写，
            #   例如 `block=...=n.块;街区;障碍物 v.阻塞;阻止` 下一行接着 `boundary=...`，
            #   中间若有一行纯中文续写被丢弃，它后面所有词条的释义就会整体错位一条。
            #   实测因此产生 13 条串行错误（clone 显示"决定性的"、household 显示"幽默"）。
            #
            #   正确做法：不是丢弃，而是判断这行到底属于谁：
            #     a) 纯中文/词性开头的续写 -> 追加到当前块「上一个词条」的 meaning 尾部
            #     b) 当前块还没有词条 -> 并进块标题的 meaning
            #     c) 以 = 开头的折行残片 -> 同样续到上一个词条
            #     d) 其它（如字母页签 C/Y、无法归类）-> 才真正丢弃
            cont = t.strip()
            appended = False
            if cont and current['entries']:
                # 判定：像释义续写 —— 以中文/词性缩写/标点开头，且不含「英文=」
                looks_like_continuation = (
                    bool(CJK_RE.match(cont))
                    or bool(re.match(r'^(?:' + POS_WORDS + r')\b', cont))
                    or cont.startswith('=')
                ) and not re.search(r'[A-Za-z]{2,}=', cont)

                if looks_like_continuation:
                    prev = current['entries'][-1]
                    piece = cont.lstrip('= ').strip()
                    if piece:
                        prev['meaning'] = (prev['meaning'] + ' ' + piece).strip()
                        # 释义里混进的英文近义词要去掉（与原解析规则保持一致）
                        prev['meaning'] = strip_english_synonyms(prev['meaning'])
                        appended = True
                        problems.append({'type': 'continuation_merged', 'page': lg['page'],
                                         'word': prev['word'], 'merged': piece})

            if not appended:
                if not current['entries'] and CJK_RE.search(cont) and not re.search(r'[A-Za-z]{2,}=', cont):
                    # 块标题的中文续行
                    current['meaning'] = (current['meaning'] + ' ' + cont).strip()
                    problems.append({'type': 'root_meaning_continuation', 'page': lg['page'],
                                     'root': current['root'], 'merged': cont})
                else:
                    unparsed.append({'page': lg['page'], 'text': t, 'reason': 'no_entry_parsed'})
            continue

        for e in ents:
            current['entries'].append(e)

    # ---- 词条级后处理：修伪词条、补漏词 ----
    all_entries_flat = [e for g in root_groups for e in g['entries']]

    # P1-5：字母页签伪词条（原文只有单个大写字母 C / Y，是页面分隔标记，不是单词）
    for g in root_groups:
        keep = []
        for e in g['entries']:
            w = e['word'].strip()
            if len(w) == 1 and w.isalpha() and w.isupper() and not e['meaning'].strip():
                problems.append({'type': 'dropped_letter_tab', 'root': g['root'],
                                 'word': w, 'reason': '单字母页签，非单词'})
                continue
            keep.append(e)
        g['entries'] = keep

    # ---- 统计 ----
    all_entries = [(g['root'], e) for g in root_groups for e in g['entries']]
    total_entries = len(all_entries)
    total_roots = len(root_groups)
    empty_meaning = [(r, e['word']) for r, e in all_entries if not e['meaning'].strip()]
    wc = collections.Counter(e['word'].lower() for r, e in all_entries)
    dup_words = {w: c for w, c in wc.items() if c > 1}
    empty_groups = [g['root'] for g in root_groups if not g['entries']]
    no_seg_group = [r for r, e in all_entries if len(e['segments']) <= 1]

    payload = {'book': 'book1', 'title': '7天刷完5500',
               'meta': {'source': os.path.basename(PDF), 'pages': doc.page_count,
                        'rootGroups': total_roots, 'entries': total_entries},
               'rootGroups': root_groups}
    blob = json.dumps(payload, ensure_ascii=False)
    residual = collections.Counter(radical_chars(blob))
    residual_items = [{'char': c, 'code': hex(ord(c)), 'count': n} for c, n in residual.most_common()]
    residual_total = sum(residual.values())

    # 结构合法性自检。
    # 合法角色必须与 src/types.ts 的 SegmentRole 保持一致：
    # root / affix / meaning / latin / cjk / link
    roles_ok = {'root', 'affix', 'meaning', 'latin', 'cjk', 'link'}
    bad_roles = [e['word'] for r, e in all_entries
                 if any(s['role'] not in roles_ok for s in e['segments'])]
    mangled = [u for u in unparsed if u['text'].startswith('=') or u['text'][:1] in '+' or
               re.match(r'^[a-z]{1,3}\+', u['text'])]

    print('[2] 词根块 %d  词条 %d  △行 %d' % (total_roots, total_entries, delta_count))
    print('[3] 空释义 %d  重复词 %d  未解析行 %d  非法role %d' %
          (len(empty_meaning), len(dup_words), len(unparsed), len(bad_roles)))
    print('[4] 部首区残留 %d 种 %d 处' % (len(residual), residual_total))

    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with open(OUT_JSON, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)

    L = []
    A = L.append
    A('# book1 提取报告：7天刷完考研词汇5500 讲义')
    A('')
    A('- 源文件：`%s`' % PDF)
    A('- 页数：%d' % doc.page_count)
    A('- 输出：`%s`' % OUT_JSON)
    A('- 生成脚本：`F:\\AcademicHub\\word-books\\scripts\\extract-book1.py`')
    A('')
    A('## 1. 自检总览')
    A('')
    A('| 指标 | 数值 |')
    A('| --- | --- |')
    A('| 词根块总数 | **%d** |' % total_roots)
    A('| 词条总数 | **%d** |' % total_entries)
    A('| 空释义条数 | %d |' % len(empty_meaning))
    A('| 重复词条数（小写词去重后仍重复的词） | %d |' % len(dup_words))
    A('| 字形异常残留字符 | **%d** |' % residual_total)
    A('| 无法解析的行 | %d |' % len(unparsed))
    A('| 原始行（去页眉/空行） | %d |' % len(rows))
    A('| 丢弃页眉行 | %d |' % rowstats['header_dropped'])
    A('| △ 行总数 / 去重后词根块 | %d / %d |' % (delta_count, total_roots))
    A('| 折行拼接处数 | %d |' % len(joins))
    A('| segments role 非法条数 | %d |' % len(bad_roles))
    A('| 空词根块 | %d |' % len(empty_groups))
    A('')
    A('## 2. 字形规范化（重点）')
    A('')
    A('PDF 用 CJK 部首充当汉字，共 103 种 1855 处：')
    A('')
    A('- **U+2F00–U+2FDF（康熙部首）**：86 种 1695 处，`unicodedata.normalize("NFKC", s)` 可完全修复')
    A('- **U+2E80–U+2EFF（CJK 部首补充）**：17 种 160 处，**NFKC 不转换，必须手工映射**，见下表')
    A('')
    A('处理顺序：手工映射部首补充区 → NFKC → 输出后整份 JSON 再扫一遍 2E80–2FDF / F900–FAFF。')
    A('')
    A('**最终残留：%d 处（要求为 0）**' % residual_total)
    A('')
    A('| 原字符 | 码位 | 规范字 |')
    A('| --- | --- | --- |')
    for k, v in CJK_RADICAL_SUPPLEMENT.items():
        A('| %s | `%s` | %s |' % (k, hex(ord(k)), v))
    A('')
    A('## 3. 折行拼接明细（%d 处）' % len(joins))
    A('')
    A('长词条被自动折行：首行右端 ≥ x=900，续行从左边距另起（同页下一行，或下一页顶部）。')
    A('不拼接会产生「传」「星人」「乐专辑」这类碎片行，必须合并。')
    A('')
    A('| 页码 | 首行片段 | 续行 |')
    A('| --- | --- | --- |')
    for j in joins:
        A('| p%d | `%s` | `%s` |' % (j['page'], j['head'].replace('|', '／'), j['fragment'].replace('|', '／')))
    A('')
    A('## 4. 无法解析的行（%d）' % len(unparsed))
    A('')
    if unparsed:
        A('| 页码 | 原文 | 原因 |')
        A('| --- | --- | --- |')
        for u in unparsed:
            A('| %d | `%s` | %s |' % (u['page'], u['text'].replace('|', '／'), u['reason']))
    else:
        A('无。')
    A('')
    A('## 5. 解析告警（%d）' % len(problems))
    A('')
    if problems:
        A('| 页码 | 类型 | 内容 |')
        A('| --- | --- | --- |')
        for p in problems:
            A('| %s | %s | `%s` |' % (p.get('page', '-'), p.get('type', '-'),
                                      json.dumps(p, ensure_ascii=False).replace('|', '／')))
    else:
        A('无。')
    A('')
    A('## 6. 空释义词条（%d）' % len(empty_meaning))
    A('')
    for r, w in empty_meaning:
        A('- [%s] %s' % (r, w))
    if not empty_meaning:
        A('无。')
    A('')
    A('## 7. 重复词条（%d）' % len(dup_words))
    A('')
    A('说明：同一单词在不同词根块下重复出现是本书固有结构（如 bio / graph 两组都收 biography），保留。')
    A('')
    for w, c in sorted(dup_words.items(), key=lambda x: (-x[1], x[0])):
        roots = sorted({r for r, e in all_entries if e['word'].lower() == w})
        A('- `%s` × %d（词根块：%s）' % (w, c, '、'.join(roots)))
    if not dup_words:
        A('无。')
    A('')
    A('## 8. 空词根块')
    A('')
    A('、'.join('`%s`' % g for g in empty_groups) if empty_groups else '无。')
    A('')
    A('## 9. 词根块前 60 个')
    A('')
    for g in root_groups[:60]:
        A('- `%s` = %s（%d 词）' % (g['root'], g['meaning'], len(g['entries'])))
    A('')
    A('## 10. 单列区（无共同词根的杂词）')
    A('')
    A('PDF 中 `△单列` 标记的区块不是词根，收的是无法归类的散词，单独成一个 rootGroup（root=`单列`）。')
    A('若前端不需要，可按下述清单单独处理：')
    A('')
    if '单列' in root_index:
        A('- 词条数：%d' % len(root_index['单列']['entries']))
    A('')

    with open(OUT_REPORT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(L))
    with open(OUT_ABNORMAL, 'w', encoding='utf-8', newline='\n') as f:
        json.dump({'residualCount': residual_total, 'items': residual_items}, f,
                  ensure_ascii=False, indent=1)

    print('[5] 写出 %s' % OUT_JSON)
    print('[6] 写出 %s' % OUT_REPORT)
    return 0 if residual_total == 0 else 2


if __name__ == '__main__':
    sys.exit(main())
