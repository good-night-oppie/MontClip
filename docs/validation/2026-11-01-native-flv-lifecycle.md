# Desktop FLV lifecycle revision

Based on PR4 36cc227; PR4 and PR1/2/3/5/6 heads remain unchanged. This branch
addresses VV's desktop selected-file cancellation, confirmation and busy-state
findings. It also contains JJ's final generic/disk error wording (toast has no
Details link). It is not an overall product or packaging acceptance report.

## Implemented boundary

- A narrow sandboxed preload accepts a real selected File, derives its path
  internally, and sends only fixed IPC operations. Main validates sender, main
  frame and exact origin. No arbitrary-path HTTP endpoint or generic IPC bridge.
- Probe and SHA-256 read the original in place. Confirmation cancellation writes
  no copy. Confirmation precedes streaming copy and conversion; copied bytes
  must match the inspected content. No source is modified.
- Successful imports retain independent original/compatible copies. Repeated
  identical content in the same process prompts before another copy; no reuse,
  reference-count scheme, cross-session duplicate detection or history cleanup.
- Cancel aborts this job; cleanup is restricted to exclusively created owned
  files, including outputs not yet registered after metadata failure or project
  switch. Registered media is retained. Shutdown/renderer crash abort active
  native jobs. Whole-package shutdown acceptance remains pending.
- Centered themed dialog, wrapping filename/body and spaced buttons; cancel is
  initially focused. Busy status is elapsed seconds, never inferred percent.
  Native import cancellation and completion are distinct outcomes.

## Evidence and limitations

Node integration tests use small synthetic FLV: three probe/cancel cycles create
no media, denied conversion cleans its own copy, changed source is refused,
cancelled preparation leaves no owned files, registered copies and an unrelated
historical file survive shutdown, duplicate content is identified within session.
Additional failure injection verifies that removal failure is reported and its
owned paths remain tracked for shutdown retry. Shutdown awaits active operation
completion before releasing the host. Busy work is not expired mid-operation;
the idle cleanup timer is rearmed when it completes.

`node desktop/smoke.js --flv-native` uses actual File objects populated by CDP
DOM.setFileInputFiles in hidden Electron. It calls production importFiles and
clicks production HTML buttons/dispatches a cancel event: zh cancel, en cancel,
zero new files, modal bounds/default focus, successful conversion and provenance
readback, repeat-content prompt, busy cancellation and retention of registered
files. It is not a physical picker, real Esc-key test, narrow-window/VV acceptance,
multi-GB run, disk-full run or portable-package proof.

A controlled stale project response first failed with "Stale project response
replaced the imported media" (local log montclip-native-stale-red2.log). Ordinary
sync now ignores equal/older revisions. The test passes after that change;
forced conflict/project-switch reloads are not removed. Historical failed logs
remain; prior PR4 artifacts are not retroactively reclassified. New native and
legacy FLV smoke pass on this code, with separate fresh data directories.

Browser-generated File uploads/REST/MCP still use their old retained-upload
semantics; this native fix does not claim zero-residual cancellation there.
No cross-project deduplication, accurate storage forecast, post-gap AV proof,
full Chinese UI, complete simple/advanced UI or packaged FFmpeg acceptance.
PR5 gap guard must be retained during integration; this stacked branch does not
contain it and does not authorize accepting gaps. See the presentation-clock ADR.

Registration intentionally hands media ownership to the project before its
debounced save; failed-save protection retains those assets rather than deleting
files still referenced by the editor. Abrupt process termination in that window
can leave unreferenced copies. No crash-recovery manifest or cross-session garbage
collector is claimed. Successful import consumes an original copy plus MP4; the
same-session repeat prompt explicitly warns of the extra disk usage. Multi-GB
budget forecasts and measurements remain outstanding.

Self-check: accuracy 4/5 (synthetic hidden-window evidence, no real package);
completeness 3/5 (browser/MCP cancellation, crash recovery and large-file checks
remain); clarity 4/5 (native versus legacy boundaries explicit); actionability
4/5 (reproducible smoke commands, review still required); conciseness 4/5
(evidence separated from implementation). Overall 3.8/5. Highest-priority next
checks: VV visible/narrow-window/long-task close, QQ IPC/ownership review, then
cross-session recovery and storage-budget behavior. This is a partial product
batch, not completion of the broader request.
