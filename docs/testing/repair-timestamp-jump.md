# Repair remux: timestamp jump and truncated tail

Run `node scripts/repair-timestamps-bench.js`. It creates synthetic files and a
`results.json` in a new OS temporary directory; it never reads user recordings.
`node --test test/repair-genpts.test.js` checks the command, finite-duration guard,
and the real sample's rejection at the fallback-encoder boundary.

The source is the committed synthetic H.264/AAC test pattern
`test/fixtures/truncated-h264/obs-crash.mkv`. FFmpeg copies its first two seconds
into two MPEG-TS segments, with `-output_ts_offset 0` and `20`. The script joins
the first segment to 70% of the second. This avoids platform-specific encoders.
It probes the packet timestamps to verify that the muxer did not smooth away
the discontinuity.

## Windows observation

Bundled FFmpeg: `n9.0.2-42-gd7643a0fe3-20261102`.

- Complete concatenation: 109,792 bytes; truncated sample: 93,323 bytes.
- 105 video packets; at packet index 60, PTS changes from 3.388 to 21.400 s:
  a forward jump of 18.012 s.
- `media-probe` reports 21.471 s for the input.

| Remux input options | Output duration | Strict full decode | Remux + probe + decode |
| --- | ---: | --- | ---: |
| Previous command | 3.521667 s | Pass | 196.6 ms |
| `-fflags +genpts` | 3.521667 s | Pass | 188.9 ms |
| `-fflags +genpts+igndts` | 3.521667 s | Pass | 177.8 ms |
| Previous row plus `-err_detect ignore_err` | 3.521667 s | Pass | 193.9 ms |

All remux commands exit zero. The duration difference is 17.949333 s, so all
outputs fail the existing ±1 s guard. In the real repair pipeline, before and
after `+genpts` both enter step 3, try four encoder candidates, and finish with
`REPAIR_FAILED`. Pipeline times were 3.994 s and 4.300 s respectively. These are
single-run observations, not a speed benchmark. The diagnostic script runs
strict decode separately to show why decode success alone is insufficient;
production rejects the wrong duration before reaching that decode check.

## Decision

Add only input `+genpts`, as a request to generate missing presentation timestamps.
This sample demonstrates **no avoided transcode and no repair-rate improvement**.
Existing timestamp jumps are not necessarily fixed by that flag. Neither `igndts`
nor `ignore_err` earned a place in the remux command from this comparison.

Keep finite duration, minimum 0.5 s, ±1 s against the input's reported usable
duration, and `-xerror -err_detect explode` full decode. The current ±1 s limit
is stricter than `max(1 s, 2%)`; this change does not relax it. When the source's
timeline itself is discontinuous, conservative refusal is preferable to calling
a much shorter copy a successful repair. No claim of “95% repaired in seconds”
is supported by this one synthetic sample.
