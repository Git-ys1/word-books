"""
修复 check-book1.md 复核报告里的 A1-A4（每条都有 PDF 原文依据）。

A1 p418 `skeptical=sceptical=skept+ical=怀疑+a.=a.怀疑的`
   原文是全小写的「英式/美式拼写并列」，不是残片。
   word 里带 '=' 会破坏搜索与去重，取主拼写 skeptical，另一拼写记进 memory。

A2 p275 `△海洋` 后面 `ocean=ocean=海洋=n.海洋`
   原文把释义写成了标题（漏印词根）。按词条自述修正：root='ocean', meaning='海洋'。

A3 p325 断行 `=喝`，后接 `poison=poi+son=喝+n.=n.毒药`
   这不是一个独立词根。poison 的真实词根是 `poi`（poi+son）。
   修正：root='poi', meaning='喝'。
   （此前误建成 root='喝' 的组，等于凭空造了一个中文词根）

A4 散词组 340 条 entry.root 为 null，统一为 ''，与组级 root 保持一致。
   （前端 normalizeBook 会把 null 读成 ''，但数据层保持类型一致更稳）

用法：
  python scripts/fix-book1-a1a4.py --check
  python scripts/fix-book1-a1a4.py
"""

import json
import os
import sys

B1 = r'F:\AcademicHub\word-books\src\data\generated\book1.json'


def main():
    dry = '--check' in sys.argv
    with open(B1, encoding='utf-8') as f:
        d = json.load(f)
    gs = d['rootGroups']
    before = sum(len(g['entries']) for g in gs)
    report = []

    # A1：词条名带 '=' 的，取「=」前主拼写，另一拼写并入 memory
    a1 = 0
    for g in gs:
        for e in g['entries']:
            w = e['word']
            if '=' not in w:
                continue
            parts = [x.strip() for x in w.split('=') if x.strip()]
            if len(parts) < 2:
                continue
            main = parts[0]
            alts = parts[1:]
            e['word'] = main
            note = '另有拼写：' + ' / '.join(alts)
            old = (e.get('memory') or '').strip()
            if note not in old:
                e['memory'] = (note + (' ' + old if old else '')).strip()
            # segments 里的词根段同步改名
            for s in e.get('segments') or []:
                if s.get('role') == 'root' and s.get('text') == w:
                    s['text'] = main
            report.append(f"A1 {w!r} -> {main!r}")
            a1 += 1

    # A2：root 含中文且无释义 -> 用词条自述还原（ocean=ocean=海洋）
    a2 = 0
    for g in gs:
        root = (g.get('root') or '').strip()
        meaning = (g.get('meaning') or '').strip()
        if not root or not meaning:
            continue
        has_cjk = any('\u4e00' <= c <= '\u9fff' for c in root)
        if has_cjk:
            # 用第一条词条的 word 作为词根，被误放进 root 的中文作为释义
            first = g['entries'][0]['word'] if g['entries'] else ''
            if first and first.isascii():
                g['root'] = first.lower()
                g['meaning'] = root
                report.append(f"A2 root {root!r} -> {first.lower()!r}, meaning -> {root!r}")
                a2 += 1

    # A3：root='喝' 这种由断行造出的中文词根 -> 用词条拆解里的真实词根
    a3 = 0
    for g in gs:
        root = (g.get('root') or '').strip()
        if not root:
            continue
        has_cjk = any('\u4e00' <= c <= '\u9fff' for c in root)
        if not has_cjk:
            continue
        # 从词条的 segments 里找第一条 latin/root 英文片段作为真实词根
        real = ''
        for e in g['entries']:
            for s in e.get('segments') or []:
                t = (s.get('text') or '').strip()
                if s.get('role') in ('latin', 'root', 'affix') and t and t.isascii() and len(t) >= 2:
                    real = t
                    break
            if real:
                break
        if real:
            g['meaning'] = root          # 中文原本是词根释义
            g['root'] = real
            report.append(f"A3 root {root!r} -> {real!r}, meaning -> {root!r}")
            a3 += 1

    # A4：散词组（root == '') 的 entry.root 由 null 统一为 ''
    a4 = 0
    for g in gs:
        if (g.get('root') or '') == '':
            for e in g['entries']:
                if e.get('root') is None:
                    e['root'] = ''
                    a4 += 1
    report.append(f'A4 散词条 entry.root null -> "": {a4} 条')

    after = sum(len(g['entries']) for g in gs)
    print('\n'.join(report))
    print(f'\n词条数: {before} -> {after}（应不变）')
    print(f'A1 修正 {a1} 条 / A2 {a2} 组 / A3 {a3} 组 / A4 {a4} 条')

    if before != after:
        print('[FAIL] 词条数变化，拒绝写盘', file=sys.stderr)
        sys.exit(2)
    if dry:
        print('\n[--check] 未写盘')
        return
    with open(B1, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    print(f'\n已写入 {B1}')


if __name__ == '__main__':
    main()
