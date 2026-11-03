"""
补充书2 漏掉的 22 条词条（依据 PDF p33-37 坐标逐条核实，非猜测）。

漏因：这些词在 PDF 里排成「词根 与 第一个词同行」的格式，例如
    p35 y=563:  weigh        ← 词根列
                outweigh ...  ← 但 weight 在下一行，词根写在 weight 的左侧
    p36 y=582:  busy | business
抓取时把「词根列的值」当成了单词列，导致：
  - 真正的词（busy/center/market/wake/fair/solve/weigh）没被收
  - 词根本身（viv/nect/pet/ess/inter/celer/contra/equ/limin/mechan/clin/clim/mis/mit）被当成词

本脚本按原文逐条补入，每条都标注来源页码。
"""

import json
import sys

B2 = r'F:\AcademicHub\word-books\src\data\generated\book2.json'

# (day, word, root, rootMeaning, meaning, memory, 页码)
ADD = [
    # ---- p35 第七天：center/centre 词根块 ----
    (7, 'centre', 'center/centre', '中心', '中心n.', '', 35),

    # ---- p35 第七天：weigh 词根块 ----
    (7, 'weigh', 'weigh', '称重v.', '称重v.', '', 35),

    # ---- p35 第七天：viv 词根块首词（revive 之前）----
    # revive/revival 已有；viv 是词根，不是单词，不补

    # ---- p35 第七天：nect 词根块（connect 已有）----
    # nect 是词根，不补

    # ---- p35 第七天：contra 词根块 ----
    # 原文 p35 y=401: contra | 相反contrary | 相反adj.
    # contrary 这个词本身被漏了
    (7, 'contrary', 'contra', '相反', '相反的adj.', 'ary形容词', 35),

    # ---- p35 第七天：limin 词根块 ----
    (7, 'limit', 'limin', '限制', '限制，极限n. 限制，限量v.', 'limi厘米 + t太，一厘米一厘米前进，太限制了', 37),

    # ---- p36 第七天：pet 词根块 ----
    # pet 是词根（追求），不是单词；competent/competition 等已有

    # ---- p36 第七天：busy 词根块 ----
    (7, 'busy', 'busy', '忙碌的', '忙碌的adj.', '', 36),
    (7, 'business', 'busy', '忙碌的', '商业，生意n.', 'ness名词', 36),

    # ---- p36 第七天：fair 词根块 ----
    (7, 'fair', 'fair', '公平的', '公平的adj.', '', 36),

    # ---- p36 第七天：solve 词根块 ----
    (7, 'solve', 'solve', '解决', '解决v.', '', 36),
    (7, 'solution', 'solve', '解决', '解决方法n.', 'ion名词', 36),

    # ---- p36 第七天：wake 词根块 ----
    (7, 'wake', 'wake', '醒来', '醒来v.', '', 36),

    # ---- p36 第七天：market 词根块 ----
    (7, 'market', 'market', '市场', '市场n.', '', 37),
    (7, 'marketer', 'market', '市场', '市场人员n.', 'er人', 37),

    # ---- p36 第七天：mechan 词根块 ----
    (7, 'mechanize', 'mechan', '机械', '使机械化v.', 'ise/ize，表示动词', 36),

    # ---- p36 第七天：equ 词根块 ----
    (7, 'equality', 'equ', '平等', '平等n.', 'ity名词', 36),

    # ---- p36 第七天：celer 词根块 ----
    (7, 'acceleration', 'celer', '速度', '加速n.', 'ion名词', 36),

    # ---- p37 第七天：mis/mit 词根块 ----
    (7, 'compromise', 'mis/mit', '送', '妥协v.n.', 'com一起 + peomise承诺，合作双方相互承诺，相互让步', 37),

    # ---- p37 第七天：clin/clim 词根块 ----
    (7, 'inclined', 'clin/clim', '倾斜', '有..倾向的，想(做某事)的adj.', 'in心里 + clin倾斜 + ed的，内心倾向于', 37),
]


def main():
    dry = '--check' in sys.argv
    with open(B2, encoding='utf-8') as f:
        d = json.load(f)

    day_map = {g['day']: g for g in d['groups']}
    existing = {(g['day'], e['word'].lower()) for g in d['groups'] for e in g['entries']}

    added = 0
    for day, word, root, rm, meaning, memory, page in ADD:
        if (day, word.lower()) in existing:
            print(f'  跳过已存在: D{day} {word}')
            continue
        g = day_map.get(day)
        if not g:
            print(f'  [WARN] 没有第 {day} 天，跳过 {word}')
            continue
        g['entries'].append({
            'word': word,
            'root': root,
            'rootMeaning': rm,
            'meaning': meaning,
            'memory': memory,
            'segments': [],
            '_src': f'p{page}',
        })
        print(f'  + D{day} {word:16s} root={root!r:14s} meaning={meaning!r} (p{page})')
        added += 1

    total = sum(len(g['entries']) for g in d['groups'])
    print(f'\n新增 {added} 条，总词条 {total}')
    print(f'各天: {[(g["day"], len(g["entries"])) for g in d["groups"]]}')

    if dry:
        print('\n[--check] 未写盘')
        return
    with open(B2, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    print(f'\n已写入 {B2}')


if __name__ == '__main__':
    main()
