'use strict';
// VV / Deja 2026-11-02: a range that coincides with a caption's start and end said
// "1 句只保留了一部分声音" — a false alarm. Times are floats and land on frames, so
// "the same boundary" must allow for float error and for frame rounding.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const Plan = require('../shared/range-plan');
const FPS = 30, f = (n) => n / FPS;   // frame n in seconds, as the editor places captions

// a video and its audio under three captions that sit on frame boundaries
function doc(captions = [[31, 63, 'one'], [63, 97, 'two'], [97, 140, 'three']]) {
  return {
    fps: FPS, width: 1280, height: 720, revision: 1, markers: [], tracks: [], lockedTracks: [],
    media: [{ id: 'm', kind: 'video', src: '/media/a.mp4', duration: 10 }],
    clips: [
      { id: 'v', mediaId: 'm', kind: 'video', track: 'V1', start: 0, in: 0, duration: 6, props: {} },
      { id: 'au', mediaId: 'm', kind: 'audio', track: 'A1', start: 0, in: 0, duration: 6, props: {} },
      ...captions.map(([s, e, text], i) => ({ id: 'c' + i, kind: 'text', track: 'V2', start: f(s), duration: f(e) - f(s),
        props: { text, caption: true } })),
    ],
  };
}
const exact = (d, id) => { const c = d.clips.find((x) => x.id === id); return { from: c.start, to: c.start + c.duration }; };
const flagged = (plan) => plan.captions.filter((c) => c.status === 'visible' && c.truncated);

test('a range that is exactly a caption is not reported as cutting it, or its neighbours', () => {
  const d = doc();
  for (const id of ['c0', 'c1', 'c2']) {
    const plan = Plan.create(d, [exact(d, id)]);
    a.deepEqual(flagged(plan), [], id + ': ' + JSON.stringify(plan.captions.map((c) => [c.sourceCaptionId, c.truncated, c.status])));
    a.deepEqual(plan.captions.filter((c) => c.status === 'visible').map((c) => c.sourceCaptionId), [id], id + ': only that sentence is shown');
  }
  // several sentences, in another order
  const plan = Plan.create(d, [exact(d, 'c2'), exact(d, 'c0')]);
  a.deepEqual(flagged(plan), []);
});

test('a second pass over captions that already carry provenance stays exact too', () => {
  const d = doc();
  const first = Plan.create(d, [exact(d, 'c1'), exact(d, 'c2')]).project;
  for (const c of first.clips.filter((x) => x.props && x.props.caption)) {
    const plan = Plan.create(first, [exact(first, c.id)]);
    a.deepEqual(flagged(plan), [], c.id + ': ' + JSON.stringify(plan.captions.map((x) => [x.intersection, x.original])));
    // the ms-rounded caption overlaps the next media by a fraction of a millisecond: dropped, never a sliver
    a.ok(plan.project.clips.every((x) => x.duration >= require('../shared/edit-ops').MIN_DUR - 1e-9), JSON.stringify(plan.project.clips.map((x) => [x.id, x.duration])));
  }
});

test('a boundary within half a frame counts as the same boundary; a real cut is still reported', () => {
  const d = doc();
  const c = exact(d, 'c1');
  // the typed range is off by a few milliseconds, less than half a frame (16.7 ms)
  a.deepEqual(flagged(Plan.create(d, [{ from: c.from + 0.004, to: c.to - 0.006 }])), []);
  a.deepEqual(flagged(Plan.create(d, [{ from: +(c.from.toFixed(3)), to: +(c.to.toFixed(3)) }])), [], 'seconds typed to the millisecond');
  // a cut of more than a frame is a real cut
  const cut = flagged(Plan.create(d, [{ from: c.from + 2 / FPS, to: c.to }]));
  a.deepEqual(cut.map((x) => x.sourceCaptionId), ['c1']);
  const half = flagged(Plan.create(d, [{ from: c.from, to: (c.from + c.to) / 2 }]));
  a.deepEqual(half.map((x) => x.sourceCaptionId), ['c1']);
});

test('the dialog counts only the captions that are shown and really cut', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app/app.js'), 'utf8');
  const at = app.indexOf('async function showSentenceSelection(');
  const body = app.slice(at, app.indexOf('\n}\n', at));
  a.match(body, /plan\.captions\.filter\(\(?c\)? => c\.status === "visible" && c\.truncated\)\.length/);
});
