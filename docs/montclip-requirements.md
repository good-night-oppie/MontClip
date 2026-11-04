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
| N3a | Transcription survives one segment the engine cannot read | Gap 2026-11-03 (Rea, #93): one of 1485 VAD segments of a 3.8-hour stream made sherpa-onnx throw basic_string::_S_create and the whole transcription failed (twice). Fix: each segment on its own, a failing one retried as its two halves once, what still fails kept as a gap; complete / partial / failed; partial never told as done, the gaps listed on the timeline and empty of subtitles — PR #95. Root (Rea, #93 ADR §10): the model's tokens.txt has a token that is exactly "@" and sherpa-onnx 2.0.1 underflows on it; the recognizer reads a cached copy with 「＠」 (the model's file untouched), only decodeAsync. Every decode on a new stream (a broken stream is never reused). Rea: the failing segment is at 3603.7 s, 4.74 s long, the only one of 1485 — not about length, so no shorter VAD maximum | 听写单段失败会拖垮整场：**未修** (main); PR #95: unit tests with an injected failing engine + `ASR_GAPS_PASS` (FAIL on the code before), awaiting review |
| N3b | Gaps shown on the timeline | VV on #95 d95ab21 (suggestion): faint diagonal hatching over the parts of a clip the engine could not read, so a gap is seen where it is cut. The transcript note lists them (times as the cards show them, buttons) | **未排** (not scheduled) |
| N3c | The transcript list's first Tab stop | VV on #100 (2026-11-03): Tab stops first on the transcript list itself, before the gaps note's times. The list's scrolling area has `tabindex="0"` (`[data-tr-body]`) since upstream FableCut's transcript (#143), so the keyboard can select words in it; not changed | **未排** (not scheduled) |
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
| N23 | Titles/file naming | Windows-safe naming and collision tests needed. Gap 2026-11-03: uploaded/imported media lost Chinese names (「合成 演唱.wav」 → 「_ _.wav」); every media path now uses `Delivery.mediaFileName` (fileSafeName rule, extension kept) — PR #78 | Pending; PR #78: unit tests + `MEDIA_NAMES_PASS` (upload, read, play), awaiting review |
| N24 | Danmaku output | Independent annotation layer needed | Pending |
| N25 | Export follows source | An empty project takes the first recording's size (never scaled) and its average frame rate snapped to a standard rate (30 when none is near); a canvas the streamer chose and a project with content are kept. Measured on main: 1080p60 exported at 30 fps (half the frames dropped). Sample rate stays 48 kHz. Found: an FLV with one dropped frame is refused at import (FLV_TIMELINE_GAP, not changed here) | Pending; this PR: `test/source-canvas.test.js` + `SOURCE_FOLLOW_PASS` (ffprobe readback, A/V ≤ 40 ms, VFR without repeated frames), awaiting review; ADR 2026-11-03-canvas-follows-source |
| N26 | Multiple speakers/virtual camera | Existing transforms; simplified operation needed | Pending |
| N27 | Caption readability/safe area | Chinese readability and reference-safe-area controls needed | Pending |
| N28 | Room tone/J-L cuts/music tail | Existing audio timeline; focused workflow needed | Pending |
| N29 | Change provenance/adoption | Existing history; actor/proposal provenance needed | Pending |
| N30 | Rights/credits | Upstream MIT retained; actual component inventory needed | Pending package audit |
| R01 | Real before/after demo | Synthetic real-media package scenario needed | Pending |
| R02 | Faster candidate review | Candidate rows with reasons and zero-results state needed | Pending |
| R02a | 自动出切片 results kept with the project | Today the cards (and what is on them: a 补一段 name, a calibration of the lyrics) live in the open window only; the habits come back after a restart, the names do not (known limitation, docs/decisions/2026-11-03-corrections.md; nothing in the interface says so) | **未排** (not scheduled; Deja: decide after real use) |
| R02b | 「记住我的剪辑习惯」 when several people share one computer | Found by VV in the real window (2026-11-03): the habits record every change made in the window, whoever makes it, so on a shared computer someone else's adjustments are learned as the streamer's habits. The ADR (2026-11-03-corrections) says each person uses their own profile; the interface says nothing about it yet | **未排** (not scheduled) |
| R02c | Lyrics calibrated twice, undone twice | Found by VV in the offscreen review of #105 74d8486 (2026-11-04): calibrate a card twice, undo both, open it again — the box showed the lyrics pasted the first time, not the last ones. Deja (2026-11-04): a bug; reopened, the box brings the lyrics pasted last, so the tooltip as-lyrics-again-title「再点一次会带上你上次贴的歌词」 is true. Test: calibrate twice, undo twice, reopen → the second paste. The lyrics are still not saved in the project file and not sent to the AI. Its own small PR | 要做 |
| N3d | 「加字幕」 says what it did in Chinese | Found by VV in the offscreen review of #104 (2026-11-04): on the transcript page, 〔加字幕〕 ended with the English toast 「4 captions on V3」 in the Chinese interface (app.js addCaptionsFromTranscript). Deja (2026-11-04): 「已在 {track} 加了 {n} 句字幕」 / 「Added {n} captions on {track}」, the track and the count from variables. A small PR (may go with R02c) | 要做 |
| P4a | The plan list's state names | Deja (2026-11-04): v7.2's names, from 助手面板改版说明 v7.2 定稿, line 39 (sha256 47022980…): ○ 待做 / a spinner 进行中 / ✓ 完成 (the text struck through) / ✕ 没做成; in English To do / In progress / Done / Not done (Deja: one for one with the Chinese; no Failed). They replace #84's 没开始 / 正在做 / 做完了 in both languages | Changed in #84 (agent-plan.js NAMES / MARKS, test/agent-plan.test.js, desktop/agent-plan-smoke.cjs); waiting for QQ and VV |
| P4b | The mode menu says what each mode does | VV on #109 f3df7db (2026-11-04): Cindy's PermissionSelector menu shows only an icon and a name; v7.2 has a sentence under each mode (e.g. 「只出计划，不改项目。」). Deja: do it when the selector goes into the pane | **未排** (not scheduled; with the selector in the pane) |
| P4c | The mode menu's last line | VV on #109 f3df7db: v7.2 ends the menu with 「往外发的内容，每种模式都先给你看。」. Deja: when the selector goes into the pane | **未排** (not scheduled; with the selector in the pane) |
| P4d | The mode button as a capsule | VV on #109 f3df7db: the button 「✋ 手动 ˅」 is plain text; v7.2 draws it as a capsule, outlined in the warning colour while Yolo is on. Deja: when the selector goes into the pane | **未排** (not scheduled; with the selector in the pane) |
| P4e | The plan card's four states in a smoke | VV on #109 f3df7db: cindy-parts-smoke shows TodoListCard folded (「第 2 / 3 步」); opened, its four states (待做 / 进行中 / 完成 / 没做成) were not seen. Deja: when the card goes into the pane | **未排** (not scheduled; with the card in the pane) |
| R03 | Danmaku as separate evidence | Do not mix danmaku into speech transcript. Gap 2026-11-03: the editor dropped the whole `project.danmaku` field on load (and deleted it on the next save), so highlight cards never saw danmaku; now kept as it is — PR #79 | Pending; PR #79: unit tests + `DANMAKU_KEEP_PASS` (FAIL on the code before), awaiting review |
| R04 | Explain heuristics/manual approve | Editable proposed boundaries needed | Pending |
| R04a | Event-boundary snapping of card ends | event-bounds.js v3.1 (#93) | 事件边界吸附：**v3.1 未达标** — non-singing 31 rows, hits within ±3 s 0/31 old and new; not wired into the product. Drag snapping: 25 % of all drags hit (below 80 %), off by default |
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

2026-11-01 follow-up: QQ approved PR9 19377acd and PR10 5b14ffd0 within their recorded scopes, not release approval. Long FLV frame-scan performance, packet/frame gap equivalence, owned rejected-upload cleanup, explicit user-only dual consent, build glob input restriction and pinned Electron archive checksum remain gates; see docs/validation/2026-11-01-flv-clean-core.md. Concurrent upload exclusive-create fix is separate and not yet reviewed.
2026-11-01 Agent Pane foundation: local session/draft UI plus shared locale and whitelisted desktop width store. Provider/approved payload/proposal lifecycle and real-window acceptance incomplete; no actual model traffic. See validation/2026-11-01-agent-pane-foundation.md.

2026-11-01 Agent Pane SPEC hash verified and ADR adopted. Explicit local project/caption/range references and keyboard composition/layer protection implemented; no external payload approval or persistence completion. Full tool/provider/session restore/window gates remain open. See validation/2026-11-01-agent-pane-context.md.

2026-11-01 WS_KEY random-port loss reproduced in hidden Electron and fixed with separate version1 workspace IPC/storage/migration. Cross-process Color restore and Color→simple project/undo preservation observed on empty own profile; full layout/graded footage/nested/export acceptance pending. Agent layout ADR records requester A–H corrections; provisional second right rail not accepted. See validation/2026-11-01-workspace-preferences.md.

2026-11-01 Agent session follow-up (stacked on PR18): restricted version1 main-owned local session store, project/sequence isolation, active selection/drafts/explicit references and text-history restoration; no fake model output. Windows hidden Electron same profile21220→10817 restored identified draft/reference, both exits0, unchanged project/undo; gen missing remains explicit null and cannot grant proposal authority. Pure/injected failure, collision, stale token and close protection tests added. Actual service/tool receipt recovery/full workbench UI remain pending; local session persistence is not complete AI capability or release approval.

2026-11-01 PR16 blocking follow-up: one right page area, bounded timeline height, pinned chat composer, theme controls, narrow media-page toggle; actual Electron CSS viewports1270/1100/804/630 ×simple/advanced ×assistant closed/open measured16 cases. Default null identity two sessions adopt only verified same project through pjLoad, then switch away/back restores both without cross-project draft. Production controller red→green; close default-wait/explicit-force regression preserves escape route. Full Node585/585; Windows hidden coordinate actions cover play/pause, export dialog, send-unconfigured/cancel/hide/show. Undo/redo center-hit tested, not new actual media undo acceptance. All native OS/whole-product/AI/package gates stay open.

2026-11-01 capacity delta after PR20: separate session/text/reference feedback and mounted blocked-scope return repair; old drafts retained, no cross-project reuse or restart advice. Validation: docs/validation/2026-11-01-agent-capacity.md. New locale/trigger review pending JJ; not complete Agent acceptance.

2026-11-01 PR21 normal fast-forward capacity follow-up from6dfa20a: final paneLimitSessions/paneLimitChars copy and rejection-only text-limit trigger, separate scope/reference failures retained. New mounted regression red1/1→green1/1, Windows full587/587 and release-check pass. No new real-window/IME or model capability acceptance. Evidence appended to validation/2026-11-01-agent-capacity.md; subsequent PR22/23 public heads unchanged.
2026-11-01 VV v2 actual source hash 0d74505ab45d61be0c3e2a3a27187c2024f671fbf803494422948b32e59b5dcf verified; source/override alignment and concrete remaining gaps appended to existing agent-workbench-layout ADR. No new product approval or test claimed; PR16–21 heads unchanged.

2026-11-01 JJ v1.1 limited integration: six shared-locale Agent keys for existing disconnected/basic controls, one connection status region; mounted+storage21/21. Actual transport/payload/history authorization and scoped tools remain pending; no whole-disk read or excluded-data guarantees. See existing workbench ADR; not full i18n acceptance.

2026-11-01 VV PR16 full-page baseline attribution incorporated into existing agent-layout-fix validation: assistant-closed matches base and overlays/menus24/24 remain valid; narrow preview/overflow are pre-existing but still in workbench acceptance scope. Assistant-open preview/playback/timeline/offscreen regressions distinct. No new tests or approval inferred.

2026-11-01 QQ PR19 close blocker: initial unreadable sessions explicitly window-only, no persistence dirty/write or assistant close block; main project save checks unchanged, subsequent write failures protected. See validation/2026-11-01-agent-temporary-sessions.md. Full readback/physical failure and release plaintext-retention disclosure remain pending; not entire Agent completion.

JJ session-policy follow-up: PR22 separates local storage scope text from save status; eligibility uses project ID, not name. Temporary read-failure behavior already implemented, loaded write failure still protects close. #17/18/19 copy approvals remain limited to their exact heads; #21 cda46345 separately public. See existing agent-temporary-sessions validation.
2026-11-01 PR20 timeline follow-up, based on public PR22 a455d6d: simple occupied/main-track filtering and advanced initial content focus; 16 exact Windows Electron viewport/mode/assistant cases verify default V1/A1 clip visibility and coordinate split/undo, plus 16 native-DPI cases. Full Node598/598 and release-check pass. PR22 close faults now exercised through real host/renderer/IPC: bad JSON/schema/read error close normally; project/save-write failures retain wait/force path. No chain approval inherited. See validation/2026-11-01-agent-layout-fix.md appended evidence; full simple mode, same-head VV, physical input, non-default track layouts, model and packaging remain open.

PR23 drag correction (base18261590): defer track folding/content focus during state.gesture; settle on completion/cancellation. Production VM6/6, Windows full601/601 and release-check pass; actual offscreen Electron coordinate drag3/3, visible/physical VV review pending. See existing agent-layout-fix validation section; no release or whole-workbench completion claim.

Simple view occupied-lane follow-up: V1/A1 placeholders retained only if their kind has no occupied lane; V2+A1 visible together at804/630 with preview>=160×90, offscreen4/4, Node602/602. VV originalPR23 drag result remains separate; new same-head visible acceptance pending. Details validation/2026-11-01-simple-primary.md.

2026-11-01 official-source integration increment: actual unchanged Cindy composer/text/configuration primitives at pinned0219236, main-owned user-configured fixed-provider text transport and explicit payload review, existing sentence proposal/apply/undo. Hidden Windows Electron session/config reopen and injected-response edit cycle verified; no live-provider acceptance, full Cindy container/tool parity, visible-window approval or portable package claim. See decisions/2026-11-01-official-cindy-port.md and validation/2026-11-01-official-pane.md.

2026-11-01 PR26 follow-up: proposal-card button calls existing global undo directly, localized latest-edit wording; real hidden Electron card Undo/topbar Redo/topbar Undo produce identical clip states and shared one-step depth. No separate undo history; visible/physical/live-model gates remain pending.

PR26 QQ follow-up: explicit backed-up connection reset, complete scheduler MIT notice and bundle license coverage; Windows628/628+release-check and hidden synthetic reset/reopen pass. Renderer-only consent limitation documented. Real provider/VV/portable release remain unverified; see existing official-pane validation record.

PR26 follow-up: own-application top-of-shared-undo eligibility and JJ final disclosure/noun chips;630/630 plus release-check and hidden DOM lifecycle pass. New same-head QQ/JJ/VV review required; live provider remains unaccepted.

PR26 VV workflow increment: readable review/text/chips/quoted proposal summary, fixed action, zero-send reask;634/634+release-check and hidden workflow pass.630x452 shows only reply end in29px scroll area, VV usability pending. Legacy proposal-dialog locale/time and separate three-track V3/V1/A1 visibility remain open.
Agent paste follow-up: independent PR22-based delta rejects entire over-limit paste before native maxlength truncates it, with explicit bilingual notice and retained accepted draft; exact-limit selected replacement accepted. Real trusted Chromium paste zh/en2/2; physical VV/JJ/QQ review pending. Evidence: validation/2026-11-01-agent-paste-limit.md. Other input overflow/IME behavior not expanded.
Independent three-track visibility increment (basePR25): V3 subtitle+V1 video+A1 audio initial focus now favors actual AV pair;8 hidden viewport/mode/assistant cases with full V1/A1 clip visibility and16 split/undos. No PR26 changes; combined-tree/visibleVV acceptance pending. See validation/2026-11-01-three-track.md.
