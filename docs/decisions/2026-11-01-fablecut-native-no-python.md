# MontClip: extend FableCut directly; no Python sidecar

Status: Accepted owner requirement, 2026-11-01. Implementation pending.

MontClip is the fork at https://github.com/good-night-oppie/MontClip of
ronak-create/FableCut, initially pinned to
579b08ec1a789baec5cbf06d7430373460508d09.

The owner explicitly requires implementing JJ-Agent capabilities directly in
the FableCut codebase, without a Python sidecar. This supersedes both the earlier
Python editing/ASR sidecar proposal and the narrower Python-only-ASR proposal.

- Extend FableCut's editor, timeline operations, project history, transcript
  workflows and shared preview/export compositor.
- Do not ship a Python runtime, launch a Python backend, or route editing or
  transcription through the legacy JJ-Agent Python services.
- Reuse legacy requirements, synthetic boundary cases and verification lessons;
  reimplement required product behavior within the FableCut architecture.
- Node/Electron may invoke the packaged FFmpeg tools directly. This decision
  does not select an ASR engine; evaluate a non-Python implementation before
  claiming offline transcription works.
- Preserve local processing and explicit network boundaries. Do not silently
  substitute cloud transcription or automatic model downloads.
- Keep one project state/transaction path and the shared compositor. Do not add
  a second legacy save/undo or rendering system.

Windows Electron portable delivery remains first, with macOS/Linux following.
The upstream MIT license and attribution remain intact.

Verification for this change: documentation only; no product code changes or
runtime tests. Future package acceptance must inspect contents and process
launches to confirm no Python runtime or Python sidecar is used.
