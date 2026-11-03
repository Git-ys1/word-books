"""
修复 book1 组级问题（v2 —— 只改确定的错，不碰散词区）。

## v1 的错误（已回滚，教训记录在此）
v1 把 28 个散词区（root=""）合并成 1 组，理由是"原文只有 23 处 △单列"。
**这是错的。** 实测第 125/126/127/128 页，每页各有一个独立的「△单列」标记，
每页收的词完全不同（eager/enable/entire vs estimate/exchange/... vs embryo/... vs encounter/...）。
散词区必须按原文位置各自成组，合并会打乱整段词序。

## 本版只做两件事
1. 更正 `sting stinct stimul` -> `sting stinct stimul sting`（原文末尾多一个 sting，手写时漏抄）
2. 保留 part-c 依据 p325 `=喝`（原文漏印 △）自建的 root="喝" 组

用法：
  python scripts/fix-book1-groups.py --check
  python scripts/fix-book1-groups.py
"""

import json
import os
import sys

BOOK1 = r'F:\AcademicHub\word-books\src\data\generated\book1.json'

# root 名更正表：写错的值 -> 原文正确的值
ROOT_FIXES = {
    'sting stinct stimul': 'sting stinct stimul sting',
}


def main():
    dry = '--check' in sys.argv
    with open(BOOK1, encoding='utf-8') as f:
        data = json.load(f)

    groups = data['rootGroups']
    before_groups = len(groups)
    before_entries = sum(len(g['entries']) for g in groups)

    fixed = 0
    for g in groups:
        root = (g.get('root') or '').strip()
        if root in ROOT_FIXES:
            g['root'] = ROOT_FIXES[root]
            fixed += 1

    scatter = [g for g in groups if not (g.get('root') or '').strip()]
    he = [g for g in groups if (g.get('root') or '').strip() == '喝']

    after_groups = len(groups)
    after_entries = sum(len(g['entries']) for g in groups)

    print(f'组数: {before_groups} -> {after_groups}（应为不变）')
    print(f'词条: {before_entries} -> {after_entries}（应为不变）')
    print(f'root 名更正: {fixed} 处')
    print(f'散词区: {len(scatter)} 组，共 {sum(len(g["entries"]) for g in scatter)} 条（按原文各自成组，不合并）')
    print(f'「喝」组: {len(he)} 处（p325 原文漏印 △，保留合理）')

    if before_groups != after_groups or before_entries != after_entries:
        print('\n[FAIL] 组数或词条数变化，拒绝写盘', file=sys.stderr)
        sys.exit(2)

    if dry:
        print('\n[--check] 未写盘')
        return

    with open(BOOK1, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f'\n已写入 {BOOK1}')


if __name__ == '__main__':
    main()
