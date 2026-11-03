"""
修复 check-book2.md 报告里的字段结构问题（不编造任何内容）。

核心问题：PDF 第一列是「词根 + 中文释义」合并排版的，形如
    gene 基因
    civ → city 城市
    secut(e)跟随
    side 旁边 =sit坐
手写时整段塞进了 root 字段，导致：
  - root 含中文（不该有，root 应是英文词根）
  - rootMeaning 为空（中文释义本该在这里）

修法（纯机械拆分，不猜不编）：
  从 root 里找出「第一段连续的英文/符号」作为词根，
  其余中文部分作为 rootMeaning。
  若整段没有英文（如 root='可能'、root='健康'、root='力量'），
  说明原书这一组就是中文分组标题，保持原样不动。

用法：
  python scripts/fix-book2-roots.py --check
  python scripts/fix-book2-roots.py
"""

import json
import re
import sys

B2 = r'F:\AcademicHub\word-books\src\data\generated\book2.json'

CJK = re.compile(r'[\u4e00-\u9fff]')
# 词根部分：开头的英文、括号、箭头、等号、斜杠、空格（遇到中文就停）
ROOT_HEAD = re.compile(r'^[A-Za-z()\[\]\/=\s→\-\.]+')


def split_root(raw):
    """
    把「gene 基因」拆成 ('gene', '基因')
    把「civ → city 城市」拆成 ('civ → city', '城市')
    把「secut(e)跟随」拆成 ('secut(e)', '跟随')
    把「可能」拆成 ('可能', '')   —— 整段中文，保持不动
    """
    raw = raw.strip()
    if not raw:
        return raw, ''
    if not CJK.search(raw):
        return raw, ''
    m = ROOT_HEAD.match(raw)
    head = (m.group(0) if m else '').strip()
    tail = raw[len(m.group(0)):].strip() if m else raw
    if not head:
        # 整段都是中文，是原书的中文分组标题，原样保留
        return raw, ''
    # 去掉头部残留的孤立符号
    head = re.sub(r'^[\s=→\-\.]+', '', head).strip()
    head = re.sub(r'[\s=→\-\.]+$', '', head).strip()
    if not head:
        return raw, ''
    return head, tail


def main():
    dry = '--check' in sys.argv
    with open(B2, encoding='utf-8') as f:
        d = json.load(f)

    before = sum(len(g['entries']) for g in d['groups'])
    changed = []
    for g in d['groups']:
        for e in g['entries']:
            root = (e.get('root') or '').strip()
            rm = (e.get('rootMeaning') or '').strip()
            if not root:
                continue
            if not CJK.search(root):
                continue  # root 纯英文，无需处理
            new_root, new_rm = split_root(root)
            if new_root == root:
                continue  # 整段中文，保持
            e['root'] = new_root
            # 原 rootMeaning 若为空，用拆出来的；否则保留原有的（原有优先）
            if not rm:
                e['rootMeaning'] = new_rm
            changed.append((e['word'], root, new_root, e.get('rootMeaning') or ''))

    after = sum(len(g['entries']) for g in d['groups'])
    print(f'拆分 root 的条目: {len(changed)} 条')
    for w, o, n, rm in changed[:15]:
        print(f'  {w:16s} {o!r} -> root={n!r} rm={rm!r}')
    if len(changed) > 15:
        print(f'  ...另有 {len(changed) - 15} 条')

    # 复检
    left = sum(1 for g in d['groups'] for e in g['entries']
               if CJK.search(e.get('root') or '') and ROOT_HEAD.match((e.get('root') or '').strip() or ' '))
    still = [(e['word'], e['root']) for g in d['groups'] for e in g['entries']
             if CJK.search(e.get('root') or '') and ROOT_HEAD.match((e.get('root') or '').strip() or ' ')]
    print(f'\n拆分后 root 含中文且能拆出英文的剩余: {len(still)} 条')
    for w, r in still[:8]:
        print(f'  {w}: {r!r}')

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
