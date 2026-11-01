# Local FLV compatibility import (development)

Windows, Node 22.15.1, Electron 45.2.1, system FFmpeg/FFprobe 9.0.1.
No runtime download or large copies. Synthetic fixtures are 64x64, 0.3–0.5s.

`node --test test/flv-import.test.js` first failed both initial REST cases on
the old behavior; now three REST/MCP cases pass. Compatible input is remuxed,
decoded video frame hashes match the original, both original copies retain
their bytes. Legacy codecs return 409 without creating an MP4 until explicit
boolean consent. A string "true" is not consent. Traversal is rejected.
MCP denial does not change the project; approval retains source provenance.

`node desktop/smoke.js --flv` uses hidden Electron and calls importFiles with
synthetic File objects. It clicks production HTML confirmation buttons (not a
native system dialog or physical file picker). Chinese Cancel starts focused;
cancel preserves the saved project; English acceptance transcodes; browser
metadata loads; saved API readback retains originalSrc/preparation. Final smoke
also verifies isolated renderer, blocked external fetch, view switch state
preservation and close saving. All assertions pass. This does not measure
full playback, audio synchronization, long footage, visible layout or quit/reopen.

The smoke caught and led to fixes for dropped source fields during project
serialization and unnecessary saving on canceled imports. An intermediate test
incorrectly used the input-freezing close-save transaction mid-test and timed
out; using ordinary flushSave corrected the harness. Old smoke directories are
retained; none is a frozen release artifact or portable-package proof.

The original FLV and derived MP4 are persistent local project assets. No cleanup
policy silently deletes either. Compatibility conversion may be lossy and is
explicitly described before approval. Multi-video/audio layouts are refused.
Retries can retain additional imported originals; deduplication/cancellation
during conversion and progress reporting remain follow-up work. No automatic
timeline append or compositor change is introduced.

Pending: VV physical UI and small-window checks; JJ wording review; QQ review;
packaged FFmpeg/FFprobe with system tools absent; long-file resource handling,
AV <=40ms and original-time mapping across nonzero FLV timestamps. Do not claim
all FLV variants or release acceptance from these fixtures.

## PR4 wording revision requested by JJ/Deja

The confirmation uses the requested Chinese/English sentence and keeps Cancel
focused by default. Cancellation skips that file only; the uploaded original
remains on disk without a project entry, while the rest of a batch continues.
Server exceptions are stable codes only. Client messages use the current locale;
unknown error strings/paths are discarded. Generic preparation failure does not
guess a disk cause or offer a nonexistent details UI. ENOSPC alone selects the
storage message. Missing executables select the plain-language component repair
message; executable names remain implementation details.

`state.connected=false` can mean initial connection failed, not just a static
browser session. The UI distinguishes Electron (user agent used for wording
only, never permissions) or a previously connected session from a browser that
has never connected. Upload transport failures always use the service-unavailable
message. An unconnected standalone browser gets the full-app-opening message.

Tests cover both message catalogs, unknown/permission error sanitization versus
confirmed ENOSPC, real invalid/audio-only FLV and a server with no tool PATH.
Hidden Electron checks both confirmation languages, single-file and batch
Cancel, and injected server codes/unknown private-path detail/transport failure
in both locales through the actual importFiles handler. It also exercises the
disconnected flag in Electron. Standalone-browser wording classification has
unit coverage; an actual file:// browser walkthrough remains unrun. Real OS
disk-full, long transcode failures and VV visible UI remain unrun.

### JJ copy revision: unresolved smoke persistence check

The copy/error revision passed 563 Node tests and release-check on Windows.
Expanded hidden Electron checks observed both languages, per-file/batch cancellation
and safe error mapping passing. However two runs failed provenance readback:
`montclip-pr4-copy-smoke.log` (profile `p8gF0N`) and
`montclip-pr4-copy-smoke-final.log` (profile `14AVEY`). The latter failed before
service fault injection, with only the first imported item present on disk.
Waiting for metadata and flushing saves did not reliably resolve it. Other runs
passed, including diagnostic-instrumented runs; these do not erase the failures
or establish a root cause. Full Electron smoke/persistence acceptance remains
open. The pre-injection durable-provenance assertion is retained. No product
save logic was changed as part of this wording revision. Original logs/profiles
remain local and unchanged. This is not visible-window or portable-package proof.
