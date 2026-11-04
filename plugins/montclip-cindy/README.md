# MontClip for Cindy (plugin shell)

The second shell around the one MontClip engine (the repository root). The first is the Windows app in
`desktop/`. See `docs/decisions/2026-11-04-montclip-cindy-plugin.md`.

| File | What it is |
| --- | --- |
| `ghost.json` | the plugin manifest (schema v3): tools, `taskView`, `preview.hosts`, `node` |
| `main.js` | the logic page (Cindy's browser sandbox): tool calls → the Node worker; answers the task view |
| `task-view.html`, `frame.js`, `frame.css` | the task view: binds the task's project and frames the editor at `http://127.0.0.1:<port>/` |
| `panel.html` | the right-sidebar panel shell (global, not per task): frames the engine's `/cindy/panel.html` |
| `embed/` | pages the engine serves at `/cindy/` (build.cjs copies them): the panel's 文稿 (Transcript) and 属性 (Properties) |
| `node/worker.cjs` | the Node worker (JSON-RPC over stdio): runs `app/server.js` and calls `app/mcp-server.js`'s tools in-process |
| `node/lib.cjs` | the worker's testable parts: Windows environment, session token, task → project binding, tool output |
| `build.cjs` | copies the engine into `node/app/` for packing (gitignored; never edit the copy) |

## How it fits together

- **Layout B.** The editor is a task view: a tab in the task's right sidebar, beside the chat. Each Cindy task
  has its own MontClip project (`<data dir>/sessions.json`); the page binds it when it opens and when the task
  comes back to the front. Binds run one at a time, so a new task never gets two projects.
- **The frame.** Cindy lets a plugin page frame `http://127.0.0.1:*` when the plugin declares a page, `node` and
  `preview.hosts: ["127.0.0.1"]` (not in the plugin manual; see the ADR's risks). The editor (`app.js`) runs in the
  frame unchanged, with `?host=cindy`.
- **Only the plugin's pages.** The worker starts the engine with `MONTCLIP_HOST=cindy` and a fresh random
  `MONTCLIP_EMBED_TOKEN`. The frame's first load carries the token once (`/?host=cindy&token=…`); the engine answers
  with an HttpOnly cookie and sends the frame on without the token. The worker's own calls send
  `X-MontClip-Session`. Everything else gets 403. The token never goes into a tool result.
- **The panel.** 文稿 lists the timeline's captions (else its titles) by time, marks the one being shown and moves
  the editor to a line on click (or Enter: each line is a button). 属性 shows the selected clip, read-only. The panel
  and the editor are pages of the same engine origin in Cindy's plugin partition and talk over
  `BroadcastChannel("montclip-editor")` (playhead, selection, seek); with no editor tab, a click falls back to
  `POST /api/ui/command` (NO_EDITOR).
- **Undo.** One stack, in the editor page. The chat's `montclip_undo` / `montclip_redo` ask that page
  (`POST /api/ui/command`). Cindy reloads a task's tab when the task comes back; the engine keeps the stack per
  project (`/api/ui/undo-stack`), so it comes back too.
- **Data.** `~/MontClip-Cindy` (projects, media, exports). One engine per data folder: if the Windows app has the
  same folder open, the worker refuses to start and says so.
- **Environment.** Cindy 0.1.122 gives the worker a trimmed environment without `PROGRAMFILES`; the worker puts
  back the usual Windows folders that exist, so headless export finds Chrome or Edge.
- **ffmpeg.** Only the pinned LGPL build in `~/MontClip-Cindy/ffmpeg/<platform>-<arch>/`, never one from PATH.
  Fetching it is a later PR (⑤); until then `montclip_status` reports `ffmpeg: "missing"` and export is unavailable.

## Develop

```
node plugins/montclip-cindy/build.cjs        # copy the engine into node/app/
node --test test/cindy-plugin.test.js        # manifest, worker over stdio, token, environment, binding
```

Then pack with `ghost_forge_pack({dir})`, or install for yourself with `ghost_forge_install({dir})` (personal
scope). Tests drive the worker with `MONTCLIP_CINDY_APP` (the engine folder, here the repo root),
`MONTCLIP_CINDY_DATA` and `MONTCLIP_CINDY_PORT=0`.
