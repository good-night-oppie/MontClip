# MontClip implementation and release ledger

Updated 2026-11-01. Baseline: `579b08ec1a789baec5cbf06d7430373460508d09`.
Source: JJ's 40-item requirements and Electron brief, reconciled with
`docs/decisions/`. This is an independently condensed ledger, not course material.
Existing upstream capability is a reuse candidate, never release acceptance.
All rows remain **not released** until the Windows package and review gates pass.

| ID | Requirement | Implementation / next action | Verification status |
|---|---|---|---|
| N1 | Semantic highlights with reasons | Extend highlights with evidence-backed proposals | Pending semantic evaluation |
| N2 | Three title/description styles | Evidence-only model proposal | Pending |
| N3 | Local ASR, proper names, large captions | Existing Transformers.js 4.3.1 path; local resource closure pending | Rea's q8 revision 608c49e61301901684bc36cac8f74b95ff6b5a8e failed research samples (Chinese CER, out-of-bounds timestamps, silence hallucination); not a release candidate. Electron offline closure/licensing pending; do not auto-apply invalid timestamps |
| N4 | Alternative opening structure | Reuse sequences, preserve original | Pending |
| N5 | Three cleanup strengths | Reuse silence; approval and music protection needed | Pending |
| N6 | Lossless song/dance cuts | Keyframe-aware path and transparent fallback needed | Pending |
| N7 | Loudness, seams, ducking | Existing audio modules; measure actual output | Pending package measurement |
| N8 | Portrait/mobile composition | Existing reframe; simplified controls needed | Pending |
| N9 | Series/end cards/description | Existing templates; local series metadata needed | Pending |
| N10 | Nonblocking diagnostics | Existing delivery analysis; extend diagnostics | Pending |
| N11 | Explain, preview, undo | Existing revision/history; shell flushes before close | Shell save smoke only; failure injection pending |
| N12 | Privacy/network | Desktop request blocking and Node URL-import denial | Exact origin/token/offline API tests pass; full network observation pending |
| N13 | No account actions or publishing | No new account/publish integration | Package audit pending |
| N14 | Original image first | Preserve compositor; enhancements opt-in | Pending |
| N15 | Editing-app handoff | Standard SRT and mapping first; OTIO reader; CapCut 9.4.0.4015 export-only from new behavioral SPEC | Pending; ADR-003 resolves target version |
| N16 | Agent API parity | Existing REST/MCP operations and revisions | Upstream baseline passes; new operation parity pending |
| N17 | Multi-source alignment | Offset/drift correction and confidence needed | Pending |
| N18 | Outcome log | Local manual metrics needed | Pending |
| N19 | Natural-language requirements card | Structured goal/duration/platform/include/exclude needed | Pending |
| N20 | Recording marks | Import with original time/source/notes needed | Pending |
| N21 | Segment type | Conservative classification with unknown state needed | Pending |
| N22 | Cover candidates | Existing frame extraction; ratios and picker needed | Pending |
| N23 | Titles/file naming | Windows-safe naming and collision tests needed | Pending |
| N24 | Danmaku output | Independent annotation layer needed | Pending |
| N25 | Export follows source | Existing delivery presets; exact rate and readback needed | Pending |
| N26 | Multiple speakers/virtual camera | Existing transforms; simplified operation needed | Pending |
| N27 | Caption readability/safe area | Chinese readability and reference-safe-area controls needed | Pending |
| N28 | Room tone/J-L cuts/music tail | Existing audio timeline; focused workflow needed | Pending |
| N29 | Change provenance/adoption | Existing history; actor/proposal provenance needed | Pending |
| N30 | Rights/credits | Upstream MIT retained; actual component inventory needed | Pending package audit |
| R01 | Real before/after demo | Synthetic real-media package scenario needed | Pending |
| R02 | Faster candidate review | Candidate rows with reasons and zero-results state needed | Pending |
| R03 | Danmaku as separate evidence | Do not mix danmaku into speech transcript | Pending |
| R04 | Explain heuristics/manual approve | Editable proposed boundaries needed | Pending |
| R05 | OpenAI-compatible text-only model | Explicit payload consent and adapter needed | No model connected; no AI claim |
| R06 | SRT import/trim/rebase | Removed invented word timing; source/output mapping needed | Caption unit tests pass; end-to-end pending |
| R07 | Subtitle sidecars | Existing SRT/VTT export; independently editable recipe needed | Pending |
| R08 | Save time, bounded repair | Default simple / advanced switch; both retain core editing and chat, same project/undo/save; max three repair rounds | Pending implementation and real-window verification |
| R09 | Reproducible receipts | Test logs and runtime lock recorded; export receipt needed | Partial development evidence only |
| R10 | No revenue labels/auto-publish | No new publishing integration | Package audit pending |

Additional owner requirements remain separate from the 40-item count:

- T1/T1b–T10: whole-source sentence selection, nonadjacent ranges, pause chips,
  subtitle-only corrections, actual word timing, extension, placement, compact
  timeline, save protection and no watermark. No whole T-row is accepted yet.
- Chinese default plus persisted English switch throughout UI/errors/dialogs/help.
- Built-in project-aware chat: proposal, preview, apply, undo; no mock AI claims.
- M0 Windows Electron portable, bundled FFmpeg on clean PATH, synthetic MP4/FLV
  + SRT, two ranges, preview, undo/redo, save/reopen, MP4/SRT/mapping, source hash
  unchanged, A/V offset <=40 ms, Chinese paths/spaces/small windows.
- One compositor/project/revision/history, no Python, no private credentials or
  source recordings in distribution. macOS/Linux follow Windows.
- QQ review, VV real-window acceptance and JJ wording review are pending.

## Development workflow (resolved)

The owner resolved the former missing Oppie rule on 2026-11-01: use this
repository's AGENTS → CLAUDE/CONTRIBUTING and QQ Review Inbox. No legacy variant
is required or copied. See `decisions/2026-11-01-development-workflow.md`.

Clean PR2 follow-up prepared directly from its public 8f461b9 head: narrowly removes parser's 500-code-unit truncation, with source/demo parity and 17/17 memory parser/clip/JSON/subtitle + range tests. Not whole subtitle workflow or layout acceptance; UI/MCP fit changes remain separate. Full tests/release-check and review still required; no push/merge/release. See validation/2026-11-01-pr2-fulltext-review.md.

2026-11-01 review split: clean view-controls replacement based on squash main5df54aec; see validation/2026-11-01-view-clean.md. Windows558/558 and repository release-check pass. Full bilingual UI/chat/FLV remain separate pending changes; no old PR4 approval inherited, no new-window acceptance claimed.

2026-11-01 long-FLV follow-up on clean main bc771db: actual public19377acd inspect of a synthetic2h1080p30 static-loop+AAC input took195.288s;37.1MB input, sampled37.16MB task peak, inputhash unchanged. maxGap67ms means no continuous-preparation acceptance; short first-loop windows did not localize the gap. No packet replacement/timeout relaxation. See validation/2026-11-01-flv-long-benchmark.md/json for exact component/input hashes and bounds. Original/output PTS correspondence persistence remains design-only; nonzero-time arithmetic test does not close it.

2026-11-01 build dependency: official packager20.3.0 installed with scripts disabled, exact lockfile; actual ESM API loader check passes without packaging. Windows559/559 and repo release-check passed. Audit5moderate/0high remains unapproved; manifest/resources/ASR/real bundle/fuses gates remain open. See validation/2026-11-01-packager-dependency.md.

2026-11-01 clean FLV core: shared gap/readable/transcode checks and source serialization on squash main; Windows574/574 plus repo release-check. See validation/2026-11-01-flv-clean-core.md. Native IPC/close/harness, browser historical diskrev1 root cause and release resources remain separate open items; PR8 unchanged.
