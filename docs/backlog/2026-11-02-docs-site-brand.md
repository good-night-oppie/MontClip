# 文档站页面还写着 FableCut，链接通向上游；文档站上线前必须改

## 问题

文档站（`docs/docs/` 下的所有页面）现在看起来还是上游 FableCut 的站点，不是 MontClip 的。用户打开任何一页文档，页头页脚都写着 FableCut，有的链接会把人带到上游的服务和社群。

**文档站上线之前必须改掉。**

## 不影响 11/3 发布

安装包里不带 `docs/`，所以这个问题不影响 11/3 的 Windows 版。这里只关系到将来对外放出文档站。

## 具体有哪些

**已由 #31 处理（2026-11-02 合入 main）：**
- 每页页头的 Community 入口，以及上游原样照搬的社区页 `docs/community/`；
- 页头的 Discord 图标，页脚的 Discord 和 Email（hello@fablecut.space）；
- Studio 文档页里「去 FableCut Discord 提问，或写信到 support@fablecut.space」这一句。

**还在、需要处理的：**
- 每页页头和页脚的品牌名还是「FableCut」，读屏文字是 "FableCut home"；
- 页头的 Studio 链接指向上游的 `studio.fablecut.space`；
- 页脚的 Status 链接指向上游的 `status.fablecut.space`；
- 生成器里的 `SITE` 常量是 `https://fablecut.space`，每页的 canonical 和分享卡片地址都指向上游的站点；
- Studio 文档页（`docs/docs/studio.md`）整页讲的是上游的托管服务，不是 MontClip 的功能。

这些都在 `docs/docs/build.js`（页头页脚模板和 `SITE`）和 `docs/docs/*.md` 里，改完运行 `node docs/docs/build.js` 重新生成所有页面。

## 需要先定的

- 我们自己的站点地址是什么（替换 `SITE`）；没有的话，canonical 和分享卡片是先删掉，还是先留空。
- Studio 和 Status 这两个入口删掉，还是换成我们自己的东西。
- 文档正文（CLAUDE.md 生成的各页）里的 FableCut 一起改，还是只改页头页脚。

## 怎么算做完

- 文档站任何一页上，用户看到的品牌都是 MontClip；
- 没有链接把人带到上游的服务、社群或支持渠道；
- `test/brand.test.js` 加一条检查，覆盖 `docs/docs/` 的页头页脚，防止以后再出现。

## 为什么放在这里

仓库没有打开 Issues；要不要打开是仓库设置，由主人决定。在那之前，待办记在 `docs/backlog/`。

背景见 `docs/decisions/2026-11-02-brand-montclip.md` 的「Later work」一节（#31 写入）。
