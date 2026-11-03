"""
修复 check-book2.md 复核发现的 5 处词根串组 / 自造词根（每处都有 PDF 坐标依据）。

| 词 | 原文第一列 | 现在的错误值 | 正确值 |
|---|---|---|---|
| controversy, controversial | p26 `补充：` + `verse转` | uni / 单个 | vers/verse / 转 |
| slave, slavery, enslavement | p34 `补充` + `对比save` | safe / 安全的adj. | 留空（原文无词根） |
| favo(u)r 等 7 词 | p20 原文只有中文「喜爱」 | favor | 留空（原文无英文字根） |

判断依据（用的都是 PDF words 的 x 坐标）：
  词条列在 x≈95，第一列在 x<160 且 y 比词条行更靠上；
  若第一列内容是「补充」「记忆：」「对比xxx」这类标记，
  说明它是上一组的尾部补充，本组没有自己的词根。
"""

import json
import sys

B2 = r'F:\AcademicHub\word-books\src\data\generated\book2.json'

# 词 -> (正确的 root, 正确的 rootMeaning)；留空用 '' 表示
FIXES = {
    # p26：原文第一列是「补充：」+「verse转」，词根本体是 verse
    'controversy': ('vers/verse', '转'),
    'controversial': ('vers/verse', '转'),
    # p34：第一列只有「补充」「对比save」，没有词根 -> 留空
    'slave': ('', ''),
    'slavery': ('', ''),
    'enslavement': ('', ''),
    # p20：第一列只有中文「喜爱」，没有英文字根 -> 留空
    'favo(u)r': ('', ''),
    'favo(u)rable': ('', ''),
    'unfavo(u)rable': ('', ''),
    'favo(u)rably': ('', ''),
    'favo(u)ritism': ('', ''),
    'prefer': ('', ''),
    'preference': ('', ''),
}


def main():
    dry = '--check' in sys.argv
    with open(B2, encoding='utf-8') as f:
        d = json.load(f)

    before = sum(len(g['entries']) for g in d['groups'])
    hit = 0
    for g in d['groups']:
        for e in g['entries']:
            key = e['word'].lower()
            if key not in FIXES:
                continue
            root, rm = FIXES[key]
            old = (e.get('root') or '', e.get('rootMeaning') or '')
            e['root'] = root
            e['rootMeaning'] = rm
            print(f"  {e['word']:20s} root {old[0]!r} -> {root!r}   rm {old[1]!r} -> {rm!r}")
            hit += 1

    after = sum(len(g['entries']) for g in d['groups'])
    print(f'\n修正 {hit} 条（预期 12 条）')
    print(f'词条数: {before} -> {after}（应不变）')
    if before != after:
        print('[FAIL] 词条数变化，拒绝写盘', file=sys.stderr)
        sys.exit(2)
    if dry:
        print('\n[--check] 未写盘')
        return
    with open(B2, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    print(f'\n已写入 {B2}')


if __name__ == '__main__':
    main()
