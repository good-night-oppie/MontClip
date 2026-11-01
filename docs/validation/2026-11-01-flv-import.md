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
