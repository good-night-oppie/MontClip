# 窄窗口点「素材」：面板不再跑出页面（2026-11-05）

VV 在 #148 复看时发现：窗口宽 360 px 时点「素材」，素材面板挤在播放器右边，筛选框 x 281→401、排序框 405→483、方向按钮 487→513，都在页面外。main 上就有。

检查：`desktop/narrow-media-smoke.cjs`，隐藏的离屏窗口，全新 profile；360×640 和 630×460，中文和英文，简单和高级，点「素材」以后面板和面板里每个看得见的控件都要 left ≥ 0、right ≤ innerWidth。截图只截这个窗口自己的页面（`capturePage`）。

| 文件 | 内容 |
|---|---|
| `before.txt` / `after.txt` | 改前（main 的 style.css）/ 改后的 smoke 输出：改前 `NARROW_MEDIA_FAIL 4 of 8 cases`（360 的 4 种都失败，面板在 272→522），改后 `NARROW_MEDIA_PASS 8 cases`（360 时面板在 6→354） |
| `before-360-*.png` / `after-360-*.png` | 360×640 点「素材」后，中文和英文 |
| `before-1283-*.png` / `after-1283-*.png` | 1283×800 桌面宽度，改前改后 |
| `1283-sha256.txt` | 1283×800 的 4 张截图（中/英 × 简单/高级）改前改后逐字节相同 |
