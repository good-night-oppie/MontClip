# Independent synthetic M0 inputs

These small text inputs were supplied by Rea, 2026-11-01, in the
`handoff/monteclip-m0-mapping` package. SPEC SHA-256:
`03eec2be769e0d5b60737a35889315d02b1043593585ec3c9bec1bf682ed2ea2`.
They contain original synthetic labels, no course or reverse-engineering material.

Expected user order is [9,12), then [1,4), six seconds. The original truth file
predates the boundary decision; apply `docs/decisions/2026-11-01-boundary-caption-semantics.md`
for its two pending cues: preserve whole text at [0,.2) and [5.8,6).
Unit tests do not validate actual exported video frames or A/V synchronization.
The reference MP4 is not a product output and is not included here.
