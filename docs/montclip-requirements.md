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

2026-11-01 Agent Pane foundation: local session/draft UI plus shared locale and whitelisted desktop width store. Provider/approved payload/proposal lifecycle and real-window acceptance incomplete; no actual model traffic. See validation/2026-11-01-agent-pane-foundation.md.

2026-11-01 Agent Pane SPEC hash verified and ADR adopted. Explicit local project/caption/range references and keyboard composition/layer protection implemented; no external payload approval or persistence completion. Full tool/provider/session restore/window gates remain open. See validation/2026-11-01-agent-pane-context.md.

2026-11-01 WS_KEY random-port loss reproduced in hidden Electron and fixed with separate version1 workspace IPC/storage/migration. Cross-process Color restore and Color→simple project/undo preservation observed on empty own profile; full layout/graded footage/nested/export acceptance pending. Agent layout ADR records requester A–H corrections; provisional second right rail not accepted. See validation/2026-11-01-workspace-preferences.md.

2026-11-01 Agent session follow-up (stacked on PR18): restricted version1 main-owned local session store, project/sequence isolation, active selection/drafts/explicit references and text-history restoration; no fake model output. Windows hidden Electron same profile21220→10817 restored identified draft/reference, both exits0, unchanged project/undo; gen missing remains explicit null and cannot grant proposal authority. Pure/injected failure, collision, stale token and close protection tests added. Actual service/tool receipt recovery/full workbench UI remain pending; local session persistence is not complete AI capability or release approval.

2026-11-01 PR16 blocking follow-up: one right page area, bounded timeline height, pinned chat composer, theme controls, narrow media-page toggle; actual Electron CSS viewports1270/1100/804/630 ×simple/advanced ×assistant closed/open measured16 cases. Default null identity two sessions adopt only verified same project through pjLoad, then switch away/back restores both without cross-project draft. Production controller red→green; close default-wait/explicit-force regression preserves escape route. Full Node585/585; Windows hidden coordinate actions cover play/pause, export dialog, send-unconfigured/cancel/hide/show. Undo/redo center-hit tested, not new actual media undo acceptance. All native OS/whole-product/AI/package gates stay open.

2026-11-01 capacity delta after PR20: separate session/text/reference feedback and mounted blocked-scope return repair; old drafts retained, no cross-project reuse or restart advice. Validation: docs/validation/2026-11-01-agent-capacity.md. New locale/trigger review pending JJ; not complete Agent acceptance.

2026-11-01 VV v2 actual source hash 0d74505ab45d61be0c3e2a3a27187c2024f671fbf803494422948b32e59b5dcf verified; source/override alignment and concrete remaining gaps appended to existing agent-workbench-layout ADR. No new product approval or test claimed; PR16–21 heads unchanged.

2026-11-01 JJ v1.1 limited integration: six shared-locale Agent keys for existing disconnected/basic controls, one connection status region; mounted+storage21/21. Actual transport/payload/history authorization and scoped tools remain pending; no whole-disk read or excluded-data guarantees. See existing workbench ADR; not full i18n acceptance.

2026-11-01 VV PR16 full-page baseline attribution incorporated into existing agent-layout-fix validation: assistant-closed matches base and overlays/menus24/24 remain valid; narrow preview/overflow are pre-existing but still in workbench acceptance scope. Assistant-open preview/playback/timeline/offscreen regressions distinct. No new tests or approval inferred.

2026-11-01 QQ PR19 close blocker: initial unreadable sessions explicitly window-only, no persistence dirty/write or assistant close block; main project save checks unchanged, subsequent write failures protected. See validation/2026-11-01-agent-temporary-sessions.md. Full readback/physical failure and release plaintext-retention disclosure remain pending; not entire Agent completion.

JJ session-policy follow-up: PR22 separates local storage scope text from save status; eligibility uses project ID, not name. Temporary read-failure behavior already implemented, loaded write failure still protects close. #17/18/19 copy approvals remain limited to their exact heads; #21 cda46345 separately public. See existing agent-temporary-sessions validation.
