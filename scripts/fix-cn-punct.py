"""
书2 中文标点修复 —— 把被 PDF 文本层拆散的标点还原成正常中文。

问题现象（PDF 文本层的锅，不是提取脚本的错）：
  原文 `趋势，倾向n.` 被 PDF 拆成多个独立文本对象，
  pymupdf 取出来是 `趋势 倾向n ， .` —— 标点变成顶着空格的孤立 token。
  810 条释义都受影响，界面上会显示成「扩大 延期 包括v ， ， .」，很难看。

修复规则（只动 meaning / rootMeaning / memory，不碰 word / root）：
  1. 中文之间的空格：保留（原书本来就是用空格分隔不同义项，如「扩大 延期」）
  2. `X ， .` 这类：把「空格+全角逗号/句号/分号」还原成紧贴前面的字符
  3. `n .` -> `n.`、`v ，` -> `v，`  词性缩写与标点合并
  4. 连续的 `， ， .` 合并成 `，.`（原文就是一个逗号一个句点，被拆成了多个 token）
  5. 全角标点统一保留全角（中文语境）

脚本幂等，可重复运行。
用法：
  python scripts/fix-cn-punct.py            # 正式写入
  python scripts/fix-cn-punct.py --dry-run  # 只看不写
"""

import json
import os
import re
import sys

BOOK2 = r"F:\AcademicHub\word-books\src\data\generated\book2.json"

# 中文常用标点（全角）
CN_PUNCT = "，。；：、！？（）【】《》"


def fix_text(s):
    """修复被空格拆散的中文标点。"""
    if not s:
        return s

    original = s

    # ① 去掉「空格 + 全角标点」里的空格：「扩大 ， 延期」-> 「扩大，延期」
    s = re.sub(r"\s+([" + CN_PUNCT + r"])", r"\1", s)
    # ② 去掉「全角标点 + 空格」里的空格，但保留其后若为中文的间隔
    s = re.sub(r"([" + CN_PUNCT + r"])\s+", r"\1", s)
    # ③ 词性缩写与标点合并：「n .」-> 「n.」「adj .」-> 「adj.」
    s = re.sub(r"\b(n|v|a|ad|adv|adj|prep|conj|pron|num|art|int)\s+\.", r"\1.", s)
    s = re.sub(r"\b(n|v|a|ad|adv|adj|prep|conj|pron|num|art|int)\s+(，|。)", r"\1\2", s)
    # ③b 兜底：任意字母后紧跟「空格 + 句点」也合并（覆盖 vt/vi 等未列举的词性）
    s = re.sub(r"([A-Za-z])\s+\.(?![A-Za-z])", r"\1.", s)
    # ④ 合并连续重复标点：「， ， .」-> 「，.」「， ， ， .」-> 「，.」
    s = re.sub(r"([，,])[\s，,]+", r"\1", s)
    s = re.sub(r"([。.])[\s。.]+", r"\1", s)
    s = re.sub(r"([；;])[\s；;]+", r"\1", s)
    # ④b 「词性 + ，.」这种是原文「n.」后面跟的义项逗号被拆散了，
    #     中文里「n，.」不自然，还原成「n.」
    s = re.sub(r"\b(n|v|a|ad|adv|adj|prep|conj|pron|num|art|int)，+\.", r"\1.", s)
    # ④c 纯「，.」结尾（前面没有词性）还原成「.」
    s = re.sub(r"，+\s*\.\s*$", ".", s)
    # ④d 连续逗号只留一个：「，，」->「，」
    s = re.sub(r"，{2,}", "，", s)
    # ④e 重复句点收敛：「..」-> 「.」「...」-> 「.」
    s = re.sub(r"\.{2,}", ".", s)
    # ⑤ 标点前后残留的空格清掉：「， 」-> 「，」
    s = re.sub(r"([" + CN_PUNCT + r"])\s+", r"\1", s)
    # ⑥ 中文与标点之间的空格：「包括 v ， .」已经在③④处理，这里清多余空格
    s = re.sub(r"\s{2,}", " ", s)
    # ⑦ 收尾：句点/逗号后不要再有空格（中文语境）
    s = re.sub(r"([，。；：、.,;:])\s*$", r"\1", s)

    return s.strip()


def main():
    dry = "--dry-run" in sys.argv
    with open(BOOK2, encoding="utf-8") as f:
        data = json.load(f)

    changed = 0
    samples = []

    for g in data["groups"]:
        for e in g["entries"]:
            for field in ("meaning", "rootMeaning", "memory"):
                if field not in e:
                    continue
                old = e[field]
                if not old:
                    continue
                new = fix_text(old)
                if new != old:
                    if len(samples) < 12:
                        samples.append((e["word"], field, old, new))
                    e[field] = new
                    changed += 1

    print(f"修改字段数: {changed}")
    if samples:
        print("\n样例（前 12 条）：")
        for w, fld, o, n in samples:
            print(f"  {w:16s} {fld}")
            print(f"    旧: {o!r}")
            print(f"    新: {n!r}")

    if dry:
        print("\n[--dry-run] 未写入文件")
        return

    # 安全阀：结构校验，防止写坏
    total = sum(len(g["entries"]) for g in data["groups"])
    assert len(data["groups"]) == 10, f"分组数异常: {len(data['groups'])}"
    assert total == 1515, f"词条数异常: {total}"
    empty_meaning = sum(1 for g in data["groups"] for e in g["entries"] if not e["meaning"].strip())
    if empty_meaning:
        print(f"错误：meaning 为空 {empty_meaning} 条，拒绝写盘", file=sys.stderr)
        sys.exit(2)

    tmp = BOOK2 + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, BOOK2)
    print(f"\n已写入 {BOOK2}")
    print(f"校验通过：分组 {len(data['groups'])}，词条 {total}，meaning 空 {empty_meaning}")


if __name__ == "__main__":
    main()
