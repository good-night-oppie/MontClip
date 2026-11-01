# Bounded long FLV production inspection

Base: main bc771db9fa2fedd497f3eab5c17db4fc2418d03f. This separate branch does not change PR9/10/11. The benchmark loads exact public PR9 production prepare-media.js and flv-readable-range.js bytes from19377acd3dea9e0ff7df49cde62f020869c10580, records their SHA256 and invokes inspectFlv with readableRange:true. Only process launch/close observation is wrapped; results and command arguments are not substituted. This is not an Electron/REST/MCP or package test.

Reproduce explicitly: node .github/scripts/flv-long-check.js. Not in npm test. It creates a new task-owned temp directory, keeps all artifacts, bounds seed/long generation to180 seconds each, output to256MiB and checks10GiB reserve before starting. Production15-minute scan timeout is unchanged. Sampled owned bytes/minimum shared free space are recorded every250ms (not an OS allocation high-water guarantee). No existing input/profile/cache is removed. Uses the installed development GPLv3 FFmpeg, not an approved release distribution.

Fixture is a10-second blue static1920x1080/30fps H264 loop with B frames and continuous synthesized48kHz mono AAC silence,7200 seconds. This tests long-duration timestamp structure and low-complexity decoding; it does not represent camera motion, scene changes, speech, damaged real capture, target-machine load isolation, or2–3h live-recording performance. The documented earlier2-minute/3-hour estimates are not reused as measurements.

## Minimal PTS persistence design (not implemented)

Current public preparation returns src/originalSrc/preparation and does not persist a measured correspondence between the two clocks. range-plan/captions calculations use clip.in and timeline intervals; they cannot recover that missing correspondence. App media normalization spreads fields, but the exact project serialization/upload/MCP registration allowlists must all preserve any future field in the same reviewed change.

Proposed additive media metadata: versioned clock record with separately named original-container and prepared-container records, each binding file hash, stream identity, rational time_base, first/last presentation PTS and measurement method/tool revision. Preserve original measured values; do not overwrite them with normalized video zero. A source-to-output mapping is a separate verified assertion with correspondence evidence, not inferred from first-frame subtraction. Reordered frames, rounding, edit lists, discontinuities and transcoding require explicit validation or an unverified status; missing correspondence must not authorize transforming original-FLV subtitle times. Imported subtitles need a declared clock domain. Existing prepared-container projects must remain readable without fabricating original timing.

Required implementation regression later: prepare→UI and MCP registration→save JSON→reopen preserves both domains/hashes; stale/changed source rejects correspondence; nonzero audio/video starts and B-frame order; independent original/overlap/output caption fields; one undo; output SRT only output clock. This batch brings the existing nonzero20ms production range/caption arithmetic regression onto the clean main branch; it does not claim clock discovery or transform persistence.

## Actual run

Runner source1ba8382; target production source19377acd (module hashes in JSON). Windows x64, Node22.15.1, i7-11800H8cores/16logical,68,406,370,304 bytes RAM; shared machine, not isolated load. Installed FFmpeg/ffprobe9.0.1 full GPLv3 development binaries, exact executable hashes in JSON. Seed generation469.398ms; long input generation9893.666ms; external metadata probe52.064ms. All exited0.

Input:37,106,309 bytes, duration7200.2s, H2641080p30 with2Bframes and AAC48kHz mono silence. SHA256 before and after inspection 1c51c1dcb56f688ab7b8cb2c3f9cc2b2462ad20b866b84c25034a5b3650af467. Production inspect elapsed195288.011ms (3m15.288s), included probe47.054ms and full decoded scan195237.005ms; probe/scan exit0, no decode warnings.553,503 decoded frames across streams. Sampled task directory peak37,156,354 bytes; shared C free before41,637,724,160, minimum/final41,578,979,328 bytes; reserve remained above10GiB. Sampling excludes unseen sub250ms allocation peaks and other processes cannot be attributed to this task.

Actual range start0.046/end7200.200000000001/duration7200.154; maxGap0.06700000000000728; estimatedTail=false, needsConsent=false. Inspection completion is NOT preparation acceptance: unchanged prepareMedia gap predicate (>0.005) would reject this result before encoding, even with both consents. prepareMedia was not rerun to repeat the195s scan. No pass item for continuous long recording is added.

Two short follow-up frame windows (2s video, then4s AV including keyframe preroll) found no gap around the first loop join; the second actually covered8.003–12.034s. Their bounded results are retained separately. Thus the67ms maximum is not localized by these observations; do not assert that looping, B frames or the scanner caused it. A future single instrumented scan can retain offending type/PTS neighbors to classify it before optimizing; avoid unbounded frame logs.

Decision: this low-complexity2h case finishes within the unchanged15-minute watchdog, but user wait is over3minutes and no target latency criterion/real-capture complexity acceptance exists. There is insufficient equivalence evidence to replace show_frames with show_packets. Keep the current fail-closed gap guard. Packet candidates must separately cover per-stream start/end, reordered Bframes (PTS vs DTS), durations/quantization, holes and corrupt decode cases before a production change.

## Clean-branch checks

After measurement (not competing with timed decode), Windows/Node22.15.1 npm test563/563,0 fail/cancel/skip and node .github/scripts/release-check.js passed on c5420a8445c8dcc7c13c216de6644a28543c719f/tree b1a85b7ea6993825f703ae315c3b89846ac5bae3. Runner itself was syntax-checked and actually executed once; it is never run automatically by the test suite. Final commit adds only evidence bindings. Linux/macOS not run.
docs/validation/2026-11-01-flv-long-full.log sanitized UTF-8 LF SHA256 c7a4a0f7654184b962de01d0f0a4bf648e0e759c2d2d54646b4e4c54b557efde
docs/validation/2026-11-01-flv-long-release.log sanitized UTF-8 LF SHA256 5a0e4845a4bae15d87b152750d4b1609256641d0ca3f298fe42a79199aa05b58
docs/validation/2026-11-01-flv-long-benchmark.json sanitized UTF-8 LF SHA256 3e9431f33f7782a054f259eee9d5baa0a75ca8a64e5b0ae3cbbec746cc9fe660

## Single bounded-neighbor follow-up

PR12 original head1f795ec is preserved. Diagnostic branch runner f4006f9 reused the same retained input; SHA256 matched before and after. One full decoded scan with extra DTS/position fields ran200936.425ms, exit0, empty stderr,553503frames. The frozen19377acd production accumulator and bounded observer both report0.06700000000000728 maximum; exactly one maximum occurrence. No input generated, modified or deleted. Production thresholds/timeouts/consents are unchanged.

Exact boundary is VIDEO stream_index0 at EOF, not the first loop join:
- Previous frame I/keyframe: PTS/best_effort7200.067000, duration0.033000 → covered end7200.100000, byte position37099326. Decoded frame DTS is N/A at decoder drain.
- Next and final frame P: PTS/best_effort7200.167000, duration0.033000 → end7200.200000, byte position37106234; decoded DTS N/A; no later video frame.
- Last earlier presentation frames were7200.000(B) and7200.034(P), both33ms.

A separate bounded tail packet query (-read_intervals7198%,158packets) resolves the unavailable decoded DTS using identical byte positions: I packet PTS7200.067/DTS7200.000; P packet PTS7200.167/DTS7200.034. Sorted video packet PTS also contains no frame at7200.100 or7200.134. Audio tail PTS/DTS7200.003,.024,.046, each21ms. The67ms uncovered presentation interval is present in this generated file, not created by accumulator arrival order or rounding. This classifies an input-tail structural gap; it does not prove the detailed encoder/mux cutoff mechanism, nor that all B-frame streams are broken. A static blue display could conceal it visually; the timeline guard must still refuse it.

Packet DTS advances34ms across this boundary, so switching to packet-DTS continuity would falsely accept this actual fixture. Packet PTS must also account for reorder and decoded validity; no packet replacement is justified by this evidence. Minimum action: keep production refusal unchanged and treat this particular benchmark fixture as long-decode performance evidence plus a real tail-gap rejection case, never a continuous-long-input acceptance fixture. A future continuous fixture needs separate generation/validation and cannot retroactively change these results.

Evidence:2026-11-01-flv-gap-neighbors.json records max neighbors and exact commands;2026-11-01-flv-gap-tail-packets.json records bounded tail packets in decode/presentation order. Diagnostic storage is two per-type rings of3, one max record plus3 later frames, counters, and at most8KiB stderr; no all-frame log. Focused observer tests2/2 include exact PTS-vs-DTS tail example. Production accumulator uses its original frame duration handling; the observer explicitly refuses absent durations rather than claiming fallback equivalence. No production code changed.

Deja's receipt: PR11 dec39178 QQ formal approval582/582, but remains on its current base pending PR9 merge/rebase verification; neither reviewed head moved. Original-FLV/output PTS correspondence, user-recording/2–3h complexity, Electron and export-sync gates remain open.


Follow-up validation on bd7893d3e87f067aee3b0f93dbad181cc7c7624b/tree d73a770f145f9ef7f23475f096b6f939e9229e90: Windows x64 Node22.15.1 npm test 565/565, 0 fail/cancel/skip; node .github/scripts/release-check.js exit0. Node checks only; Electron/real-capture/package acceptance and Linux/macOS not run. Hashes are sanitized LF working-file bytes.
docs/validation/2026-11-01-flv-neighbor-full.log sanitized UTF-8 LF SHA256 946bb5191d5267e3ac16ff32ef1b148b447e6e0efb1a6fe348d09599f1be5178
docs/validation/2026-11-01-flv-neighbor-release.log sanitized UTF-8 LF SHA256 5a0e4845a4bae15d87b152750d4b1609256641d0ca3f298fe42a79199aa05b58


## Follow-up scope and retained-directory inventory

Deja relayed QQ approval of PR12 head1f795ec (563/563), not release acceptance. The B-frame/stream-loop seam hypothesis remains a hypothesis: the first 8–12s window does not exclude other joins. The full scan located the unique maximum at EOF near the 7200s boundary, but location alone cannot distinguish loop-junction behavior from final cutoff/encoder draining. No causal assertion or tolerance change follows from B frames being present. Presentation ordering and container decode ordering are both retained in the tail JSON; the 67ms video coverage hole persists in presentation order. Last audio packet ends at7200.067 (7200.046+.021), before the video hole starts7200.100; audio does not bridge that missing video coverage. These are rounded reported packet durations, not a perceptual synchronization measurement. Disposition remains fail closed pending requester decision; no missing frames are silently allowed.

The benchmark runner is Windows-only for this task's supported execution/reproduction; the neighbor observer was also executed and validated only on Windows. This is not a portability claim based on Node syntax. Real picture complexity,60fps,low-core targets,progress/cancel and Electron remain untested.

Retained task-owned directory inventory (listing only, no deletion authorized or performed here): %TEMP%/MontClip-long-flv-50s8O0 contains this task's synthetic seed/two-hours.flv, copied small production JS snapshot and measurement report. Only that exact task directory is a future cleanup candidate after evidence retention is agreed; never use a broad MontClip-* wildcard or delete other profiles/caches. Re-resolve the exact absolute path and verify ownership and input hash before any future cleanup. Tracked sanitized JSON/log evidence stays separate. No new directory or duplicate input was created for the neighbor follow-up.
