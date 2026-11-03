# 书2 数据复核报告

- 复核对象：`F:\AcademicHub\word-books\src\data\generated\book2.json`（book=book2，10 天）
- 原文：`F:\AcademicHub\000资料相关\000考研\考研资料\英语\单词\核心单词速记_第1-10天_合集（打印版）.pdf`（55 页）
- 复核日期：2026-11-03
- 说明：本次只读核对，未修改任何数据文件。

## 结论

- 各天词条数：D1=194 D2=157 D3=184 D4=166 D5=161 D6=177 D7=150 D8=169 D9=135 D10=126，合计=1619（PDF 逐行 1620，其中第 55 页重复排印 1 行 `renaissance`；去重后 1619，差 0）
- 释义命中率：1619/1619 (100.00%)
- 词根串组：0 处（social/govern/observation/expand/tendency 五个指定词全部正确）
- root 混入记忆：0 处（未出现「记忆：」「联想：」「谐音：」）
- 三列区 root 非空：0 处（D8/D9/D10 的 root 与 rootMeaning 均为空字符串）
- 音标残留：0 处（U+0250–U+02AF 及 ˈ ˌ ː 等 IPA 符号均未出现）
- 水印残留：0 处（「Shen的背书魔法」未进入任何字段）
- 附加发现：root/rootMeaning 字段拆分缺陷 75 条（12 个词根组，非上述 6 项硬性检查），另有 1 条词根缺失，详见问题清单。

### 每日词条数明细

| 天 | PDF 页 | PDF 行数 | JSON 条数 | 差 |
|---|---|---|---|---|
| 1 | 1–5 | 194 | 194 | 0 |
| 2 | 6–10 | 157 | 157 | 0 |
| 3 | 11–16 | 184 | 184 | 0 |
| 4 | 17–22 | 166 | 166 | 0 |
| 5 | 23–28 | 161 | 161 | 0 |
| 6 | 29–34 | 177 | 177 | 0 |
| 7 | 35–39 | 150 | 150 | 0 |
| 8 | 40–45 | 169 | 169 | 0 |
| 9 | 46–50 | 135 | 135 | 0 |
| 10 | 51–55 | 127 | 126 | +1 |
| 合计 | 55 | 1620 | 1619 | +1（PDF 重复行，去重后 0） |

## 五个指定词根核对

| 单词 | 天 | 期望 root | JSON root | PDF 词根单元格 | 结果 |
|---|---|---|---|---|---|
| social | 1 | soci | soci | `soci 群体的 社会的 记忆：soc像500`（p1） | 正确 |
| govern | 1 | govern | govern | `govern 管理`（p1–2） | 正确 |
| observation | 1 | serv | serv | `serv 服务/保护`（p1） | 正确 |
| expand | 1 | pand/pans | pand/pans | `pand/pans 展开`（p1） | 正确 |
| tendency | 1 | tend/tent/tens | tend/tent/tens | `tend/tent/tens 伸展，趋向`（p1） | 正确 |

整体扫描：按 PDF 表头把 4 列区切成词根块，逐条比对 1619 条所在块的词根单元格文本，未发现将单词挂到其他词根组的情况（无「social→social」「observation→observ」一类串组）。仅 `profit` 一处属于表内边界词，见问题清单第 6 条。

## 问题清单

| 天 | 单词 | 问题 | 当前值 | 正确值 | PDF页码 |
|---|---|---|---|---|---|
| 10 | renaissance | PDF 第 54、55 页各排印 1 行（两行 memory 不同），JSON 合并为 1 条，导致 D10 计数 127 vs 126 | 126 条，memory 用「；」拼接两条记忆 | PDF 为 127 行（按单词去重 126；建议保留 1 条并说明） | 54–55 |
| 7 | contact | root 缺失；PDF 中该行属 `nect` 组（同组 connect/connection/disconnect） | root=""，rootMeaning="" | root="nect"，rootMeaning="连接" | 35 |
| 2 | company / accompany / companion | rootMeaning 为空；PDF 词根单元格为 `pany` + `谐音：陪你` | root="pany"，rootMeaning="" | rootMeaning="谐音：陪你"（3 条） | 6 |
| 7 | health / unhealthy / fit / fitness / wellbeing | root 存了中文、rootMeaning 为空；PDF 该词根单元格只写「健康」 | root="健康"，rootMeaning="" | root=""，rootMeaning="健康"（5 条） | 36 |
| 7 | power / powerful / strength / strengthen / energy / energetic / dynamics | root 存了中文、rootMeaning 为空；PDF 该词根单元格只写「力量」 | root="力量"，rootMeaning="" | root=""，rootMeaning="力量"（7 条） | 37 |
| 3 | profit | 词根归属与 PDF 表内位置不同：PDF 第 15 页末行在 `fic 做` 组，第 16 页起才是 `fit 做` 组 | root="fit"，rootMeaning="做" | 按 PDF 应为 fic/fect；若按词源 pro+fit 可保留，属边界词，不计串组 | 15 |
| 1–5 | 12 组共 75 条 | root 栏混入中文或英文释义，未按「root=英文部分、rootMeaning=中文部分」拆分，见下表 | 见下表 | root 只保留英文，中文移入 rootMeaning | 2–27 |

### 附：root 混入中文的 12 组（75 条）

| 当前 root | 当前 rootMeaning | 条数 | 天 | 页 | 建议拆分 |
|---|---|---|---|---|---|
| `gene 基因` | `gene 基因` | 11 | 1 | 2–3 | root=`gene`，rootMeaning=`基因` |
| `secut(e)跟随` | `secut(e)跟随` | 3 | 1 | 2 | root=`secut(e)`，rootMeaning=`跟随` |
| `side 旁边 =sit坐` | `side 旁边 =sit坐` | 5 | 2 | 8 | root=`side`，rootMeaning=`旁边 =sit坐` |
| `civ → city 城市` | `civ → city 城市` | 5 | 3 | 13 | root=`civ`，rootMeaning=`→ city 城市` |
| `estim =value价值` | `estim =value价值` | 3 | 4 | 18 | root=`estim`，rootMeaning=`=value价值` |
| `tru =true 相信，真实` | `tru =true 相信，真实` | 6 | 4 | 20 | root=`tru`，rootMeaning=`=true 相信，真实` |
| `mon =move 移动，交换` | `mon =move 移动，交换` | 4 | 4 | 21 | root=`mon`，rootMeaning=`=move 移动，交换` |
| `可能` | `可能` | 11 | 4 | 21–22 | root=""，rootMeaning=`可能` |
| `主要的` | `主要的` | 9 | 5 | 24 | root=""，rootMeaning=`主要的` |
| `gradu =grade 等级，步` | `gradu =grade 等级，步` | 6 | 5 | 27 | root=`gradu`，rootMeaning=`=grade 等级，步` |
| `健康` | （空） | 5 | 7 | 36 | root=""，rootMeaning=`健康` |
| `力量` | （空） | 7 | 7 | 37 | root=""，rootMeaning=`力量` |

合计 75 条。该问题不影响上述 6 项硬性检查的结论，但不符合「root/rootMeaning 按英文/中文拆分」的数据约定，建议统一清洗。

## 复核口径

1. **词条数**：用 PyMuPDF 取每页 span 坐标，按「单词」列（D1–D2 排除音标列）逐行聚类重建表格；跨页续表、无表头续页（如 p5、p10、p16、p22、p28、p34、p41）均按上一行连续处理；页内重复表头不计数。逐日单词多重集与 JSON 完全一致（仅 D10 的 `renaissance` 多 1 行）。
2. **释义**：把 55 页全文与每条 meaning 分别去掉所有空白字符后做子串匹配；1619 条全部命中。另做逐行单元格级复核，除 1 条标点差异（`renaissance` 的「，」和「.」来自 p55 版本）外均一致；4 条因 PDF 音标列文字溢出到中文列导致单元格边界噪声，全文匹配仍命中，非数据缺失。
3. **词根**：按表头 `词根/原型` 分块，取块内左侧词根单元格文本（含无表头的续页、跨页拆分的词根格），与 JSON 的 root/rootMeaning 做去空白子串比对，并人工核对 5 个指定词。
4. **三列区**：D8（p40–45）、D9（p46–50）、D10（p51–55）原文只有「单词/中文/联想记忆」三列，JSON 对应 root、rootMeaning 均为空，0 处例外。
5. **音标/水印/记忆标记**：遍历每条记录的 word、root、rootMeaning、meaning、memory 全文扫描；IPA 统一码段、IPA 修饰符、`Shen的背书魔法`、`记忆：/联想：/谐音：` 在 root 中均为 0。
