# #285 review follow-up: quantization and independent source In

Owner: Cindy. This addresses [QQ's review of
e3e988d67288a3326cacbe118b02fb578802bdfb](https://github.com/good-night-oppie/MontClip/pull/288#pullrequestreview-5865797336).
The final published head and its test receipts are recorded separately in the
Issue's append-only evidence. This document is not approval or a new Cindy run.

## Reproduced failures and changes

The real split operation rounds source In to four decimals. At 30, 60 and
29.97 fps, a normal split can differ from the unrounded tail by about 33 us.
The former 1 us roll guard refused even a zero-delta drag probe. Roll guards now
allow 150 us of split/trim quantization; source handles remain strict, with no
silent delta clamp. Tests compare repeated rolls against the unchanged-source
editor behavior at 25/30/60/29.97/30000:1001 fps and speeds 1/1.5.

A replacement picture's In belongs to its own file. It must not equal the
original recording's In. Relinking now preserves recorded groups by timeline
start/duration, while audio channels from the same file must agree on In.
Roll retains same-source picture/audio In checks, matching speeds, channel
identity, source continuity, locks and source bounds. The offset fixture uses
original audio In 30 and a 35-second B picture at In 0; ±0.1 and the exact B
boundary pass, while exceeding that boundary refuses without mutations.

The old orphan guard also compared cross-source In. After relink lost the group,
that could miss the orphan and move only the opposite sound. The guard now uses
timeline geometry without comparing the two files' In, and never recruits audio.

## Red/green receipts

Node v22.15.1, Windows. Full logs remain in the isolated task's
`.artifacts/issue285/`; ask the owner for those exact files. These counts and
hashes summarize the logs and do not replace the full TAP.

| Command / file | Result | SHA-256 |
|---|---|---|
| `node --test test/roll-replaced-picture.test.js`, `review-red.tap` before production edits | 194 total, 153 pass, 41 fail | `1f4bd7b556485677db25f1de63da86fe28369007e82062538286b9a482c8fc0f` |
| Same command, `review-green-first.tap` | 194 pass, 0 fail | `4731cd278f3a2ff953810ce2b114313cc1f46bad5ca1c73360903675767b87bd` |
| Additional same-source picture/audio In guard, `review-same-source-red.tap` | 1 fail before restoring the same-source check | `43610451b3a2f97577f03eb9ec4ee3ae00277ea94f0886252a49b8ba04e2f7f9` |
| Focused command below, `review-focused-final.tap` | 254 pass, 0 fail | `d946664d7640fb871786579a02f562e82ce9f25511f2ea5372b956ed6a00c439` |

```text
node --test --test-concurrency=2 test/mcp-edit-ops.test.js test/source-edit.test.js test/trim-tools.test.js test/segment-edits.test.js test/roll-replaced-picture.test.js
```

The first attempted broader command named nonexistent edit-ops/project-ops test
files. Node only ran the existing 194 tests; that run is retained as
`review-focused.tap`, not claimed as broader coverage. The corrected command
above selects the actual files.

## Hidden export comparison and limits

`MONTCLIP_ROLL_REVIEW=1` selects eight hidden Electron cases in
`desktop/roll-av-smoke.cjs`: 30/60/29.97 fps split/repeated-roll cases and an
independent-In case, each with an unchanged-source control. It exports at 25 fps
using existing synthetic 25 fps A/B media, the real compositor and Master preset.
This is an export comparison, not a source-codec frame-rate qualification or a
Cindy-window run. Each case exercises undo/redo and saved readback.

The initial control in `review1/roll-av.json` failed the old one-sample interval
gate: its existing split/trim rounding causes 104.167 us of beep-interval drift.
That failure is retained. Review mode reports the drift and allows 150 us plus
one audio sample, while additionally requiring each mixed-source output's L/R
PCM to match its corresponding unchanged-source control exactly. The original
64-case mode and its interval threshold are unchanged. This measurement policy
and the damaged-project boundary below were
[pre-checked by QQ](https://github.com/good-night-oppie/MontClip/issues/285#issuecomment-6808532385).
Current-head incremental verification is still required; this is not approval.

The preliminary `review2` run passed 8/8, with all four mixed-source L/R PCM
comparisons equal, no silence, worst A/V offset 33.292 ms and maximum interval
drift 104.167 us. It preceded the final same-source guard and main synchronization;
it must not be relabelled as a final-head run. Final receipts follow in the Issue.

The premerge full suite (`npm.cmd test -- --test-concurrency=2`) returned
2,676 pass, 1 fail, 17 skip in `review-full-premerge.log`. The ZIP test failed
because Windows PowerShell 5 inherited PowerShell 7's Archive module path:
`ExtractToDirectory` had no three-argument overload. An isolated probe retained
the actual stderr. Filtering only that PowerShell 7 module directory from the
test subprocess environment made the unchanged ZIP tests pass 5/5 in
`review-zip-clean-env.tap`. No system setting, product code or assertion changed.
A second premerge full run was interrupted when the controlled sync receipt
arrived; it is not a completed suite. A hidden `review3-final-local` run also
overlapped local synchronization and is retained only as preliminary, not used
as final-head evidence. The published-head runs are recorded separately.

The previously accepted 7 real Cindy cases and 64 original exports remain bound
to their original runtime/head. No candidate is installed for this follow-up.
QQ must write the promised incremental verification on the new complete head.

Tests cover the listed illegal geometry/source cases, not arbitrary damaged old
projects. In particular, shifting both orphaned stems by 2 ms can make relink
and the orphan guard lose the original association; that pre-existing damaged
state is not repaired here. No arbitrary overlapping sound is guessed into a
group. Long sequences of rounded edits and higher untested speeds are not claimed
to have unlimited precision. App UI and JJ refusal wording are unchanged.

## Slip follow-up approved by QQ

[QQ's current-head decision](https://github.com/good-night-oppie/MontClip/pull/288#pullrequestreview-5866622431)
approved closing the adjacent `slipClip` invariant in this same task. At
`fe43df892f0a844c915837c04ae98ff4f8b2ce5e`, a saved group with picture B In 0
and original A audio In 30 slipped by -0.1 incorrectly set all three In values
to 0.1. The slip guard used a shared absolute In instead of a shared displacement.

The fix takes each source member's own head room and its tail room computed
with `timeAt(member, end)`. It clamps one common source-seconds shift to their
intersection, adds that shift to each original In and returns the applied delta
in the grabbed clip's timeline units. A known length bounds the tail; an unknown
length keeps the existing unbounded-tail behavior. Non-finite/missing patch
deltas are still rejected before edits. Locks, explicit unlink, timeline
positions/durations and keyframes retain their existing behavior. It does not
change slip into roll's all-or-nothing refusal, nor independently scale each
member's displacement: the existing same-source 1x picture / 2x sound test
continues to return -10 for its clamped request, keeping their In values equal.

The initially saved 14-case red suite had 6 pass / 8 fail. Two additional
compatibility cases cover invalid patch deltas and unknown source lengths:
`node --test test/slip-replaced-picture.test.js` before the fix had 16 total,
7 pass / 9 fail. Exact red source SHA-256:
`9f0ff94543a80ca14926bbb61367d4c21d7bc8f5b2178bce3ee051eed6d8335d`;
`slip-approved-red.tap` SHA-256:
`0a7cecd25fb4ef0c606777748b42bb1097267d950552355877a81a2cf248aed2`.

```text
node --test --test-concurrency=2 test/slip-replaced-picture.test.js test/roll-replaced-picture.test.js test/trim-tools.test.js test/mcp-edit-ops.test.js
node .github/scripts/release-check.js
node docs/demo/sync.js
```

The focused run passed 248/248, including the existing mixed-speed contract;
`slip-approved-green.tap` SHA-256:
`f801c061e8aa2483d61f2d8c05e670916839804766461d727867725038534263`.
Release readiness passed. Full logs remain in the isolated task's `.artifacts/issue285`.
The final published head, full-suite and CI readbacks are appended to Issue #285.

QQ explicitly waived repeating the candidate install, desktop use and the
eight hidden exports for this small arithmetic increment. The 7 real Cindy
cases remain on e3e988d6 and the 8 hidden cases on fe43df89; they are not labelled
as new-head runs. QQ's promised written incremental verification on the final
head is still required. No `app.js`, JJ wording, main sync, dependencies, model,
network feature or CI change is included in this slip increment.
