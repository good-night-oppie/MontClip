# Desktop foundation: measured development evidence

2026-11-01, Windows x64. This is a review batch, **not M0 or release acceptance**.

| Check | Result |
|---|---|
| Baseline 579b08e `npm test` | 536 passed, 0 failed |
| Baseline release-check | Passed |
| Changed tree `npm test` | 541 passed, 0 failed |
| Changed tree release-check | Passed, 24 MCP tools match manifest |
| `node desktop/smoke.js` | Real Electron 45.2.1 hidden renderer; all six checks passed |
| Renderer/API | Node unavailable; project loaded; HTTP 200; drawFrame present |
| Offline probe | Renderer fetch to example.com rejected; Node URL import returns NETWORK_DISABLED |
| Close/save | Existing save completed; input frozen until close; late-edit/conflict/error unit cases refuse close |
| Isolation | Dynamic ports, exact Host/Origin, wrong/missing/cross-instance tokens rejected |
| Independent instances | Stopping one test server leaves the other responsive |
| Dependency audit | 0 reported vulnerabilities for current desktop lock |
| Visible window / preview/export frames | Not tested by VV yet |
| Portable package / clean FFmpeg PATH / sync <=40ms | Not tested; no package delivered |
| macOS / Linux | Not tested |

The first full run after removing inferred word timing found the old MCP import
test expecting inferred timing. Its assertion now requires absent wordTimes and
sentence animation. The later full run above is green. An independent code review
also reproduced the close/save race; dedicated close code now freezes input and
refuses to close after a pending edit or changed project snapshot. This does not
replace future failure-injection testing in the visible packaged app.

Electron utilityProcess readiness and actual browser rendering are covered by the
smoke, not by the Node-fork HTTP unit tests alone. Tests use synthetic/empty data
and a fresh directory with Chinese characters and spaces. System FFmpeg was
present: this is explicitly not the required bundled-FFmpeg test.

## Reproducibility

- Electron archive source: `https://github.com/electron/electron/releases/download/v45.2.1/electron-v45.2.1-win32-x64.zip`
- Archive expected SHA-256 (official npm package checksums): `7c342aee45d5b4ccafe5dfe9037028796b082735a576e21e2b4e2d8422ebb727`.
- Installed electron.exe measured SHA-256: `32e357fc856feadd1e51531f47811d2621483e5a58815eb4999154d7c9baea3b`.
- Desktop lock measured SHA-256: `245471b320e2dcdf1d01fabed09c2061e09cbf9f0aea114c05fc33412aa48648`.
- Runtime license: Electron MIT plus bundled Chromium licenses; no release redistribution audit claimed.
- Rea Opus external-behavior SPEC read at SHA-256 `d00935f4ecfdd4ae4b8a4638bc8c514f7b6b5c9b0b0ff598aaa1cf40d6011709`.
  No reverse-engineered originals were read. It is not a CapCut compatibility SPEC.

## Remaining acceptance

Sentence-selection workflow, independent source/output JSON, real two-range
MP4/SRT export, bundled FFmpeg, offline model closure, Chinese-default i18n,
chat adapter/consent, CapCut behavior specification, OTIO round trip, final fuses,
child-process cleanup under active exports and visible save-failure UX remain
open. See the full requirements ledger. No merge or publish approval is implied.
