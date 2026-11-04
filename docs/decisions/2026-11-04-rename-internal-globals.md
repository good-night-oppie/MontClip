# ADR 2026-11-04: rename internal FableCut globals to MontClip

Status: proposed (QQ review).

## Decision

The internal global objects `FableCutXxx` (`FableCutCaptions`, `FableCutFx`,
`FableCutTranscribe`, `FableCutBeats`, `FableCutSilence`, `FableCutEdit`,
`FableCutMotion`, `FableCutLoudness`, `FableCutDucking`, `FableCutRangePlan`,
`FableCutTracker`, `FableCutTemplates`, `FableCutSeq`, `FableCutReframe`,
`FableCutMp4`, `FableCutMedia`, `FableCutMask`, `FableCutColor`,
`FableCutDelivery`, `FableCutComp`, `FableCutHighlights`,
`FableCutProjectOps`, `FableCutMeterProcessor`, `FableCutPitch`,
`FableCutLimiter`, `FableCutGate` — every UMD module global and every reference
to it through `self.` / `window.`) are renamed to `MontClipXxx`. Everything the
[2026-11-02-brand-montclip.md](2026-11-02-brand-montclip.md) ADR already renamed
for the user-visible name stays as it is.

This supersedes **one** item of that ADR: the line under "Kept on purpose
(internal identifiers)" that kept the global objects `FableCutXxx`. That item is
now void; the other kept-on-purpose items remain in force (see below).

The rename is carried out by the idempotent script
`scripts/rename-fablecut-globals.cjs`. Re-running it on an already-renamed tree
is a no-op (0 diff); running it on a clean `origin/main` reproduces the same
diff, so any branch that merged `main` after this rename can run it once to
resolve the conflicts.

## Why the B-class items are NOT renamed now

These stay `fablecut` / `FABLECUT` / `FableCut` in this step:

1. MCP tool names `fablecut_*` (26 tools) — the Cindy plugin line
   (#112–#117), Review Inbox and Claude Desktop all call these names.
2. `FABLECUT_*` environment variables (`FABLECUT_DATA_DIR`, `FABLECUT_CHROME`,
   `FABLECUT_NO_FS_WATCH`, `FABLECUT_NO_AUTOSTART`, `FABLECUT_PORT`,
   `FABLECUT_AUTO_VERSION_MIN`, `FABLECUT_ALLOWED_HOSTS`,
   `FABLECUT_TEST_IMPORT_ALLOW_PRIVATE`).
3. The `~/FableCut` data folder (`paths.js`) — existing installs hold real data
   there.
4. Registration names in `.mcp.json` and `.claude-plugin/*.json`.
5. HTTP headers `X-FableCut-*` (`-Project`, `-Projects`, `-Client`,
   `-Frame-Times`, `-Frame-Source`).
6. localStorage / settings keys `fablecut-*` — users' browsers hold saved
   settings under those keys.
7. AudioWorklet processor names `fablecut-*` (`-limiter`, `-gate`, `-pitch`,
   `-meter`).
8. The `fablecut` command (`package.json` `bin`).
9. The MCP `serverInfo` name `fablecut` — the same callers as item 1 match
   on it.

Renaming any of these now would break those integrations, or orphan data and
settings already on users' machines.

10. The upstream references (`ronak-create/FableCut`, `*.fablecut.space`,
`io.github.ronak-create/fablecut`) and the `LICENSE` copyright notice are
kept **forever**, not just for now: they name the upstream project and are
required by its MIT attribution.

## How the B-class items migrate later

One release ships **both** names — read the old, write the new — then a later
breaking release drops the old name:

- **MCP tools / server name**: register both `fablecut_*` and `montclip_*`;
  new callers use `montclip_*`, old callers keep working. `serverInfo.name`
  stays `fablecut` (or reports both) for one release.
- **Environment variables**: read `MONTCLIP_*` first, fall back to
  `FABLECUT_*`. Existing scripts and CI change nothing.
- **Data folder**: `paths.js` keeps reading `~/FableCut` for one release; new
  installs may create the new name, and the folder is renamed only after a
  migration step (or when the old one is empty).
- **localStorage / settings keys**: on read, check the new key, then fall back
  to the old `fablecut-*` key; on write, use the new key. The old-key fallback
  is removed a release later.
- **HTTP headers**: accept both `X-FableCut-*` and `X-MontClip-*` for one
  release and write the new one; the MCP client and server change together (an
  internal protocol).
- **Worklet processor names**: `registerProcessor` both names; a cached worklet
  script still loads for one release.
- **Command**: keep `bin.fablecut` as an alias beside `bin.montclip` for one
  release.

## Test

`test/brand.test.js` already allows `FableCut[A-Z]\w*` identifiers, so the
globals rename does not trip it; `test/ui-terms-page.test.js` keeps checking the
user-visible name is `MontClip`. The full suite (`npm test`) and the desktop
smokes are run before this ships.
