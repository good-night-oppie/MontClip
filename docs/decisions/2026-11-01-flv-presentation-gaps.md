# FLV presentation gaps use one source PTS timeline

Status: product decision relayed by Deja on 2026-11-01; implementation incomplete.

Default semantics preserve presentation-time gaps: hold the previous valid
picture and output silence during missing audio. Do not collapse a two-second
gap or cut content implicitly. Keep the original bytes unchanged. Preview and
export must share this same timeline, with a single common zero point across
streams and the original A/V offset retained. Never independently reset the
first audio sample and first video frame to zero.

For a fully inspected input, derive the common origin from the earliest A/V PTS
and the end from actual packet/decoded-frame end times, not FLV onMetaData's
possibly stale format.duration. An estimated last-frame duration must be marked
as estimated and cannot silently establish an accepted range. Source [27,35)
means that interval on the shared presentation timeline. Expected repetitions
follow the actual PTS and output sample rate; "61 duplicates" is one fixture/tool
observation, not a universal assertion.

If the product cannot correctly implement these semantics, explain the missing
capability and stop import while preserving the original. Refusal is a safety
boundary, not completed FLV support. The first implementation therefore rejects
detected packet gaps rather than passing an unverified remux to the compositor.
Five milliseconds is an inspection allowance for millisecond timestamp and
packet-duration rounding, not an AV acceptance threshold. Gaps below that guard
are not thereby proven correct. Legacy video missing packet durations may use
declared cadence solely for the refusal check; estimatedDurations records it.
Packet scanning has bounded reordering memory and a timeout; missing/ambiguous
timestamps or excessive reordering fail explicitly. Long-recording behavior
remains unverified.

XML sending clocks and container timestamp jumps have independent origins.
Do not automatically shift danmaku or claim synchronization is known. Original
tone-token fixtures validate neither ASR nor Chinese word alignment; absent a
verified word-level entry, report the missing entry and retain word-cut guards.

## Independent fixture scope

Read only Rea's `handoff/monteclip-flv-word-fixtures/SPEC.md` and the synthetic
inputs. SPEC SHA256:
`3a43e41323614d02852cd7fb9aa0986727eb59405130adabf7df3303eb42d9bb`.
The decision above selects gap preservation from the alternatives described in
that SPEC; its alternative collapse semantics do not override this decision.

The normal FLV [10,20) and gap FLV [27,35) still require actual product compositor
export/frame/AV verification. Preparation-only observations do not satisfy them.
PR2's earlier MP4/SRT evidence and PR4's small continuous-FLV tests do not cover
these new cases. Do not expand either frozen head's acceptance scope.
