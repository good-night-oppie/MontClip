# Working with MontClip

The complete agent manual is in [CLAUDE.md](CLAUDE.md). Read it before changing the project schema, using the MCP tools, or editing the timeline. This file exists so agents that look for the cross-tool `AGENTS.md` convention, including OpenCode and Codex, find the same source of truth without duplicating it.

## Project constraints

- Keep MontClip zero-runtime-dependency and standard-library only.
- Keep preview and export on the same compositor path.
- Prefer small, focused changes and preserve the existing terse browser-native style.
- If a schema, prop, text animation, API, or MCP surface changes, update `CLAUDE.md` and the English `README.md` in the same change.
- Follow the "Shipping a feature" checklist in [CONTRIBUTING.md](CONTRIBUTING.md#shipping-a-feature-the-checklist): agent parity, docs and site, changelog.
- Run `npm test` and `node .github/scripts/release-check.js` before opening a PR.

## Review handoff

- Follow [the review workflow](docs/decisions/2026-11-01-development-workflow.md). For review, use this PR-description layout: physical line 1 is `QQ 请审` (no `@`); physical line 2 is `负责人：<伙伴名>`, naming the actual implementation owner, not a shared GitHub account. Request reviewer `GoodNightOppie`; an existing review by that account also counts as having handed off, but does not prove current-head approval.

```text
QQ 请审
负责人：<伙伴名>
改动：<具体改动>
复现：<复现步骤>
测试：<结果数字，或没跑加具体原因>
依赖：无
音画同步：<涉及剪辑/导出时提供结果或没跑原因>
外发：内容：<发什么>；接收方：<发给谁>；能否关闭：<怎么关>
```

- Use real evidence, not unchanged placeholders. Dependencies may instead use `依赖：#123（硬依赖，类型：代码）`; state the type of hard dependencies. The test section needs a numeric result or `没跑` plus a reason on every nonempty line. Audio/video sync and outbound fields are required when the changed paths trigger them; see [the shared rules](scripts/pr-sop/README.md) and `scripts/pr-sop/policy.json`.
- If an exception is needed, add `SOP 例外：<项目> — <原因> — 证据：<HTTPS链接或消息号>`. Correct format alone does not approve an exception: QQ must verify each item in a current-head review, then manually re-run the matching trusted pull_request_target check. If the head, body, or trusted rule version changed, trigger a new target run. The owner selected target-only; do not add a PR-controlled pull_request_review check. `sop-pr-lint` failures block merging once QQ configures the required check; a grace period does not turn a failed check green. Existing descriptions must also meet the current format; there is no old-label exemption.
- The body label is for people; it is not by itself an Inbox discovery signal. A Draft can appear in the inbox but does not automatically enter Review Inbox agent review. Assigned human or teammate pre-review may proceed; it does not satisfy approval or merge gates. Drafts still need a second-line owner and hourly follow-up under SOP; registering a Draft owner does not require requesting review first.
- Keep current-head approval, CI, role acceptance and merge gates separate and unchanged. Never reuse an old-head approval after a new push.

## MCP entry point

The local MCP server is `mcp-server.js`. It can be started by any stdio-capable MCP client:

```bash
node /absolute/path/to/MontClip/mcp-server.js
```

Use the existing `CLAUDE.md` recipes and tool descriptions rather than inventing a second protocol or schema.
