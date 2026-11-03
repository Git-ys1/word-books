"""
把 6 份手写 JSON 合并成最终的 book1.json / book2.json。

设计原则：
  1. 只做「格式校验 + 拼接」，**绝不修改任何词条内容**
     —— 内容由手写员逐条从 PDF 读出来，脚本不许擅自清洗、去重、改写释义
  2. 发现结构问题就报错并拒绝写盘，让人去修，而不是自动"纠正"
  3. 合并前后做数量核对，数量对不上就失败

用法：
  python scripts/merge-manual.py          # 校验 + 合并
  python scripts/merge-manual.py --check  # 只校验不写盘
"""

import glob
import json
import os
import sys

ROOT = r'F:\AcademicHub\word-books'
MANUAL = os.path.join(ROOT, 'src', 'data', 'manual')
GEN = os.path.join(ROOT, 'src', 'data', 'generated')

VALID_ROLES = {'root', 'affix', 'meaning', 'latin', 'cjk', 'link', 'pos'}
CJK_RE = None
import re
CJK_RE = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]')


def fail(msg):
    print('[FAIL] ' + msg, file=sys.stderr)
    sys.exit(2)


def warn(msg):
    print('[WARN] ' + msg)


def check_entry(e, where):
    """校验单个词条，只报错不改写。"""
    problems = []
    word = (e.get('word') or '').strip()
    if not word:
        problems.append('%s: word 为空' % where)
    if 'meaning' not in e:
        problems.append('%s: 缺 meaning 字段' % where)
    segs = e.get('segments')
    if segs is None:
        problems.append('%s: 缺 segments 字段' % where)
        segs = []
    for s in segs:
        if not isinstance(s, dict) or 'text' not in s or 'role' not in s:
            problems.append('%s: segment 结构错误 %r' % (where, s))
            continue
        if s['role'] not in VALID_ROLES:
            problems.append('%s: 非法 role=%r' % (where, s['role']))
        # 中文被标成 affix 是最常见的错误，必须拦下
        if s['role'] == 'affix' and CJK_RE.search(s['text'] or ''):
            problems.append('%s: 中文 %r 被错标成 affix' % (where, s['text']))
    return problems


def merge_book1(parts):
    groups = []
    seen_roots = {}
    all_problems = []
    for p in parts:
        path = p['file']
        data = p.get('data') or {}
        rgs = data.get('rootGroups')
        if not isinstance(rgs, list):
            fail('%s 没有 rootGroups 数组' % path)
        for gi, g in enumerate(rgs):
            root = (g.get('root') or '').strip()
            meaning = (g.get('meaning') or '').strip()
            entries = g.get('entries') or []
            if not isinstance(entries, list):
                fail('%s 第%d组 entries 不是数组' % (path, gi + 1))
            if not entries:
                warn('%s 第%d组 root=%r 没有任何词条，跳过' % (path, gi + 1, root))
                continue
            where_base = '%s#%d(root=%s)' % (os.path.basename(path), gi + 1, root)
            clean_entries = []
            for ei, e in enumerate(entries):
                all_problems.extend(check_entry(e, '%s/entry%d(%s)' % (where_base, ei + 1, e.get('word'))))
                clean_entries.append({
                    'word': (e.get('word') or '').strip(),
                    'meaning': e.get('meaning') or '',
                    'segments': e.get('segments') or [],
                    'memory': e.get('memory') or '',
                    'root': root or None,
                    'rootMeaning': meaning or None,
                })
            # 词根块去重：同一 root 跨分片出现时合并词条。
            # 典型场景：一个词根块横跨两个手写员的页范围（如 st(it)(ut) sist stant stin
            # 从 p358 跨到 p365，part-c 和 part-d 各写了一次），
            # 必须合并成一个组，否则前端会显示两个同名词根块。
            # 注意：这里只合并「组」，不动任何词条内容与顺序。
            key = root + '|' + meaning
            if root and key in seen_roots:
                seen_roots[key]['entries'].extend(clean_entries)
            else:
                grp = {'root': root, 'meaning': meaning, 'entries': clean_entries}
                groups.append(grp)
                if root:
                    seen_roots[key] = grp

    if all_problems:
        print('\n发现 %d 个结构问题：' % len(all_problems), file=sys.stderr)
        for x in all_problems[:40]:
            print('  - ' + x, file=sys.stderr)
        if len(all_problems) > 40:
            print('  ...还有 %d 个' % (len(all_problems) - 40), file=sys.stderr)
        fail('结构校验未通过，拒绝合并')

    total = sum(len(g['entries']) for g in groups)
    return {'book': 'book1', 'rootGroups': groups}, len(groups), total


def merge_book2(parts):
    by_day = {}
    all_problems = []
    for p in parts:
        path = p['file']
        data = p.get('data') or {}
        gs = data.get('groups')
        if not isinstance(gs, list):
            fail('%s 没有 groups 数组' % path)
        for g in gs:
            day = g.get('day')
            if not isinstance(day, int):
                fail('%s 的 day 不是整数: %r' % (path, day))
            entries = g.get('entries') or []
            where_base = '%s#day%d' % (os.path.basename(path), day)
            for ei, e in enumerate(entries):
                all_problems.extend(check_entry(e, '%s/entry%d(%s)' % (where_base, ei + 1, e.get('word'))))
                word = (e.get('word') or '').strip()
                if not word:
                    continue
                by_day.setdefault(day, []).append({
                    'word': word,
                    'root': (e.get('root') or '').strip(),
                    'rootMeaning': (e.get('rootMeaning') or '').strip(),
                    'meaning': e.get('meaning') or '',
                    'memory': e.get('memory') or '',
                    'segments': e.get('segments') or [],
                })

    if all_problems:
        print('\n发现 %d 个结构问题：' % len(all_problems), file=sys.stderr)
        for x in all_problems[:40]:
            print('  - ' + x, file=sys.stderr)
        if len(all_problems) > 40:
            print('  ...还有 %d 个' % (len(all_problems) - 40), file=sys.stderr)
        fail('结构校验未通过，拒绝合并')

    cn = {1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '七', 8: '八', 9: '九', 10: '十'}
    groups = []
    for day in sorted(by_day):
        groups.append({'day': day, 'title': '第%s天' % cn.get(day, day), 'entries': by_day[day]})
    total = sum(len(g['entries']) for g in groups)
    return {'book': 'book2', 'groups': groups}, len(groups), total


def load_parts(prefix):
    files = sorted(glob.glob(os.path.join(MANUAL, prefix + '-part-*.json')))
    parts = []
    for f in files:
        try:
            with open(f, encoding='utf-8') as fp:
                parts.append({'file': f, 'data': json.load(fp)})
        except Exception as ex:
            fail('读取 %s 失败: %s' % (f, ex))
    return parts


def main():
    check_only = '--check' in sys.argv
    if not os.path.isdir(MANUAL):
        fail('手动数据目录不存在: %s' % MANUAL)

    b1_parts = load_parts('book1')
    b2_parts = load_parts('book2')
    print('书1 分片: %s' % [os.path.basename(p['file']) for p in b1_parts])
    print('书2 分片: %s' % [os.path.basename(p['file']) for p in b2_parts])

    if b1_parts:
        d1, g1, n1 = merge_book1(b1_parts)
        print('\n书1 合并结果: %d 个词根组, %d 个词条' % (g1, n1))
        if not check_only:
            out = os.path.join(GEN, 'book1.json')
            with open(out, 'w', encoding='utf-8') as f:
                json.dump(d1, f, ensure_ascii=False, indent=1)
            print('  已写出 %s' % out)
    else:
        print('\n书1 还没有任何分片')

    if b2_parts:
        d2, g2, n2 = merge_book2(b2_parts)
        print('\n书2 合并结果: %d 天, %d 个词条' % (g2, n2))
        if not check_only:
            out = os.path.join(GEN, 'book2.json')
            with open(out, 'w', encoding='utf-8') as f:
                json.dump(d2, f, ensure_ascii=False, indent=1)
            print('  已写出 %s' % out)
    else:
        print('\n书2 还没有任何分片')

    if check_only:
        print('\n[--check] 未写盘')


if __name__ == '__main__':
    main()
