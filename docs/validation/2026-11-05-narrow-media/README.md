# 窄窗口点「素材」：面板不再跑出页面（2026-11-05）

VV 在 #148 复看时发现：窗口宽 360 px 时点「素材」，素材面板挤在播放器右边，筛选框 x 281→401、排序框 405→483、方向按钮 487→513，都在页面外。main 上就有。

检查：`desktop/narrow-media-smoke.cjs`，隐藏的离屏窗口，全新 profile；360×640 和 630×460，中文和英文，简单和高级，点「素材」以后面板和面板里每个看得见的控件都要 left ≥ 0、right ≤ innerWidth。截图只截这个窗口自己的页面（`capturePage`）。

| 文件 | 内容 |
|---|---|
| `before.txt` / `after.txt` | 改前（main 的 style.css）/ 改后的 smoke 输出：改前 `NARROW_MEDIA_FAIL 4 of 8 cases`（360 的 4 种都失败，面板在 272→522），改后 `NARROW_MEDIA_PASS 8 cases`（360 时面板在 6→354） |
| `before-360-*.png` / `after-360-*.png` | 360×640 点「素材」后，中文和英文 |
| `before-1283-*.png` / `after-1283-*.png` | 1283×800 桌面宽度，改前改后 |
| `1283-sha256.txt` | 1283×800 的 4 张截图（中/英 × 简单/高级）改前改后逐字节相同 |

## 第二轮（VV 复看 bcdceed9 后，head b4f749d1 起）

VV：≤560 px 时素材面板盖住了播放器，双击试看其实已经载入源画面，但看起来像没反应。

| 文件 | 内容 |
|---|---|
| `round2-before.txt` | 新 smoke 在 bcdceed9 的代码上的完整输出：`NARROW_MEDIA_FAIL 16 of 16 cases` |
| `round2-after.txt` | 新 smoke 在修复后的完整输出：`NARROW_MEDIA_PASS 16 cases`（360 / 560 / 561 / 630 × 中英 × 简单高级） |
| `round2-360-*-open.png` | 360 px 打开素材：按钮写「返回播放器」/「Back to player」（DRAFT，等 JJ 定） |
| `round2-360-*-after-double-click.png` | 双击 synthetic-a.svg 以后：素材面板收起，播放器在「源」上显示这个文件 |
| `round2-360-*-reopened.png` | 再点「素材」：面板回来，两个文件都在 |
| `round2-561-zh-CN-after-double-click.png` / `round2-630-en-after-double-click.png` | 561 和 630 px：并排，双击以后面板不收起 |
| `round2-1283-sha256.txt` | 1283×800 不带素材的 4 张截图：main 跑 5 次，这个分支跑 3 次。en 简单、en 高级、zh 高级 3 张每次都逐字节相同；zh 简单在 main 自己的 5 次里就有两种结果（8f63…、799c…，只差 (1268,549) 一个像素的一个色值），这个分支的 3 次也是这两种之一，head2 和 main 逐字节相同 |

## 第三轮：JJ 定稿的按钮文字（2026-11-05）

中文「返回播放器」；英文按钮上是 "← Player"，aria-label 和鼠标停留提示（title）是 "Back to player"。在 360 px 宽时，中英文的 ⚙ 和 ? 都要留在顶栏上，不能进 More。

| 文件 | 内容 |
|---|---|
| `round3-before.txt` | smoke 在 6cc6f084 的代码上的完整输出：`NARROW_MEDIA_FAIL 8 of 16 cases`。360 中文：? 被挤进 More；360 英文：⚙ 和 ? 都进了 More；360 和 560 时都还没有 aria-label / title |
| `round3-after.txt` | 修复并合并 main 以后（d5f7ec65）的完整输出：`NARROW_MEDIA_PASS 16 cases` |
| `round3-360-*-open.png` | 360 px 打开素材：中文「返回播放器 ⚙ ? 更多 撤销 重做 导出」，英文「← Player ⚙ ? More Undo Redo Export」 |
| `round3-360-*-after-double-click.png` | 双击以后：按钮回到「素材 / Media」 |
| `round3-1283-sha256.txt` | 1283×800（不带素材）：main 4e8813e7 和这个分支 d5f7ec65 各跑两次。第一次 4 张逐字节相同；第二次 en 简单那张只差 (1268,549) 一个像素的一个色值，这个像素 main 自己跑也会变 |
