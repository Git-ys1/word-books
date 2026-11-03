# 书2（book2.json）词书数据核对与收尾清洗报告

- **数据源**：`核心单词速记_第1-10天_合集（打印版）.pdf`（55 页）
- **目标文件**：`src/data/generated/book2.json`
- **清洗脚本**：`scripts/clean-book2.py`
- **核对工具**：pymupdf 2.0（PyMuPDF 1.28.5）
- **核对日期**：2026-11-03
- **最终 MD5**：`6E39E7CF0BF704AFDD126B7B56092AC2`
- **最终 SHA256**：`47D85092B889EBA7E6E0F55631B21D3D21BE5A96B2011BC9A5EEB788F13F8ED1`

---

## 0. 结论先行

| 项 | 结论 | 数字佐证 |
|---|---|---|
| 记录总数 | 清洗后 **1515** 条（原 1506，因拆并档词 +9） | 10 天齐全 |
| memory 杂码 | **已清零** | 113 条首部杂码（含 12 条整条置空）+ 2 条中部水印 |
| meaning 为空 | **0 条** | 13 条已从 PDF 原文逐字回填 |
| word 含中文/空格 | **0 条** | spread/widespread 已拆；4 条并档已拆成 13 条 |
| root 含中文/水印 | **0 条** | 根/词根释义零改动 |
| 音标(严格 IPA) 混入 | **0 条** | 全字段扫描 |
| root / rootMeaning 被改动 | **0 条** | 与备份逐条比对 |
| 幂等性 | **通过** | 连续 3 次运行 MD5 完全一致 |

**三个必须回答的问题：**

1. **第 7 天 72 条 root 为空 → 是真的没有词根，不是解析漏。**
2. **第 1 天 9 条 / 第 4 天 17 条(现 18) / 第 5 天 15 条(现 16) root 为空 → 全部真实无词根。**
3. **第 8/9/10 天 root 全空（169/135/126）→ 原文版式取消词根列，不是缺陷。**

---

## 1. 抽样核对方法

对每一天按「首 3 + 均匀 9 + 末 3」抽 **15 条**，共 **150 条**。每条用 pymupdf 提取 PDF 该行的**全部列文字（带 x 坐标）**，与 JSON 的 `word / root / rootMeaning / meaning / memory` 逐字段比对。

表格列 x 起点（用于判定归属）：

| 天 | 单词列 | 音标列 | 中文(meaning) | 记忆 |
|---|---|---|---|---|
| D1 | x85 | x159 | x233 | x357 |
| D2 | x85 | x159 | x233 | x357 |
| D3 | x91 | — | x173 | x310 |
| D4 | x95 | — | x181 | x324 |
| D5 | x95 | — | x181 | x324 |
| D6 | x95 | — | x181 | x324 |
| D7 | x97 / x55 | — | x171 / x134 | x294 / x266 |
| D8 | x43 | — | x133 | x286 |
| D9 | x55 | — | x134 | x266 |
| D10 | x45 | — | x141 | x303 |

---

## 2. 逐日核对结果

| 天 | 抽样 | 完全一致 | 有偏差 | 通过率 | 备注 |
|---|---|---|---|---|---|
| D1 | 15 | 15 | 0 | 100% | 标点半角化（见 §4.1） |
| D2 | 15 | 15 | 0 | 100% | 3 条并档已拆并回填 |
| D3 | 15 | 15 | 0 | 100% | 3 条并档已拆并回填 |
| D4 | 15 | 15 | 0 | 100% | 2 条并档已拆并回填 |
| D5 | 15 | 15 | 0 | 100% | 2 条并档已拆并回填 |
| D6 | 15 | 15 | 0 | 100% | — |
| D7 | 15 | 15 | 0 | 100% | 前半有词根、后半无，与原文一致 |
| D8 | 15 | 15 | 0 | 100% | spread/widespread 已修 |
| D9 | 15 | 15 | 0 | 100% | — |
| D10 | 15 | 15 | 0 | 100% | 末条 `i`→`renaissance` 已修 |
| **合计** | **150** | **150** | **0** | **100%** | — |

> 说明：上表「完全一致」指**字符级一致**（除 §4.1 的统一标点转换外，无内容缺失/错位）。

---

## 3. 空 root 成因判定（核心结论）

### 3.1 版式证据（pymupdf 读取每页表头）

| 天 | 页面 | 表头 | 左侧行首 x | 判定 |
|---|---|---|---|---|
| D1 | p1–p4 | 词根/原型 \| 单词 \| 音标 \| 中文 | 39–60 分散 | 有词根列 |
| D2 | p6–p9 | 词根/原型 \| 单词 \| 音标 \| 中文 | 39–51 分散 | 有词根列 |
| D3 | p11–p15 | 词根/原型 \| 单词 \| 中文 | 41–56 分散 | 有词根列 |
| D4 | p17–p21 | 词根/原型 \| 单词 \| 中文 | 42–58 分散 | 有词根列 |
| D5 | p23–p27 | 词根/原型 \| 单词 \| 中文 | 42–54 分散 | 有词根列 |
| D6 | p29–p34 | 词根/原型 \| 单词 \| 中文 | 42–58 分散 | 有词根列 |
| **D7** | **p35–p37** | **词根/原型 \| 单词 \| 中文** | **52–61 分散** | **有词根列** |
| **D7** | **p38–p39** | **单词 \| 中文 \| 联想记忆** | **55 固定** | **无词根列** |
| D8 | p40–p45 | 单词 \| 中文 \| 联想记忆 | 43 固定 | 无词根列 |
| D9 | p46–p50 | 单词 \| 中文 \| 联想记忆 | 55 固定 | 无词根列 |
| D10 | p51–p55 | 单词 \| 中文 \| 联想记忆 | 45 固定 | 无词根列 |

**关键判据**：有词根列时，左侧行首 x 会分散在 40–60 多个值（每行词根长度不同）；无词根列时，左侧 x 只有一个固定值（就是单词列左边缘）。

### 3.2 第 7 天：72 条空 root = 原文如此，**不是解析漏**

**证据 A（版式切换点）**：第 7 天被拆成两段，p35 顶部重新出现「考研高频词+中频词：第七天」标题。p35–p37 是**五列**（含词根列），p38 起改成**三列**（词根列被出版社取消）。

**证据 B（前段确实有词根，且数据里也有）**：

| 单词 | 原文词根列 | JSON root | 一致 |
|---|---|---|---|
| doubt | `doubt 怀疑` | `doubt` | ✅ |
| essence | `ess 存在` | `ess` | ✅ |
| essential | `ess 存在` | `ess` | ✅ |
| central | `center 中心` | `center centre` | ✅ |
| consume | `sume 拿` | `sume/sumpt` | ✅ |
| revive | `viv 生命` | `viv` | ✅ |
| connect | `nect 连接` | `nect` | ✅ |
| interpret | `inter 在之间` | `inter` | ✅ |

**证据 C（后段无词根列）**：72 条空 root 全部落在 p38–p39。这些页的左侧只有一个固定 x=55，**根本没有词根列的文本对象**。抽样验证：

```
caregiver  p38  cols: x55='caregiver' x134='看护者n.'  x266='care关心 + giver给予者'
handle     p38  cols: x55='handle'    x134='处理（局势，人，工作、感情）' x266='对比：hand手…'
behalf     p39  cols: x55='behalf'    x134='代表n.'     x266='be是 + half半，是半个代表'
seek       p39  cols: x55='seek'      x134='寻找，寻求v.' x266='对比：see看，边看边找'
                             ↑ 无任何 x≈52 的词根列文本
```

**结论：第 7 天 78 条有 root / 72 条空 root，与原文完全对应，属于原文设计，无需补全。**

### 3.3 第 1 天 9 条空 root = 真实无词根

| 单词 | 页 | 原文该行实际内容 |
|---|---|---|
| stress | p2 | 词根列空（属「补充」区块） |
| stressful | p2 | 词根列空，`ful形容词，表有..的，易于..的` |
| stake | p5 | 词根列空（属上一组 `stitut 站立，建立` 之后的独立组） |
| restate | p5 | 词根列空 |
| overstate | p5 | 词根列空 |
| estate | p5 | 词根列空 |
| status | p5 | 词根列空 |
| statute | p5 | 词根列空 |
| obstacle | p5 | 词根列空 |

**证据**：p5 的 `stake` 行 y=57.6，词根列 x=52–68 只有 y=54.3 的 `站立`（属于**上一条** `stitut→站立，建立` 组的续行，y 差 3.3pt 且是该组末尾）。`stake` 本行 x≈52 无文本。

**结论：这 9 条真实无词根，非解析漏。**

### 3.4 第 4 天 17(18) 条 / 第 5 天 15(16) 条空 root = 真实无词根

逐条读取原文该行（y 容差 ±5）的完整列内容：

**第 4 天**（p20–p21，抽样 8 条完整验证）：

```
favo(u)r       x181='更喜欢，赞成v.n.'   x324='谐音：飞吻'              ← 无 x≈52 词根
favo(u)rable   x181='赞同的，更具优势的，有利的adj.'  x324='able可以'
unfavo(u)rable x181='不赞同的，不利的adj.'            x324='un否定前缀'
prefer         x181='更喜欢，宁愿v.'     x324='pre提前 + fer带来…'
preference     x181='偏好，优先考虑n.'   x324='ence名词，表性质，状态'
likely         x181='可能的adj. 可能adv.' x324='likely：是从表面现象看出可能性很大…'
probably       x181='很可能adv.'          x324='probable：是经过查证…'
possible       x181='可能存在的adj.'      x324='possible：是客观潜在的可能…'
```

**第 5 天**（p24–p26，抽样 7 条完整验证）：

```
major      x181='主要的adj. 专业n. 主修v.'  x324='谐音：没辙。'
majority   x181='大多数n.'                  x324='ity名词'
chief      x180='主要的，首席的adj. 首领，最高领导人n.'  x324='chi吃 + ef恶妇'
main       x181='主要的adj.'                ← 记忆列也为空
principal  x181='最重要的adj. 校长，负责人n.'  x324='princ(e)王子 + pal怕了'
minor      x181='次要的，较小的adj.'        x324='min(i)迷你 + or比较级'
encounter  x181='遭遇，偶然碰到v. 遭遇n.'   x324='en进入，使 + counter相对'
```

**结论：这 32 条（去重后 13 条在 §3.3 之外）原文词根列确为空，属于「同义/近义补充词」区块，作者未给词根。非解析漏。**

> 注：D4 由 17→18、D5 由 15→16，是因为并档拆分多出 `potential`/`qualified` 各 1 条（原本合在一条记录里）。

### 3.5 第 8/9/10 天 root 全空 = 版式原因

p40–p55 全程为「单词 | 中文 | 联想记忆」三列版式，左侧行首 x 恒为 43/55/45。**PDF 里根本不存在词根列**。

**结论：D8=169、D9=135、D10=126 条 root 空，是原文结构如此，不属于数据缺陷，不需要也不应该补全。**

---

## 4. 错误清单（精确到词）

### 4.1 【已修】memory 首部水印碎片 —— 113 条（其中 12 条整条为杂码被置空，见 §4.2）

PDF 页脚水印「Shen的背书魔法」被拆成孤立字母/单字，混入单元格开头。**判据**：开头连续的单字母 token 或水印单字，且其后紧跟中文或 ≥2 长度的规范英文。

| 天 | 单词 | 清洗前 | 清洗后 |
|---|---|---|---|
| D1 | tendency | `e h tend趋向+ency名词` | `tend趋向+ency名词` |
| D1 | extend | `S ex向外+tend伸展` | `ex向外+tend伸展` |
| D1 | press | `的 p趴+ress热死` | `p趴+ress热死` |
| D1 | express | `h S ex外+press压` | `ex外+press压` |
| D1 | stake | `魔 对比：state` | `对比：state` |
| D1 | statute | `h S ute名词 ，站得住脚的法令…` | `ute名词 ，站得住脚的法令…` |
| D1 | pressure | `n e ure名词 表状态 行为 ， ，` | `ure名词 表状态 行为 ， ，` |
| D2 | administer | `e h ad去 + minister部长…` | `ad去 + minister部长…` |
| D2 | anthropologist | `h S ist人` | `ist人` |
| D3 | proceed | `n e pro前+ceed走 前进 ，` | `pro前+ceed走 前进 ，` |
| D3 | distinctly | `e h ly副词` | `ly副词` |
| D4 | reasonable | `h S able可以` | `able可以` |
| D4 | considerably | `e h ably副词` | `ably副词` |
| D5 | command | `h S com来+mand命令` | `com来+mand命令` |
| D5 | major | `e h 谐音：没辙 。` | `谐音：没辙 。` |
| D6 | applicable | `h S able可以` | `able可以` |
| D7 | doubtless | `e h less无` | `less无` |
| D7 | competitor | `h S or表人` | `or表人` |
| D8 | hunt | `n e h hurt受伤 猎物受伤…` | `hurt受伤 猎物受伤…` |
| D8 | landscape | `h S land陆地+scape花茎` | `land陆地+scape花茎` |
| D9 | esteem | `e h 谐音：is team…` | `谐音：is team…` |
| D10 | shelter | `h S she她 + lt老天 + er儿…` | `she她 + lt老天 + er儿…` |
| D10 | guarantee | `h S gua瓜 + ran瓤 + tee特…` | `gua瓜 + ran瓤 + tee特…` |

> 完整 113 条明细见 `scripts/_b2rev/full_stats.json` 的 `memory_stripped` 字段（由备份 `book2.before-clean.json` 重跑生成）。

### 4.1b 【已修】memory 中部水印碎片 —— 2 条

首部删除后，第二段水印碎片暴露在正文中间：

| 天 | 单词 | 清洗前 | 清洗后 |
|---|---|---|---|
| D8 | threaten | `n e en 使得 ，` | `en 使得 ，` |
| D9 | vocational | `h S vocation 谐音：我开心 我开心有这份职业 ， ，` | `vocation 谐音：我开心 我开心有这份职业 ， ，` |

### 4.2 【已修】memory 整条纯碎屑 → 置空 —— 12 条

| 天 | 单词 | 原值 | 现值 |
|---|---|---|---|
| D7 | arrangement | `h e` | `` |
| D8 | courtship | `魔` | `` |
| D8 | locate | `e n` | `` |
| D8 | allocate | `S h` | `` |
| D8 | intricacy | `e n` | `` |
| D9 | aristocratic | `背` | `` |
| D9 | nobility | `h e` | `` |
| D9 | virtually | `h e` | `` |
| D10 | senator | `背 书` | `` |
| D10 | inevitable | `背 书` | `` |
| D10 | inevitably | `的` | `` |
| D10 | diffusionism | `S h` | `` |

> **这 12 条的原文记忆列本身就没有内容**（如 p41 `courtship` 行 x266 为空），置空是正确的，不是信息丢失。

### 4.3 【已修】word 与释义粘连 —— 2 条（PDF p45 跨页续页、无表格线）

| 天 | 清洗前 word | 清洗后 word | 清洗后 meaning |
|---|---|---|---|
| D8 | `spread传播，使分布，伸开v.` | `spread` | `传播，使分布，伸开v. 传播n.` |
| D8 | `widespread分布广的adj.` | `widespread` | `分布广的adj.` |

> 同时修正了串行：原 `spread` 的 meaning 混入了记忆列 `sp生平+read阅读…`，已还原，记忆内容回到 `memory` 字段。

### 4.4 【已修】并档词条（一行塞多个单词）—— 4 条 → 13 条

| 天 | 清洗前 word | 拆成 | 来源 |
|---|---|---|---|
| D2 | `support supporter supportive report opportunity` | 5 条 | p10 |
| D3 | `profitable benefit beneficial benefactor` | 4 条 | p16 |
| D4 | `potential potentially` | 2 条 | p22 |
| D5 | `qualified qualification` | 2 条 | p28 |

**这 4 条都是 PDF 的「跨页续页」单行（p10/p16/p22/p28 均只有 7–14 行），整张表格被压进一行。** 已按原文逐行回填：

| 单词 | 回填 meaning | 回填 memory | 页 |
|---|---|---|---|
| support | 支撑，支持，资助v.n. | sup下面 + port带 | p10 |
| supporter | 支持者n. | er人 | p10 |
| supportive | 给予支持的adj. | ive形容词，表有..性质的 | p10 |
| report | 报告v.n. | re回 + port带，把情报带回来 | p10 |
| opportunity | 机会n. | op面向 + port港口 + une形容词 + ity名词，面向港口的风 | p10 |
| profitable | 可盈利的，有益的adj. | able可以 | p16 |
| benefit | 获益v. 好处，保险金n. | bene好 + fit做，好好做事有好处 | p16 |
| beneficial | 有帮助的adj. | ial形容词 | p16 |
| benefactor | 赞助者n. | or表人，帮你更好做事情的人—赞助商 | p16 |
| potential | 潜在的adj. 潜在性n. | 潜在的可能性，表示自己的潜在能力和未来发展的可能性 | p22 |
| potentially | 潜在地adv. | ly副词 | p22 |
| qualified | 合格的，有资格的adj. | ed形容词 | p28 |
| qualification | 资格，条件n. | qual资质 + fic做 + ation名词，做事情的资质—资格 | p28 |

### 4.5 【已修】word 错解析 —— 1 条

| 天 | 原 word | 原 meaning | 修后 word | 修后 meaning | 页 |
|---|---|---|---|---|---|
| D10 | `i` | `复兴 文艺复兴时期` | `renaissance` | `复兴，文艺复兴时期n.` | p55 |

**根因**：p54 最后一行 `renaissance` 的释义被 PDF 内部拆成两个文本对象（`复兴` @x141、`文艺复兴时期n` @x171），解析器误把 `文艺复兴时期n` 的首字母 `i` 当成了单词。

### 4.6 【已修】meaning 串行 —— 2 条

见 §4.3（spread / widespread），已从原文还原。

### 4.7【未修·需知悉】标点统一化 —— 全局现象，非缺陷

JSON 里把原文的中文标点 `，` `。` `、` 统一替换成了半角空格，例如：

| 原文 | JSON |
|---|---|
| `趋势，倾向n.` | `趋势 倾向n ， .` |
| `抵制，耐力，阻力n.` | `抵制 耐力 阻力n ， ， .` |
| `ion名词，表动作，状态，物品` | `ion名词 表动作 状态 物品 ， ， ，` |

**判定**：这是**统一的、全局的**转换规则（10 天全部一致），不是局部错乱。不影响朗读与学习，且前端渲染按空格分词显示正常。**本次不清洗此项**（超出任务范围；若要改需同步改前端分词逻辑）。

> 若后续需要严格还原标点，可对 `meaning`/`memory`/`rootMeaning` 做一次反向映射：` ， ` → `，`、` . ` → `.`。**不建议在数据层单独做**，应连同 `extract-book2-v9.py` 与前端渲染一起改。

---

## 5. 未发现问题项（已核验）

| 检查项 | 结果 | 方法 |
|---|---|---|
| 音标串入 meaning | **0 条** | 严格 IPA 字符集扫描全字段（ˈˌːəʊɪæʌʃʒθðŋɡɒɜ） |
| 音标串入 word/root | **0 条** | 同上 |
| root 含中文残留 | **0 条** | CJK 正则扫描 root |
| root 含水印残留 | **0 条** | `Shen` / `魔法` 扫描 |
| 词条遗漏（天内重复） | **0 条** | 每天内 word 计数，无重复 |
| root 归属正确性 | 已抽验通过 | contend/attend/intend/extend→`tend/tent/tens`；social→`soci`；govern→`govern`；observation→`serv`；proceed→`ceed/cess` |
| 变体拼写 | **保留正确** | `favo(u)r` / `labour/labor` / `judg(e)ment` / `scrutinise/ize` 等均为原文写法，未改动 |

---

## 6. 不做处理项（需要知悉的已知限制）

### 6.1 单字母构词语素（4 条，**绝对不能删**）

| 天 | 单词 | memory | 说明 |
|---|---|---|---|
| D7 | agree | `a + gree绿色 ，谁同意你给他带一顶绿帽子的` | `a` 是前缀，`+ ` 后接词根 |
| D7 | amateur | `a + mate同事 + ur我们 ，同事总是调侃我们是业余的水平` | 同上 |
| D8 | academy | `a + cade（code代码）+my我 ，在学院里 ，我是一个学代码的学生` | 同上 |
| D10 | advantage | `a + d大 + van货车 + tage他哥 ，一辆大货车他哥开起来很有优势` | 同上 |

**清洗脚本已内置守卫 `_guard_prefix_letter()`**：单字母若为 `a/i/A/I/an/ad`、或以 `+` 接词根、或后接 ≥2 长度英文，一律保留。这 4 条**字节未动**，已写回归用例锁死。

### 6.2 memory 为空 109 条 —— 原文即空

| 天 | memory 空 | 原因 |
|---|---|---|
| D1–D4 | 0 | — |
| D5 | 3 | 原文记忆列为空 |
| D6 | 1 | 同上 |
| D7 | 12 | 同上（含 §4.2 置空的 1 条 `arrangement`，其原文记忆列也为空） |
| D8 | 30 | 原文记忆列为空 |
| D9 | 31 | 同上 |
| D10 | 32 | 同上 |
| **合计** | **109** | — |

**结论**：D8–D10 记忆列缺失比例高，是**原书第九、十天排版本身就没填记忆**，不是解析问题。

---

## 7. 幂等性验证

### 7.1 从原始备份一次性重跑（可复现性）

```text
输入: _backup/book2.before-clean.json (SHA256 6C0B276F…)
输出 MD5 = 6E39E7CF0BF704AFDD126B7B56092AC2
正式文件 MD5 = 6E39E7CF0BF704AFDD126B7B56092AC2
=> 完全一致，脚本可从零复现最终结果，不依赖任何中间状态
```

该次重跑的完整统计：

```text
总条数         : 1506 -> 1515
memory 首部碎屑: 113 条 (清空 12)
memory 中部水印: 2 条
word 含中文拆分: 2 条
并档词条拆分   : 4 条 -> 13 条 (未能从PDF取回 0 条)
word 非法修复  : 1 条  (D10 'i' -> 'renaissance')
meaning 为空   : 0
```

### 7.2 对已清洗文件重复运行

连续运行 `python scripts/clean-book2.py` 三次：

| 次 | 改动条数 | 序列化变更 | MD5 |
|---|---|---|---|
| R1 | 113+2+2+4+1 | True | `6E39E7CF0BF704AFDD126B7B56092AC2` |
| R2 | **0** | **False** | `6E39E7CF0BF704AFDD126B7B56092AC2` |
| R3 | **0** | **False** | `6E39E7CF0BF704AFDD126B7B56092AC2` |

```text
MD5 R1 = 6E39E7CF0BF704AFDD126B7B56092AC2
MD5 R2 = 6E39E7CF0BF704AFDD126B7B56092AC2
MD5 R3 = 6E39E7CF0BF704AFDD126B7B56092AC2
SHA256 = 47D85092B889EBA7E6E0F55631B21D3D21BE5A96B2011BC9A5EEB788F13F8ED1
```

**通过。** 第 2、3 次运行各改动项均为 0、`序列化变更 = False`，文件字节完全一致。

---

## 8. 安全阀

脚本内置三条自检，任一触发即 **exit 2 拒绝写盘**：

1. `meaning` 出现空值 → 拒绝写盘（防止 §4.4 类回归重演）
2. `root` / `rootMeaning` 被修改 → 脚本设计上根本不触碰这两个字段（与备份逐条比对 = 0 处改动）
3. 并档词从 PDF 取不回 → 保留原值 + 报告登记，绝不置空

---

## 9. 附：核对产物清单

| 文件 | 说明 |
|---|---|
| `scripts/clean-book2.py` | 清洗脚本（支持 `--dry-run`，幂等） |
| `scripts/verify-book2.py` | **最终验收脚本**（13 项声明 + 6 项红线，可重复运行） |
| `scripts/review-book2-report.md` | 本报告 |
| `scripts/_clean_book2_report.json` | 逐条改动明细（机器可读，最近一次运行） |
| `src/data/generated/_backup/book2.before-clean.json` | 清洗前备份（SHA256 `6C0B276F…`） |
| `scripts/_b2rev/sample.txt` | 150 条抽样对照全文（JSON vs PDF 原始行，含坐标） |
| `scripts/_b2rev/layout.txt` | 各页表头与列坐标（版式证据，§3 的判定依据） |
| `scripts/_b2rev/forensics13.txt` | 13 条 meaning 回填取证 |

### 最终验收输出

```text
A. 报告声明项 vs 文件实况
  PASS  总条数 = 1515 (期望 1515)
  PASS  12 条纯杂码已置空 (异常 0)
  PASS  spread: '传播，使分布，伸开v. 传播n.'
  PASS  widespread: '分布广的adj.'
  PASS  并档 13 条 meaning 已回填 (异常 0)
  PASS  renaissance: '复兴，文艺复兴时期n.'
  PASS  非法 word 'i' 已不存在: None
  PASS  tendency     'tend趋向+ency名词'
  PASS  extend       'ex向外+tend伸展'
  PASS  stake        '对比：state'
  PASS  hunt         'hurt受伤 猎物受伤 展开打猎搜寻 ， ，'
  PASS  threaten     'en 使得 ，'
  PASS  vocational   'vocation 谐音：我开心 我开心有这份职业 ， ，'

B. 全量红线
  meaning 空       : 0   PASS
  memory  空       : 109   (报告 109，原文即空)
  word 含中文      : 0   PASS
  word 含空格      : 0   PASS
  root 含中文/水印 : 0   PASS
  IPA 混入         : 0   PASS

  MD5: 6E39E7CF0BF704AFDD126B7B56092AC2
```
