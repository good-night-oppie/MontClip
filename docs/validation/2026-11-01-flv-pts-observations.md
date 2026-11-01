# FLV PTS observations and conservative refusal

`check-flv-pts.cjs <fixture-directory>` copies only the two 606497-byte synthetic
FLVs into a new temporary directory, invokes production prepareMedia, then
inspects packet PTS/durations and decoded audio length. Originals are hash-checked
before/after. No XML interpretation, word editing, ASR or compositor export runs.
The receipt binds inspected sources, derived MP4s and preparation code hashes.

Before the guard, retained evidence directory `MontClip FLV PTS YivVcl`:
source gap FLV SHA256
`21b8bfdf32967f115dea77329360aae4aa4e2437fe50dd7603ec69bbd05b5bc6`.
Actual source packet ends: video 62.067s, audio 62.077s; format.duration 60.067s.
First video/audio PTS 0.067/0.046s; both streams have a two-second gap.
Derived MP4 has format duration 62.031333s, but direct PCM decoding returns only
60.031667s. The muxer stretches packet durations, so a near-zero output packet
gap metric alone does not prove inserted silent samples. This is a concrete
reason to withhold acceptance, not a measurement of the browser audio pipeline.

After the guard, the gap fixture produces FLV_TIMELINE_GAP without generating a
compatible MP4. The original survives. The normal fixture continues to remux;
its source SHA256 is
`107fd9402edfd428ef6933d9c7daeb45aed30e96fdb92942a89decebb84373ad`.
It starts video/audio at 0.067/0.046s; derived MP4 starts at 0.020/0s. The roughly
1ms rounding difference is observed, not accepted as a general resync guarantee.

Four small synthetic integration tests cover gap refusal even with transcode
consent, ordinary remux with frame/byte comparison, consent gating, and MCP
registration behavior. An initial strict packet-duration scan also rejected
legacy FLV1 (durations absent); the scanner now marks nominal-duration estimates
for the gap guard rather than claiming exact source endpoints. Actual range
selection never consumes these estimated endpoints.

Still incomplete: held-frame/silent-gap materialization and browser/compositor
agreement; source [27,35) export; normal [10,20) export with AV measurement; all
long-file, bundled-tool and visible UI acceptance. This change prevents silently
accepting a known unsupported timestamp case; it does not finish that feature.
