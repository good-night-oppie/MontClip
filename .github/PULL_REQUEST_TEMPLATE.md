QQ 请审
负责人：<伙伴名>

改动：

复现：

测试：
- 没跑：<请填写原因，或改为真实结果数字>

依赖：无

音画同步：

外发：内容：<发什么>；接收方：<发给谁>；能否关闭：<怎么关>

## 提示

请按改动文件补音画同步和外发说明；没有相关改动时可删对应行。
需例外时，单独写：SOP 例外：<项目> — 原因 — 证据：<HTTPS链接或消息号>。
任何例外都需要QQ核验；不要把机器格式检查当作审查批准。

## 项目原有核验清单

<!-- Thanks for contributing to MontClip! -->

## What does this PR do?

<!-- A short description of the change and the motivation. Link any related issue. -->

Closes #

## Type of change

- [ ] Bug fix
- [ ] New feature (transition / preset / text anim / effect / API)
- [ ] Docs
- [ ] Refactor / internal

## How was it verified?

- [ ] `npm test` passes (CI runs it on Node 18 / 20 / 22)
- [ ] Added or updated a test in `test/` if this touches the MCP surface, the REST API, or the SVG library
- [ ] Opened the editor and confirmed the change in **preview**
- [ ] Confirmed the change in an **export** (fast or realtime), if it affects rendering
- [ ] Updated `CLAUDE.md` / `README.md` if the schema, props, or API changed

## Checklist

See [Shipping a feature](../CONTRIBUTING.md#shipping-a-feature-the-checklist) for the details.

- [ ] No new runtime dependencies added
- [ ] Preview and export render identically (single compositor)
- [ ] Agents can do it too: patch op / MCP tool (+ `manifest.json` tools), validated, respects locks
- [ ] A new shared module is in `index.html` and `docs/demo/sync.js`
- [ ] New shortcuts / monitor gestures are in the Keyboard shortcuts dialog
- [ ] `CLAUDE.md` updated, then `node docs/docs/build.js` and `node docs/demo/sync.js` rerun
- [ ] README feature list, `docs/llms.txt` and the site feature list mention user-facing features
- [ ] `CHANGELOG.md` entry under Unreleased
- [ ] Commits are focused and messages are descriptive
