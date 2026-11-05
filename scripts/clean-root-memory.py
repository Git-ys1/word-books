"""
清理书2 里被误复制的「词根级记忆前缀」。

## 背景
PDF 的「词根/原型」列是合并单元格，里面除了词根和释义，
还常带一行「记忆：xxx」提示，例如：
    soci 格：  soci / 群体的 / 社会的 / 记忆：soc像 / 500
手写数据时，这类词根级提示被复制到了该组**每一个词**的 memory 开头，
于是 social / asocial / sociable ... 8 个词的 memory 都变成了
    'soc像 soci社会 + al形容词'
用户看到「soc 像一直存在」——这是词根级提示，不属于任何单词。

## 处理原则（关键，不能一刀切）
- 只删「同 root 组内所有词 memory 的共同前缀」，且该前缀必须是短提示（<=10 字）
- 保留合法的拆解式：如 crit 组 'cr残忍 + it它' 是真正的单词拆解，
  它虽是共同前缀，但含有 '+' 号，属于拆解内容，不删
- 前缀必须是「提示词」而非拆解：不含 '+'、不含 '='、不是纯英文词根
- 每个前缀都核过 PDF 词根格坐标，确认它确实出现在 x<85 的词根列

## 用法
  python scripts/clean-root-memory.py --check
  python scripts/clean-root-memory.py
"""

import json
import re
import sys
import collections

B2 = r'F:\AcademicHub\word-books\src\data\generated\book2.json'

# 经 PDF 词根列坐标核实的「词根级记忆提示」前缀。
# 这些文本确实印在 x<85 的词根格里，不是单词自己的记忆列内容。
ROOT_MEMORY_PREFIXES = [
    'soc像', '疼的', 'se 色迷迷', 'cr残忍', 'etc', '生态', '摸大', '礼拜',
    'ear 听', '陪你', '太难', '堵车', 'fe废话', '确认', '摆放姿势', '拉他',
    '10个高一', '低声畅谈', '热锅', '刺刀/', 'I see', 'stin', '除了', '影像',
    'de得了emo的人', 'club俱乐部', '一丝丝时间', 'ce厕', 'love', '慢点',
    'tech教', '网络语emo', 'com', '怕热', 'qua权', 'unit单元', 'cap 帽子',
    'play，玩折纸', 'sat坐', 'spend 花费', 'limi 厘米', 'next 下一个', 'pet 宠物',
    'card卡', 'video影像', 'just就（救）', 'ID，前后ID要一致',
    'fore在前', 'down下面', 'over上面', 'under下面', 'monitor班长',
    'te特多+ct尘土', 'qua权 + l力',
]


def main():
    dry = '--check' in sys.argv
    with open(B2, encoding='utf-8') as f:
        d = json.load(f)

    # 按 (day, root) 分组，计算同组 memory 的最长公共前缀
    groups = collections.defaultdict(list)
    for g in d['groups']:
        for e in g['entries']:
            groups[(g['day'], e.get('root') or '')].append(e)

    changed = []
    for (day, root), es in groups.items():
        if not root or len(es) < 2:
            continue
        mems = [(e.get('memory') or '').strip() for e in es if (e.get('memory') or '').strip()]
        if len(mems) < 2:
            continue
        prefix = mems[0]
        for m in mems[1:]:
            i = 0
            while i < len(prefix) and i < len(m) and prefix[i] == m[i]:
                i += 1
            prefix = prefix[:i]
            if not prefix:
                break
        cand = prefix.strip().rstrip('+=').strip()
        # 只处理：短、在核实清单里、后面确实跟一个空格（说明是独立前缀）
        if not cand or len(cand) > 12:
            continue
        if cand not in ROOT_MEMORY_PREFIXES:
            continue
        # 含 '+' 的是合法拆解式，不删
        if '+' in cand or '=' in cand:
            continue
        # 对每个词：去掉开头「前缀 + 空白」
        pat = re.compile(r'^' + re.escape(cand) + r'\s+')
        n = 0
        for e in es:
            mem = (e.get('memory') or '').strip()
            if pat.match(mem):
                new = pat.sub('', mem).strip()
                e['memory'] = new
                n += 1
        if n:
            changed.append((day, root, cand, n))
            print(f'  D{day} root={root!r:18s} 剥离前缀 {cand!r} : {n} 条')

    print(f'\n共清理 {len(changed)} 组 / {sum(x[3] for x in changed)} 条')
    if dry:
        print('[--check] 未写盘')
        return
    with open(B2, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    print(f'已写入 {B2}')


if __name__ == '__main__':
    main()
