# word-books · 背单词

## 🚀 在线地址

**https://git-ys1.github.io/word-books/**

手机浏览器直接打开即可使用。推到 `master` 会自动构建发布。

---

纯前端背单词网页，手机优先。无后端，进度存在 localStorage，支持导出/导入 JSON 备份。

技术栈：**React 19 + Vite 7 + TypeScript 5.9 + Tailwind CSS 3.4**

---

## 快速开始

```bash
npm install
npm run dev      # http://127.0.0.1:5173
npm run build    # 产物在 dist/
npm run preview  # 预览构建产物
npm run selftest # 背诵引擎自检（16 项断言组）
npm run uitest   # UI 渲染冒烟测试
```

> Node 路径：`F:\CodeForge\Node\node.exe`；npm registry 已配 npmmirror。

---

## 部署到 Netlify

1. 推送到 GitHub 仓库
2. Netlify 后台 → Add new site → Import an existing project → 选 GitHub 仓库
3. 构建配置（`netlify.toml` 已写好，通常自动识别）：

| 项 | 值 |
| --- | --- |
| Build command | `npm run build` |
| Publish directory | `dist` |

4. Deploy，等待完成即可

无需任何环境变量或服务端函数。

---

## 两个词书

| 词书 | 来源 PDF | 分组方式 | 词数 |
| --- | --- | --- | --- |
| 考研词汇 5500（词根版） | `7天刷完5500讲义（全）.pdf` | 按词根块（467 组） | 3085 |
| 核心单词速记 | `核心单词速记_第1-10天_合集（打印版）.pdf` | 按天（10 天） | 1515 |

两本书的数据、进度、错词本**完全隔离**。

书1 有一个「散词区（无共同词根）」，是原书 `△单列` 区块的 329 个散词，前端单独成组并给了可读标题。

---

## 三种背诵模式

| 模式 | 队列构造 | 第一阶段底部 |
|---|---|---|
| `sequential` 完全顺序 | 严格按词书出现顺序（组序 + 组内序都不动） | 认识 / 不认识 |
| `groupShuffle` 组内随机 | 组间顺序固定，只在每组内部 Fisher–Yates 打乱；可指定起始组，前面的组保序接到末尾（**不漏词**） | 认识 / 不认识 |
| `fullRandom` 完全随机 | 全书打平后统一打乱 | **中文释义四选一**（不显示认识/不认识） |

分组来源：书1 按词根块（`△act=做；驱使`），书2 按天（第一天~第十天）。

---

## 拆解配色

第一阶段只给单词和词缀（右上角），点「拆解」才展开彩色拆解，先逼自己回忆。

| role | 含义 | 配色 |
| --- | --- | --- |
| `root` | 词根本体 | 蓝紫 |
| `affix` | 真词缀（re-、-tion） | 琥珀 |
| `meaning` | 中文释义 | 墨黑 |
| `latin` | 其它英文词素 | 青绿 |
| `cjk` | 中文提示 | 洋红 |
| `link` | 连接符 `=` `+` | 淡灰，弱化为内联符号不占色块 |

> 数据层已修正过一轮角色标注：早期提取脚本把所有非词根片段都标成 `affix`，
> 导致「做」「适应」这类中文释义被误当词缀。现由 `scripts/fix-book1-segments.py` 修正，
> `src/data/index.ts` 里还有一层兜底（中文一律纠为 `meaning`）。

---

## 「不认识」延后位置 = 8（可配置）

核心代码在 `src/engine/queue.ts` 的 `advance()`，理由已写进源码注释：

- 判定为不认识的词**不会立刻重问**（那是识别不是回忆），也**不丢队尾**（等太久，且末尾堆积让人有强烈挫败感），而是出队后插到剩余队列**第 N 个之后**。
- **N=8** 是三重折中：
  1. **记忆科学**：回忆失败后的最优学习期间隔大约落在「后续 5~10 项」；太短（1~2）时答案还在工作记忆里，测试没有区分度；太长（15+）时遗忘曲线已跌破 30%，重学成本上升。
  2. **工作区**：手机上单项 3~6 秒，8 项≈25~45 秒，"短期记忆仍热但需要主动回忆"的窗口。
  3. **产品**：每轮队列只膨胀约 12.5%，进度条稳定；N=3 会让同一词反复回锅、进度卡死。
- 边界：`clampRetryGap` 夹到 **2~20**。下限必须是 2——`gap=1` 等价于「插回队首」＝立刻重问，既不是间隔重复还会让进度卡死（这是自检脚本抓到并修掉的一个真实 bug）。
- 剩余词数不足 N 时落到队尾，永不丢词。

---

## 四选一

- 干扰项从**同一本词书**其它词条抽取。
- 剔除释义完全相同的候选，杜绝"两个正确答案"。
- 答对：进度 +1；答错：进度不变，该词延后（与第一阶段同一套 `advance()` 逻辑）。

---

## 完全随机模式的退出逻辑

只要 `wrongPool` 里还有没复习的错词：
- 点返回 → 弹窗把主操作改写为「先复习 N 个错词」，可显式选择「略过，直接退出」；
- 队列跑完后再进会话 → 自动进入错词复习（`inWrongReview` 标记，顶部显示"错词复习"徽标）。

---

## 数据接入约定

词书数据放在 `public/data/` 下，运行时 `fetch()` **按需加载**，不打进 JS 主包：

- `public/data/book1.json`
- `public/data/book2.json`

这样首屏只加载应用代码（约 **90KB gzip**），词书数据走 HTTP 缓存，第二次打开几乎瞬时。
（早期版本把 2.4MB 数据同步 import 进主包，主包 1MB+，手机上首屏很慢，已改掉。）

`src/data/index.ts` 做归一化与兜底：

- 文件存在且有效 → 用真实数据
- 加载失败或解析后无词条 → 自动回落到 `src/data/mock.ts`，首页打「示例」角标
- 拆解片段缺失 `segments` → 用「词根 + 释义」现场合成，保证「拆解」按钮永远有内容

数据字段：

```jsonc
{
  "word": "trend",
  "root": "tend/tent/tens",   // 词根（原书「词根/原型」列）
  "rootMeaning": "伸展 趋向",   // 词根中文含义
  "meaning": "趋势n.",          // 单词释义
  "memory": "对比：tend趋向"    // 记忆技巧
}
```

---

## 数据提取

```bash
# 书1：484 页，含康熙部首字形规范化
python scripts/extract-book1.py

# 书2：55 页，基于 PyMuPDF find_tables
python scripts/extract-book2-v9.py
python scripts/clean-book2.py            # 清洗水印碎屑、拆并档词条
python scripts/fix-cn-punct.py           # 还原被 PDF 拆散的中文标点
```

两本 PDF 都有各自的坑，脚本里用中文注释写明了踩坑过程：

- **书1**：PDF 用 CJK 部首字符冒充汉字（1855 处）。NFKC 只能修康熙部首区（U+2F00–U+2FDF），U+2E80–U+2EFF 区需手工映射（⻓→长、⻔→门等 17 个）。最终残留必须为 0。
- **书1 折行误判（最坑）**：原逻辑只看「行右端 x1 ≥ 900」就认定是折行、去吃下一行。但长词条本身也常顶到 900+，结果把下一行的完整词条整条吞掉，其后所有释义**整体错位一条**（`clone` 显示"决定性的"、`household` 显示"幽默"）。修法是加 `ends_complete()`：以汉字/标点/词性缩写结尾的行视为「已写完」，不再拼接。修好后折行拼接从 71 次降到 2 次，词条从 3051 增加到 3085。
- **书1 多词条切分**：`caption=n.标题  capacity=n.容量 captious=a.吹毛求疵的` 一行三个词条，分隔符有 2 空格也有 1 空格。判据不能用空格数量，要看右侧是否是「词+等号+词性缩写」；而且补切必须对每段递归做。踩坑点：在 `capacity=n.容量 captious=` 里抓左侧英文会抓到词性 `n`，被误判成"这不是新词条"而跳过——必须先判左侧是否以汉字收尾。
- **书2**：
  - 一页内可能有 2~3 张独立的表，必须用表头行切块，不能跨块复用
  - 表格线不完整：有的页 5 列全网格，有的只剩几条竖线，有的完全没有线
  - 页脚水印「Shen的背书魔法」会渗进单元格，**只能删完整词组，绝不能按单字删**——否则 `extend` 会被吃成 `xtend`
  - 第 8 天起出版社取消了「词根/原型」列，改成 3 列，`root` 为空是忠于原文

---

## 目录结构

```
src/
├── types.ts                    数据结构契约（Book/WordEntry/SessionState...）
├── App.tsx                     页面切换、会话、退出逻辑、异步加载词书
├── main.tsx                    入口
├── index.css                   Tailwind 三层 + 全局基础样式
├── engine/queue.ts             背诵引擎（纯函数，全部可测）
├── data/
│   ├── index.ts                数据接入 + 归一化 + segments 纠偏 + mock 回落
│   ├── mock.ts                 模拟词书
│   └── generated/              真实数据（提取脚本产出）
├── hooks/
│   ├── usePersistentState.ts   localStorage 持久化（防抖 + 切后台落盘）
│   └── useStats.ts             学习统计与错词本
└── components/
    ├── Home.tsx                选书 → 选模式 → 选起始组（含统计卡片）
    ├── ReciteSession.tsx       第一阶段（拆解）+ 第二阶段（四选一）
    ├── Breakdown.tsx           彩色拆解展示
    ├── roleStyle.ts            角色配色表
    ├── BookBrowser.tsx         离线浏览词书（搜索、按组展开）
    ├── WrongBook.tsx           错词本
    ├── SettingsSheet.tsx       设置抽屉（延后位、自动展开、震动、导出导入）
    └── ExitDialog.tsx          退出确认 / 转错词复习
public/data/                    词书 JSON（运行时按需加载）
scripts/                        提取、清洗、自检、E2E 脚本
```

---

## 校验

```bash
npm run selftest          # 引擎 16 项断言组
npx tsc -b                # 类型检查
python scripts/e2e_features.py <url> <out_dir>   # 真实 Chrome 手机端全流程
```

E2E 用 CDP `Emulation.setDeviceMetricsOverride` 固定 390×844 真实视口，
会检查每页 `scrollWidth > innerWidth` 是否溢出。
（注意：Chrome `--window-size=390,844` 并不可靠，实际 innerWidth 可能是 500，必须用 CDP 覆盖。）

---

## UI 说明

- 手机优先：安全区适配（`env(safe-area-inset-*)`），禁用长按选中与双击缩放。
- 桌面端：`.app-shell` 最大宽度 `640px` 居中，卡片带柔和投影。
- 配色：白底 + 墨灰按钮（`ink-*`）+ 蓝紫主色（`brand-*`）。

---

## 已知边界

1. **不生成原书没有的内容**：第 8-10 天原文无词根列，`root` 为空是忠于原文；书1 的 329 个散词本来就没有共同词根。
2. **变体拼写**：`favo(u)r`、`judg(e)ment` 等是牛津变体写法，按原文保留。
3. **`src/types.ts` 零字节**：只导出类型，被 TS 完全擦除，构建产物里不出现，属正常现象。
4. 不含音标、例句、语音（按需求明确排除）。
5. 进度存本地浏览器，清缓存会丢，用导出/导入 JSON 备份。
