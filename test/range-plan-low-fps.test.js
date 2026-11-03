'use strict';
// QQ (#36, 9001f793 and again 52c0287): the boundary tolerance was half a frame with no ceiling. Under 10 fps it
// reached Edit.MIN_DUR (50 ms), so a real media sliver between the two was dropped silently instead of refused:
// at fps 5, keeping 0–0.04 s of a video whose audio starts at 0.03 s returned no clips at all. At fps 1 a caption
// cut by 0.4 s was not marked truncated. The tolerance now stops at 1/48 s (under MIN_DUR) whatever the frame rate.
const test = require('node:test'), a = require('node:assert/strict');
const Plan = require('../range-plan'), Edit = require('../edit-ops');

function doc(fps, audioStart = 0.03) {
  return {
    fps, width: 1280, height: 720, revision: 1, markers: [], tracks: [], lockedTracks: [],
    media: [{ id: 'm', kind: 'video', src: '/media/a.mp4', duration: 10 }],
    clips: [
      { id: 'v', mediaId: 'm', kind: 'video', track: 'V1', start: 0, in: 0, duration: 10, props: {} },
      { id: 'au', mediaId: 'm', kind: 'audio', track: 'A1', start: audioStart, in: audioStart, duration: 10 - audioStart, props: {} },
    ],
  };
}

test('the tolerance has a ceiling below the shortest clip the engine keeps, at any frame rate', () => {
  for (const fps of [1, 5, 10, 12, 24, 25, 30, 60]) {
    const tol = Plan.boundaryTolerance(fps);
    a.ok(tol < Edit.MIN_DUR, `fps ${fps}: ${tol} < ${Edit.MIN_DUR}`);
    a.ok(tol <= 1 / 48 + 1e-12, `fps ${fps}: at most 1/48 s`);
    a.ok(tol >= 0.0015, `fps ${fps}: never under the 1 ms output rounding`);
  }
  a.equal(Plan.boundaryTolerance(30), 0.5 / 30, 'at 30 fps it stays half a frame');
});

test('QQ\'s repro: a 40 ms keep with a 10 ms audio sliver is refused at 30, 5 and 1 fps, never emptied', () => {
  for (const fps of [30, 5, 1]) {
    let error = null, plan = null;
    try { plan = Plan.create(doc(fps), [{ from: 0, to: 0.04 }]); } catch (e) { error = e; }
    a.ok(error, `fps ${fps}: refused, not planned` + (plan ? ' (got ' + plan.project.clips.length + ' clips)' : ''));
    a.equal(error.code, 'short-media', `fps ${fps}`);
  }
});

test('at 1 fps a caption cut by 0.4 s is marked truncated', () => {
  const d = doc(1, 0);
  d.clips.push({ id: 'c', kind: 'text', track: 'V2', start: 1, duration: 2, props: { text: 'x', caption: true } });
  const plan = Plan.create(d, [{ from: 1.4, to: 3 }]);
  const entry = plan.captions.find((c) => c.sourceCaptionId === 'c' && c.status === 'visible');
  a.equal(entry.truncated, true);
});
