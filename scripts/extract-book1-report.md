# book1 提取报告：7天刷完考研词汇5500 讲义

- 源文件：`F:\AcademicHub\000资料相关\000考研\考研资料\英语\单词\7天刷完5500讲义（全）.pdf`
- 页数：484
- 输出：`F:\AcademicHub\word-books\src\data\generated\book1.json`
- 生成脚本：`F:\AcademicHub\word-books\scripts\extract-book1.py`

## 1. 自检总览

| 指标 | 数值 |
| --- | --- |
| 词根块总数 | **467** |
| 词条总数 | **3085** |
| 空释义条数 | 1 |
| 重复词条数（小写词去重后仍重复的词） | 46 |
| 字形异常残留字符 | **0** |
| 无法解析的行 | 2 |
| 原始行（去页眉/空行） | 3637 |
| 丢弃页眉行 | 483 |
| △ 行总数 / 去重后词根块 | 511 / 467 |
| 折行拼接处数 | 2 |
| segments role 非法条数 | 0 |
| 空词根块 | 0 |

## 2. 字形规范化（重点）

PDF 用 CJK 部首充当汉字，共 103 种 1855 处：

- **U+2F00–U+2FDF（康熙部首）**：86 种 1695 处，`unicodedata.normalize("NFKC", s)` 可完全修复
- **U+2E80–U+2EFF（CJK 部首补充）**：17 种 160 处，**NFKC 不转换，必须手工映射**，见下表

处理顺序：手工映射部首补充区 → NFKC → 输出后整份 JSON 再扫一遍 2E80–2FDF / F900–FAFF。

**最终残留：0 处（要求为 0）**

| 原字符 | 码位 | 规范字 |
| --- | --- | --- |
| ⺟ | `0x2e9f` | 母 |
| ⺠ | `0x2ea0` | 民 |
| ⻄ | `0x2ec4` | 西 |
| ⻅ | `0x2ec5` | 见 |
| ⻆ | `0x2ec6` | 角 |
| ⻋ | `0x2ecb` | 车 |
| ⻓ | `0x2ed3` | 长 |
| ⻔ | `0x2ed4` | 门 |
| ⻘ | `0x2ed8` | 青 |
| ⻛ | `0x2edb` | 风 |
| ⻜ | `0x2edc` | 飞 |
| ⻝ | `0x2edd` | 食 |
| ⻢ | `0x2ee2` | 马 |
| ⻣ | `0x2ee3` | 骨 |
| ⻦ | `0x2ee6` | 鸟 |
| ⻨ | `0x2ee8` | 麦 |
| ⻮ | `0x2eee` | 齿 |
| ⻰ | `0x2ef0` | 龙 |

## 3. 折行拼接明细（2 处）

长词条被自动折行：首行右端 ≥ x=900，续行从左边距另起（同页下一行，或下一页顶部）。
不拼接会产生「传」「星人」「乐专辑」这类碎片行，必须合并。

| 页码 | 首行片段 | 续行 |
| --- | --- | --- |
| p3 | `counteract=counter+act=相反+做=v.对抗;抵消 offset` | `neutralize` |
| p235 | `minus=min+us=小+n.=conj.prep.adj.减(的);减去 n.负号 plus` | `minister=mini+st+er=小+站+n.=n.大臣;部长` |

## 4. 无法解析的行（2）

| 页码 | 原文 | 原因 |
| --- | --- | --- |
| 174 | `+知道+v.=v.认识` | no_entry_parsed |
| 455 | `vis+ual=看+a.=a.视觉的;看得见的` | no_entry_parsed |

## 5. 解析告警（133）

| 页码 | 类型 | 内容 |
| --- | --- | --- |
| 7 | bad_word_head | `{"type": "bad_word_head", "chunk": "传", "head": "传", "page": 7}` |
| 7 | bad_word_head | `{"type": "bad_word_head", "chunk": "传", "head": "传", "page": 7}` |
| 7 | continuation_merged | `{"type": "continuation_merged", "page": 7, "word": "autobiography", "merged": "传"}` |
| 9 | bad_word_head | `{"type": "bad_word_head", "chunk": "星人", "head": "星人", "page": 9}` |
| 9 | bad_word_head | `{"type": "bad_word_head", "chunk": "星人", "head": "星人", "page": 9}` |
| 9 | continuation_merged | `{"type": "continuation_merged", "page": 9, "word": "alien", "merged": "星人"}` |
| 20 | bad_word_head | `{"type": "bad_word_head", "chunk": "乐专辑", "head": "乐专辑", "page": 20}` |
| 20 | bad_word_head | `{"type": "bad_word_head", "chunk": "乐专辑", "head": "乐专辑", "page": 20}` |
| 20 | continuation_merged | `{"type": "continuation_merged", "page": 20, "word": "album", "merged": "乐专辑"}` |
| 28 | bad_word_head | `{"type": "bad_word_head", "chunk": "年", "head": "年", "page": 28}` |
| 28 | bad_word_head | `{"type": "bad_word_head", "chunk": "年", "head": "年", "page": 28}` |
| 28 | continuation_merged | `{"type": "continuation_merged", "page": 28, "word": "adolescent", "merged": "年"}` |
| 29 | bad_word_head | `{"type": "bad_word_head", "chunk": "糊的", "head": "糊的", "page": 29}` |
| 29 | bad_word_head | `{"type": "bad_word_head", "chunk": "糊的", "head": "糊的", "page": 29}` |
| 29 | continuation_merged | `{"type": "continuation_merged", "page": 29, "word": "ambiguous", "merged": "糊的"}` |
| 43 | bad_word_head | `{"type": "bad_word_head", "chunk": "=生物+化学+n.+n.=n.生物化学", "head": "", "page": 43}` |
| 43 | bad_word_head | `{"type": "bad_word_head", "chunk": "=生物+化学+n.+n.=n.生物化学", "head": "", "page": 43}` |
| 43 | continuation_merged | `{"type": "continuation_merged", "page": 43, "word": "biochemistry", "merged": "生物+化学+n.+n.=n.生物化学"}` |
| 47 | bad_word_head | `{"type": "bad_word_head", "chunk": "开账单", "head": "开账单", "page": 47}` |
| 47 | bad_word_head | `{"type": "bad_word_head", "chunk": "开账单", "head": "开账单", "page": 47}` |
| 47 | continuation_merged | `{"type": "continuation_merged", "page": 47, "word": "bill", "merged": "开账单"}` |
| 51 | bad_word_head | `{"type": "bad_word_head", "chunk": "=n.(药物)胶囊;太空舱", "head": "", "page": 51}` |
| 51 | bad_word_head | `{"type": "bad_word_head", "chunk": "=n.(药物)胶囊;太空舱", "head": "", "page": 51}` |
| 51 | continuation_merged | `{"type": "continuation_merged", "page": 51, "word": "capsule", "merged": "n.(药物)胶囊;太空舱"}` |
| 94 | bad_word_head | `{"type": "bad_word_head", "chunk": "格;特性;人物角色", "head": "格;特性;人物角色", "page": 94}` |
| 94 | bad_word_head | `{"type": "bad_word_head", "chunk": "格;特性;人物角色", "head": "格;特性;人物角色", "page": 94}` |
| 94 | continuation_merged | `{"type": "continuation_merged", "page": 94, "word": "character", "merged": "格;特性;人物角色"}` |
| 106 | bad_word_head | `{"type": "bad_word_head", "chunk": "品", "head": "品", "page": 106}` |
| 106 | bad_word_head | `{"type": "bad_word_head", "chunk": "品", "head": "品", "page": 106}` |
| 106 | continuation_merged | `{"type": "continuation_merged", "page": 106, "word": "duplicate", "merged": "品"}` |
| 108 | bad_word_head | `{"type": "bad_word_head", "chunk": "病", "head": "病", "page": 108}` |
| 108 | bad_word_head | `{"type": "bad_word_head", "chunk": "病", "head": "病", "page": 108}` |
| 108 | continuation_merged | `{"type": "continuation_merged", "page": 108, "word": "epidemic", "merged": "病"}` |
| 112 | root_meaning_conflict | `{"type": "root_meaning_conflict", "page": 112, "root": "dec", "kept": "美", "ignored": "十"}` |
| 113 | bad_word_head | `{"type": "bad_word_head", "chunk": "湿;抑制", "head": "湿;抑制", "page": 113}` |
| 113 | bad_word_head | `{"type": "bad_word_head", "chunk": "湿;抑制", "head": "湿;抑制", "page": 113}` |
| 113 | continuation_merged | `{"type": "continuation_merged", "page": 113, "word": "damp", "merged": "湿;抑制"}` |
| 121 | bad_word_head | `{"type": "bad_word_head", "chunk": "现", "head": "现", "page": 121}` |
| 121 | bad_word_head | `{"type": "bad_word_head", "chunk": "现", "head": "现", "page": 121}` |
| 121 | continuation_merged | `{"type": "continuation_merged", "page": 121, "word": "present", "merged": "现"}` |
| 122 | bad_word_head | `{"type": "bad_word_head", "chunk": "趣", "head": "趣", "page": 122}` |
| 122 | bad_word_head | `{"type": "bad_word_head", "chunk": "趣", "head": "趣", "page": 122}` |
| 122 | continuation_merged | `{"type": "continuation_merged", "page": 122, "word": "interest", "merged": "趣"}` |
| 122 | bad_word_head | `{"type": "bad_word_head", "chunk": "品", "head": "品", "page": 122}` |
| 122 | bad_word_head | `{"type": "bad_word_head", "chunk": "品", "head": "品", "page": 122}` |
| 122 | continuation_merged | `{"type": "continuation_merged", "page": 122, "word": "essential", "merged": "品"}` |
| 126 | bad_word_head | `{"type": "bad_word_head", "chunk": "的", "head": "的", "page": 126}` |
| 126 | bad_word_head | `{"type": "bad_word_head", "chunk": "的", "head": "的", "page": 126}` |
| 126 | continuation_merged | `{"type": "continuation_merged", "page": 126, "word": "embryo", "merged": "的"}` |
| 146 | bad_word_head | `{"type": "bad_word_head", "chunk": "必要的", "head": "必要的", "page": 146}` |
| 146 | bad_word_head | `{"type": "bad_word_head", "chunk": "必要的", "head": "必要的", "page": 146}` |
| 146 | continuation_merged | `{"type": "continuation_merged", "page": 146, "word": "superfluous", "merged": "必要的"}` |
| 169 | bad_word_head | `{"type": "bad_word_head", "chunk": "的", "head": "的", "page": 169}` |
| 169 | bad_word_head | `{"type": "bad_word_head", "chunk": "的", "head": "的", "page": 169}` |
| 169 | continuation_merged | `{"type": "continuation_merged", "page": 169, "word": "centigrade", "merged": "的"}` |
| 174 | bad_word_head | `{"type": "bad_word_head", "chunk": "+知道+v.=v.认识", "head": "+知道+v.", "page": 174}` |
| 174 | bad_word_head | `{"type": "bad_word_head", "chunk": "+知道+v.=v.认识", "head": "+知道+v.", "page": 174}` |
| 216 | bad_word_head | `{"type": "bad_word_head", "chunk": "预赛", "head": "预赛", "page": 216}` |
| 216 | bad_word_head | `{"type": "bad_word_head", "chunk": "预赛", "head": "预赛", "page": 216}` |
| 216 | continuation_merged | `{"type": "continuation_merged", "page": 216, "word": "preliminary", "merged": "预赛"}` |
| 218 | root_meaning_conflict | `{"type": "root_meaning_conflict", "page": 218, "root": "lect lig leg", "kept": "选择", "ignored": "选;说"}` |
| 224 | bad_word_head | `{"type": "bad_word_head", "chunk": "的 v.使松懈", "head": "的 v.使松懈", "page": 224}` |
| 224 | bad_word_head | `{"type": "bad_word_head", "chunk": "的 v.使松懈", "head": "的 v.使松懈", "page": 224}` |
| 224 | continuation_merged | `{"type": "continuation_merged", "page": 224, "word": "loose", "merged": "的 v.使松懈"}` |
| 245 | bad_word_head | `{"type": "bad_word_head", "chunk": "面", "head": "面", "page": 245}` |
| 245 | bad_word_head | `{"type": "bad_word_head", "chunk": "面", "head": "面", "page": 245}` |
| 245 | continuation_merged | `{"type": "continuation_merged", "page": 245, "word": "dimension", "merged": "面"}` |
| 267 | bad_word_head | `{"type": "bad_word_head", "chunk": "变窄", "head": "变窄", "page": 267}` |
| 267 | bad_word_head | `{"type": "bad_word_head", "chunk": "变窄", "head": "变窄", "page": 267}` |
| 267 | continuation_merged | `{"type": "continuation_merged", "page": 267, "word": "narrow", "merged": "变窄"}` |
| 269 | multiword_head | `{"type": "multiword_head", "chunk": "op opt=光", "head": "op opt", "page": 269}` |
| 269 | multiword_head | `{"type": "multiword_head", "chunk": "op opt=光", "head": "op opt", "page": 269}` |
| 271 | bad_word_head | `{"type": "bad_word_head", "chunk": "属", "head": "属", "page": 271}` |
| 271 | bad_word_head | `{"type": "bad_word_head", "chunk": "属", "head": "属", "page": 271}` |
| 271 | continuation_merged | `{"type": "continuation_merged", "page": 271, "word": "subordinate", "merged": "属"}` |
| 277 | bad_word_head | `{"type": "bad_word_head", "chunk": "ad.在国外;在海外", "head": "ad.在国外;在海外", "page": 277}` |
| 277 | bad_word_head | `{"type": "bad_word_head", "chunk": "ad.在国外;在海外", "head": "ad.在国外;在海外", "page": 277}` |
| 277 | continuation_merged | `{"type": "continuation_merged", "page": 277, "word": "overseas", "merged": "ad.在国外;在海外"}` |
| 278 | bad_word_head | `{"type": "bad_word_head", "chunk": "物", "head": "物", "page": 278}` |
| 278 | bad_word_head | `{"type": "bad_word_head", "chunk": "物", "head": "物", "page": 278}` |
| 278 | continuation_merged | `{"type": "continuation_merged", "page": 278, "word": "offspring", "merged": "物"}` |
| 293 | bad_word_head | `{"type": "bad_word_head", "chunk": "分开", "head": "分开", "page": 293}` |
| 293 | bad_word_head | `{"type": "bad_word_head", "chunk": "分开", "head": "分开", "page": 293}` |
| 293 | continuation_merged | `{"type": "continuation_merged", "page": 293, "word": "separate", "merged": "分开"}` |
| 312 | bad_word_head | `{"type": "bad_word_head", "chunk": "的", "head": "的", "page": 312}` |
| 312 | bad_word_head | `{"type": "bad_word_head", "chunk": "的", "head": "的", "page": 312}` |
| 312 | continuation_merged | `{"type": "continuation_merged", "page": 312, "word": "appropriate", "merged": "的"}` |
| 317 | bad_word_head | `{"type": "bad_word_head", "chunk": "似的;大约的", "head": "似的;大约的", "page": 317}` |
| 317 | bad_word_head | `{"type": "bad_word_head", "chunk": "似的;大约的", "head": "似的;大约的", "page": 317}` |
| 317 | continuation_merged | `{"type": "continuation_merged", "page": 317, "word": "approximate", "merged": "似的;大约的"}` |
| 324 | bad_word_head | `{"type": "bad_word_head", "chunk": "=喝", "head": "", "page": 324}` |
| 324 | bad_word_head | `{"type": "bad_word_head", "chunk": "=喝", "head": "", "page": 324}` |
| 324 | continuation_merged | `{"type": "continuation_merged", "page": 324, "word": "potential", "merged": "喝"}` |
| 355 | bad_word_head | `{"type": "bad_word_head", "chunk": "的", "head": "的", "page": 355}` |
| 355 | bad_word_head | `{"type": "bad_word_head", "chunk": "的", "head": "的", "page": 355}` |
| 355 | continuation_merged | `{"type": "continuation_merged", "page": 355, "word": "restless", "merged": "的"}` |
| 366 | bad_word_head | `{"type": "bad_word_head", "chunk": "点", "head": "点", "page": 366}` |
| 366 | bad_word_head | `{"type": "bad_word_head", "chunk": "点", "head": "点", "page": 366}` |
| 366 | continuation_merged | `{"type": "continuation_merged", "page": 366, "word": "perspective", "merged": "点"}` |
| 368 | bad_word_head | `{"type": "bad_word_head", "chunk": "看→种类", "head": "看→种类", "page": 368}` |
| 368 | bad_word_head | `{"type": "bad_word_head", "chunk": "看→种类", "head": "看→种类", "page": 368}` |
| 368 | continuation_merged | `{"type": "continuation_merged", "page": 368, "word": "conspicuous", "merged": "看→种类"}` |
| 412 | bad_word_head | `{"type": "bad_word_head", "chunk": "v.使丢脸", "head": "v.使丢脸", "page": 412}` |
| 412 | bad_word_head | `{"type": "bad_word_head", "chunk": "v.使丢脸", "head": "v.使丢脸", "page": 412}` |
| 412 | continuation_merged | `{"type": "continuation_merged", "page": 412, "word": "shame", "merged": "v.使丢脸"}` |
| 426 | bad_word_head | `{"type": "bad_word_head", "chunk": "演", "head": "演", "page": 426}` |
| 426 | bad_word_head | `{"type": "bad_word_head", "chunk": "演", "head": "演", "page": 426}` |
| 426 | continuation_merged | `{"type": "continuation_merged", "page": 426, "word": "portray", "merged": "演"}` |
| 434 | bad_word_head | `{"type": "bad_word_head", "chunk": "的", "head": "的", "page": 434}` |
| 434 | bad_word_head | `{"type": "bad_word_head", "chunk": "的", "head": "的", "page": 434}` |
| 434 | continuation_merged | `{"type": "continuation_merged", "page": 434, "word": "contagious", "merged": "的"}` |
| 436 | bad_word_head | `{"type": "bad_word_head", "chunk": "的;同时代的 n.同代人", "head": "的;同时代的 n.同代人", "page": 436}` |
| 436 | bad_word_head | `{"type": "bad_word_head", "chunk": "的;同时代的 n.同代人", "head": "的;同时代的 n.同代人", "page": 436}` |
| 436 | continuation_merged | `{"type": "continuation_merged", "page": 436, "word": "contemporary", "merged": "的;同时代的 n.同代人"}` |
| 444 | bad_word_head | `{"type": "bad_word_head", "chunk": "完全地", "head": "完全地", "page": 444}` |
| 444 | bad_word_head | `{"type": "bad_word_head", "chunk": "完全地", "head": "完全地", "page": 444}` |
| 444 | continuation_merged | `{"type": "continuation_merged", "page": 444, "word": "thoroughly", "merged": "完全地"}` |
| 445 | bad_word_head | `{"type": "bad_word_head", "chunk": "旷日持久的", "head": "旷日持久的", "page": 445}` |
| 445 | bad_word_head | `{"type": "bad_word_head", "chunk": "旷日持久的", "head": "旷日持久的", "page": 445}` |
| 445 | continuation_merged | `{"type": "continuation_merged", "page": 445, "word": "time-comsuming", "merged": "旷日持久的"}` |
| 455 | bad_word_head | `{"type": "bad_word_head", "chunk": "vis+ual=看+a.=a.视觉的;看得见的", "head": "vis+ual", "page": 455}` |
| 455 | bad_word_head | `{"type": "bad_word_head", "chunk": "vis+ual=看+a.=a.视觉的;看得见的", "head": "vis+ual", "page": 455}` |
| 458 | bad_word_head | `{"type": "bad_word_head", "chunk": "见证", "head": "见证", "page": 458}` |
| 458 | bad_word_head | `{"type": "bad_word_head", "chunk": "见证", "head": "见证", "page": 458}` |
| 458 | continuation_merged | `{"type": "continuation_merged", "page": 458, "word": "witness", "merged": "见证"}` |
| 478 | bad_word_head | `{"type": "bad_word_head", "chunk": "物", "head": "物", "page": 478}` |
| 478 | bad_word_head | `{"type": "bad_word_head", "chunk": "物", "head": "物", "page": 478}` |
| 478 | continuation_merged | `{"type": "continuation_merged", "page": 478, "word": "volatile", "merged": "物"}` |
| 482 | bad_word_head | `{"type": "bad_word_head", "chunk": "的", "head": "的", "page": 482}` |
| 482 | bad_word_head | `{"type": "bad_word_head", "chunk": "的", "head": "的", "page": 482}` |
| 482 | continuation_merged | `{"type": "continuation_merged", "page": 482, "word": "worthwhile", "merged": "的"}` |
| - | dropped_letter_tab | `{"type": "dropped_letter_tab", "root": "单列", "word": "C", "reason": "单字母页签，非单词"}` |
| - | dropped_letter_tab | `{"type": "dropped_letter_tab", "root": "单列", "word": "Y", "reason": "单字母页签，非单词"}` |

## 6. 空释义词条（1）

- [astro aster] catastrophe

## 7. 重复词条（46）

说明：同一单词在不同词根块下重复出现是本书固有结构（如 bio / graph 两组都收 biography），保留。

- `account` × 2（词根块：count、单列）
- `adolescent` × 2（词根块：olesc、单列）
- `airline` × 2（词根块：air、line）
- `analysis` × 2（词根块：lys、单列）
- `analyze` × 2（词根块：lys、单列）
- `anniversary` × 2（词根块：ann enn、vers vert）
- `antique` × 2（词根块：antiqu、单列）
- `arrest` × 2（词根块：st(it)(ut) sist stant stin、单列）
- `atmosphere` × 2（词根块：atmo、sphere）
- `automobile` × 2（词根块：aut(o)、mob mot mov）
- `beneficial` × 2（词根块：bene、fact feas fic fig）
- `benefit` × 2（词根块：bene、fact feas fic fig）
- `biocide` × 2（词根块：bio、cid cis）
- `biographer` × 2（词根块：bio、graph gram）
- `biographical` × 2（词根块：bio、graph gram）
- `biography` × 2（词根块：bio、graph gram）
- `cancer` × 2（词根块：cancer）
- `centigrade` × 2（词根块：cent、grad(i)(u)）
- `circuit` × 2（词根块：circul cycl、it）
- `company` × 2（词根块：pan、单列）
- `concert` × 2（词根块：cern cert cret、单列）
- `devote` × 2（词根块：vot、单列）
- `discard` × 2（词根块：chart card、单列）
- `entire` × 2（词根块：tire、单列）
- `equivalent` × 2（词根块：equ iqu、vail val(u)）
- `headline` × 2（词根块：head、line）
- `hydrogen` × 2（词根块：gen(e)(r) geni、hydro）
- `manufacture` × 2（词根块：fact feas fic fig、man manu）
- `pardon` × 2（词根块：don dot dit dow、par）
- `participate` × 2（词根块：cap(t) cep(t) ceive cip cup、part）
- `passport` × 2（词根块：pass、port）
- `possess` × 2（词根块：(s)ent ess est、pow poss）
- `pregnant` × 2（词根块：gen(e)(r) geni、单列）
- `quality` × 2（词根块：fact feas fic fig、单列）
- `recognize` × 2（词根块：cogn、gnor gnos(t)）
- `relate` × 2（词根块：lat、单列）
- `retire` × 2（词根块：tire、单列）
- `sacrifice` × 2（词根块：fact feas fic fig、sacri sanct）
- `satisfaction` × 2（词根块：fact feas fic fig、sat satis satur）
- `scan` × 2（词根块：scan、单列）
- `simplify` × 2（词根块：simil simult sembl、单列）
- `splendid` × 2（词根块：splend、单列）
- `surround` × 2（词根块：und、单列）
- `symbol` × 2（词根块：ball bol、单列）
- `uniform` × 2（词根块：form、uni）
- `urban` × 2（词根块：urb、单列）

## 8. 空词根块

无。

## 9. 词根块前 60 个

- `act` = 做;驱使（18 词）
- `apt ept` = 适应（6 词）
- `art` = 基于人类劳动的技巧（7 词）
- `aut(o)` = 自己（8 词）
- `ac(ro)(u)(erb)(et)` = 酸→尖刻（5 词）
- `al(ter)(n)` = 改变;其他（4 词）
- `arbit(r)` = 判断（4 词）
- `audi audit` = 听（3 词）
- `ag ass` = 做（6 词）
- `abl abili` = 能（3 词）
- `abol` = 消除 废除（3 词）
- `am(or)(at)` = 爱（3 词）
- `astro aster` = 星星（4 词）
- `arm` = 武器（3 词）
- `atmo` = 空气（2 词）
- `ann enn` = 年（2 词）
- `aug auct auth` = 提高;增加（6 词）
- `anc ank ang` = 弯;钩（2 词）
- `alb` = 白色（1 词）
- `anx` = 苦恼（2 词）
- `arch` = 拱形→统治（3 词）
- `alcohol` = 酒精（2 词）
- `athl` = 竞赛（2 词）
- `angle` = 角（2 词）
- `alt` = 高（1 词）
- `air` = 空气（4 词）
- `arct` = 熊（2 词）
- `antiqu` = 前（1 词）
- `af of off awk` = 离开（5 词）
- `单列` = 单列词（无共同词根）（340 词）
- `bas` = 基础（7 词）
- `bat but` = 打击（6 词）
- `ban` = 禁止（3 词）
- `brev bridg` = 短（5 词）
- `ball bol` = 抛;舞;球（7 词）
- `bid` = 要求（2 词）
- `bit` = 咬（3 词）
- `body` = 身体（1 词）
- `bar` = 横木→障碍（7 词）
- `bacterium` = 微生物（1 词）
- `bene` = 好（2 词）
- `burs` = 钱包（1 词）
- `blanc` = 白（1 词）
- `broch` = 缝（1 词）
- `beaut` = 美好（2 词）
- `bath` = 变热（2 词）
- `bur` = 带来（1 词）
- `bomb` = 拟声爆炸的声音（1 词）
- `bio` = 生物;生命（9 词）
- `botan` = 草（2 词）
- `band bond` = 捆绑（3 词）
- `bon` = 好（1 词）
- `cap(t) cep(t) ceive cip cup` = 抓（33 词）
- `cap(it) cipit cab` = 头（7 词）
- `ced ceed cess` = 走（22 词）
- `cre creas cret` = 生长（16 词）
- `cur curs cour cours` = run→发生;关心（16 词）
- `cad cas cid cay` = 降临（12 词）
- `circul cycl` = 圆 环（12 词）
- `clos clud clus` = 关闭（10 词）

## 10. 单列区（无共同词根的杂词）

PDF 中 `△单列` 标记的区块不是词根，收的是无法归类的散词，单独成一个 rootGroup（root=`单列`）。
若前端不需要，可按下述清单单独处理：

- 词条数：340
