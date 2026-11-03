"""
修复三份复核报告里确认的数据层问题（只改有明确依据的错，不动释义内容）。

来源：
  - 书1 复核（p1-240）：伪词条 op opt、Y 字母残留、中文片段误标 latin、散词组 root 口径
  - 书1 复核（p241-484）：同上 + sting 组内外 root 不一致
  - 前端验收：书2 rootMeaning 混入记忆方法 395 条

每一条都有 PDF 页码依据，不做任何"猜测性"修改。

用法：
  python scripts/fix-from-review.py --check
  python scripts/fix-from-review.py
"""

import json
import os
import re
import sys

GEN = r'F:\AcademicHub\word-books\src\data\generated'
B1 = os.path.join(GEN, 'book1.json')
B2 = os.path.join(GEN, 'book2.json')

CJK = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]')
# 记忆/联想类前缀，用来从 rootMeaning 里剥离
MEM_MARK = re.compile(r'\s*(记忆|联想|谐音|对比|注)\s*[:：]')


def fix_book1():
    with open(B1, encoding='utf-8') as f:
        d = json.load(f)
    gs = d['rootGroups']
    report = []

    # ① 删除伪词条 `op opt`（p270 原文 `op opt=光` 是词根行，不是词条）
    removed = []
    for g in gs:
        keep = []
        for e in g['entries']:
            if e['word'].strip() == 'op opt':
                removed.append(e['word'])
                continue
            keep.append(e)
        g['entries'] = keep
    if removed:
        report.append(f'删除伪词条 op opt: {len(removed)} 条')

    # ② p484 页首大写 Y 是章节字母，不是词根。把该组的 group.meaning 改回「单列」
    for g in gs:
        if (g.get('root') or '') == '' and (g.get('meaning') or '').strip() == 'Y':
            g['meaning'] = '单列'
            report.append('修正 p484 字母 Y 组: meaning "Y" -> "单列"')

    # ③ 散词组 meaning 口径统一为「单列」（原文 △单列 无释义，用统一可读文案）
    #    注意：这是组标题文案，不影响任何词条内容
    n_scatter = 0
    for g in gs:
        if (g.get('root') or '') == '':
            if (g.get('meaning') or '').strip() in ('', '单列', '单列词（无共同词根）'):
                g['meaning'] = '单列'
                n_scatter += 1
    if n_scatter:
        report.append(f'散词组标题统一为「单列」: {n_scatter} 组')

    # ④ 中文词源片段被误标 latin -> meaning（复核报告点名 17 处，全量修复）
    fixed_latin = 0
    for g in gs:
        for e in g['entries']:
            for s in e.get('segments') or []:
                if s.get('role') == 'latin' and CJK.search(s.get('text') or ''):
                    s['role'] = 'meaning'
                    fixed_latin += 1
    if fixed_latin:
        report.append(f'中文片段 latin -> meaning: {fixed_latin} 处')

    # ⑤ entry.root 与 group.root 不一致时，统一为 group.root
    fixed_root = 0
    for g in gs:
        groot = (g.get('root') or '').strip()
        for e in g['entries']:
            eroot = (e.get('root') or '').strip()
            if eroot != groot:
                e['root'] = groot if groot else None
                fixed_root += 1
    if fixed_root:
        report.append(f'entry.root 与 group.root 对齐: {fixed_root} 条')

    # ⑥ 词条自身的 root 字段：散词组必须是空（None 在 JSON 里就是 null，
    #    前端 normalizeBook 会读成 ''，这里统一写 None 保持与其它组一致）
    #    此项只做校验不改写，避免破坏既有结构。
    null_cnt = sum(1 for g in gs for e in g['entries'] if e.get('root') is None)

    total = sum(len(g['entries']) for g in gs)
    return d, report, len(gs), total, null_cnt


def fix_book2():
    with open(B2, encoding='utf-8') as f:
        d = json.load(f)
    report = []
    fixed = 0
    for g in d['groups']:
        for e in g['entries']:
            rm = e.get('rootMeaning') or ''
            if not rm:
                continue
            m = MEM_MARK.search(rm)
            if not m:
                continue
            pure = rm[:m.start()].strip()
            mem = rm[m.start():].strip()
            mem = MEM_MARK.sub('', mem).strip()
            e['rootMeaning'] = pure
            # 记忆内容并入 memory（若 memory 已有相同内容就不重复加）
            old = (e.get('memory') or '').strip()
            if mem and mem not in old:
                e['memory'] = (mem + (' ' + old if old else '')).strip()
            fixed += 1
    if fixed:
        report.append(f'rootMeaning 剥离记忆方法: {fixed} 条')
    total = sum(len(g['entries']) for g in d['groups'])
    return d, report, len(d['groups']), total


def main():
    dry = '--check' in sys.argv

    d1, r1, g1, n1, null_cnt = fix_book1()
    print('=== 书1 ===')
    for x in r1:
        print('  ' + x)
    print(f'  组数 {g1}, 词条 {n1}, entry.root 为 null 的 {null_cnt} 条')

    d2, r2, g2, n2 = fix_book2()
    print('=== 书2 ===')
    for x in r2:
        print('  ' + x)
    print(f'  天数 {g2}, 词条 {n2}')

    if dry:
        print('\n[--check] 未写盘')
        return

    with open(B1, 'w', encoding='utf-8') as f:
        json.dump(d1, f, ensure_ascii=False, indent=1)
    with open(B2, 'w', encoding='utf-8') as f:
        json.dump(d2, f, ensure_ascii=False, indent=1)
    print('\n已写入 book1.json / book2.json')


if __name__ == '__main__':
    main()
