# PR 172 review follow-up — 2026-11-06

Both requested negative controls failed before the change and passed afterward:

- 30 fps, 10.09 seconds, ten one-second ranges: the range engine yields 10 seconds, so cumulative 0.09-second removal must remain actionable.
- 16:9 / 1:1 requests must name the actual matching export-frame option, not 9:16. Ambiguous requests name only the dropdown. Both UI languages are exercised. JJ approved the additional strings on 2026-11-06.

Validation after ordinary merge of main `d51b27a1`:

- `npm test` with explicit development FFmpeg/FFprobe paths: 1740 tests, 1733 pass, 0 fail, 7 skipped. No real model or private footage used.
- `node .github/scripts/release-check.js`: passed.
- Offscreen Electron `desktop/keep-ranges-smoke.cjs --montclip-smoke --user-data-dir=<fresh>` using bundled LGPL FFmpeg: passed after selecting the fixture clips (main now sends only selected clips' facts). Three four-second files, 120 frames and eight flash/beep pairs each; worst A/V offset **0.08 ms**, threshold **40 ms**. One undo restored the edit; the stale export queue refused another export; changed-project review was refused. The initial outdated smoke fixture failed before it sent a usable proposal; that failed attempt is retained locally.

## Historical eleven failures remain recorded

The original author reported 1711 / 1620 pass / 11 fail / 80 skipped at `91f76476`: ASR gaps 4, export stop 1, faststart 4, MCP timeout 1, export-download timeout 1. This record is not replaced by individually successful reruns.

Fresh full run at that exact head without bundled FFmpeg: 1711 / 1621 pass / 10 fail / 80 skipped. Main `d51b27a1` under the same missing-tool setup: 1732 / 1627 pass / 9 fail / 96 skipped. Both reproduced the same nine missing-FFmpeg / fixture-availability failures in `asr-gaps`, `export-close`, and `faststart-ownership`. They belong to the tool-dependent test environment, not the changed proposal logic.

The tenth exact-head failure was `mcp-protocol`'s 15-second tools/call timeout. Historical `export-downloads` timeout did not recur. Their original causes are **not proven**; ownership remains the existing MCP/export test paths and this follow-up's baseline triage, not a claim that two isolated reruns closed them. Main's later bounded backfill work was retained through an ordinary merge. The final integrated full run passes, with tool paths explicitly configured.

No visible desktop session was occupied. Automated offscreen checks are not human product acceptance, installation, or release approval.
