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

- Follow [the review workflow](docs/decisions/2026-11-01-development-workflow.md). Start the PR description with `QQ 请审` (no `@`) and request reviewer `GoodNightOppie`.
- The description label is for people; the reviewer request is required for Review Inbox discovery. A Draft can appear in the inbox but does not automatically enter Review Inbox agent review. Assigned human or teammate pre-review may proceed; it does not satisfy approval or merge gates.
- Existing descriptions with the literal label `@QQ 请审` do not need another edit. Do not mention an unrelated GitHub account to request team review.
- Keep the current-head review, CI, role approvals and merge gates unchanged.

## MCP entry point

The local MCP server is `mcp-server.js`. It can be started by any stdio-capable MCP client:

```bash
node /absolute/path/to/MontClip/mcp-server.js
```

Use the existing `CLAUDE.md` recipes and tool descriptions rather than inventing a second protocol or schema.
