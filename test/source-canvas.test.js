'use strict';
// N25 (Deja 2026-11-03): an empty project takes its canvas from the first recording imported into it. The frame rate is
// the recording's average (avg_frame_rate) snapped to a standard rate, 30 when none is near; the size is the recording's
// own (never scaled up or down). A canvas the streamer chose, and a project that already has something in it, stay.
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const M = require('../media-lib');

test('the average frame rate snaps to the nearest standard rate within 3 %, else nothing', () => {
  for (const [avg, want] of [[60, 60], [59.94, 59.94], [59.92, 59.94], [59.9375, 59.94], [58.7, 59.94], [60.5, 60], [30, 30],
    [29.97, 29.97], [29.98, 29.97], [25, 25], [24.6, 25], [24, 24], [23.976, 23.976], [50, 50], [49.2, 50]])
    a.equal(M.standardFps(avg), want, String(avg));
  for (const avg of [45, 15, 120, 1000, 0, -1, NaN, null, undefined]) a.equal(M.standardFps(avg), null, String(avg));
});

test('the canvas from a recording: its own size (even), its snapped rate, 30 when no standard rate is near', () => {
  a.deepEqual(M.sourceCanvas({ kind: 'video', width: 1920, height: 1080, fps: 60 }), { width: 1920, height: 1080, fps: 60, fpsSnapped: true });
  a.deepEqual(M.sourceCanvas({ kind: 'video', width: 1280, height: 720, fps: 25 }), { width: 1280, height: 720, fps: 25, fpsSnapped: true });
  // above 1080p: kept as it is (Deja: decide on real use whether to bring it down)
  a.deepEqual(M.sourceCanvas({ kind: 'video', width: 3840, height: 2160, fps: 59.94 }), { width: 3840, height: 2160, fps: 59.94, fpsSnapped: true });
  // odd sizes go down to even (H.264 4:2:0)
  a.deepEqual(M.sourceCanvas({ kind: 'video', width: 1279, height: 721, fps: 30 }), { width: 1278, height: 720, fps: 30, fpsSnapped: true });
  // an odd rate: 30, and it says so
  a.deepEqual(M.sourceCanvas({ kind: 'video', width: 1920, height: 1080, fps: 45 }), { width: 1920, height: 1080, fps: 30, fpsSnapped: false });
  // not a recording, or its details not read yet
  for (const m of [{ kind: 'audio', fps: 60 }, { kind: 'image', width: 100, height: 100 }, { kind: 'video', width: 1920, height: 1080 },
    { kind: 'video', fps: 60 }, { kind: 'video', width: 8, height: 8, fps: 30 }, null])
    a.equal(M.sourceCanvas(m), null, JSON.stringify(m));
});

test('which projects follow: empty, on a default canvas, not chosen by the streamer', () => {
  const empty = (o = {}) => ({ width: 1920, height: 1080, fps: 30, media: [], clips: [], ...o });
  a.equal(M.canvasFollowsSource(empty()), true, 'a new project (1080p template)');
  a.equal(M.canvasFollowsSource(empty({ width: 1280, height: 720 })), true, 'the first-run project (720p)');
  a.equal(M.canvasFollowsSource(empty({ media: [{ id: 'a', kind: 'audio' }] })), true, 'only sound in the bin');
  // the streamer chose it
  a.equal(M.canvasFollowsSource(empty({ canvasUser: true })), false);
  a.equal(M.canvasFollowsSource(empty({ width: 1080, height: 1920 })), false, 'a canvas no default has (chosen before this change)');
  a.equal(M.canvasFollowsSource(empty({ fps: 25 })), false);
  a.equal(M.canvasFollowsSource(empty({ exportFrame: { x: 0, y: 0, w: 608, h: 1080 } })), false);
  // something in it already
  a.equal(M.canvasFollowsSource(empty({ clips: [{ id: 'c', kind: 'text' }] })), false);
  a.equal(M.canvasFollowsSource(empty({ media: [{ id: 'v', kind: 'video' }] })), false, 'a recording in the bin');
  a.equal(M.canvasFollowsSource(empty({ media: [{ id: 'i', kind: 'image' }] })), false);
  a.equal(M.canvasFollowsSource(empty({ comps: [{ id: 'k', clips: [] }] })), false);
  a.equal(M.canvasFollowsSource(empty({ sequences: [{ id: 'main' }, { id: 's2', clips: [] }] })), false, 'a second sequence');
  a.equal(M.canvasFollowsSource(null), false);
});

test('a project made from another template, or with its own rate or size, is the streamer\'s choice', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-canvas-'));
  try {
    const projectFile = path.join(dir, 'project.json');
    fs.writeFileSync(projectFile, JSON.stringify({ name: 'x', width: 1280, height: 720, fps: 30, revision: 0, media: [], clips: [] }));
    const P = require('../projects').createProjects({ dataDir: dir, projectFile, libraryDir: path.join(dir, 'library') });
    const doc = (o) => JSON.parse(fs.readFileSync(path.join(dir, 'projects', P.create({ name: 'n', open: false, ...o }).id, 'project.json'), 'utf8'));
    a.equal(doc({}).canvasUser, undefined, 'the default template');
    a.equal(doc({ template: 'landscape-1080' }).canvasUser, undefined, 'the default, named');
    a.equal(doc({ template: 'vertical-1080' }).canvasUser, true);
    a.equal(doc({ fps: 60 }).canvasUser, true);
    a.equal(doc({ width: 1280, height: 720 }).canvasUser, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('an agent setting the canvas or the rate is a choice too', () => {
  const Ops = require('../project-ops');
  const run = (set) => { const doc = { width: 1920, height: 1080, fps: 30, revision: 1, media: [], clips: [] }; Ops.applyPatch(doc, [{ op: 'setProject', set }]); return doc; };
  a.equal(run({ fps: 60 }).canvasUser, true);
  a.equal(run({ width: 1080, height: 1920 }).canvasUser, true);
  a.equal(run({ name: 'x' }).canvasUser, undefined);
});

// JJ's final words (Deja, on #97), whole sentences in both languages; the odd one points at the frame rate menu above the
// preview (#fpsSel in the program monitor's head, which sets the project's frame rate: checked in source-follow-smoke)
test('the two toasts in JJ\'s words', () => {
  const V = require('../ui-preferences');
  a.equal(V.t('zh-CN', 'own.canvas-follow', { w: 1920, h: 1080, fps: 60 }), '已按这场录像设置画面大小和帧率：1920×1080，每秒 60 帧。');
  a.equal(V.t('en', 'own.canvas-follow', { w: 1920, h: 1080, fps: 60 }), 'Video size and frame rate set from this recording: 1920×1080, 60 fps.');
  a.equal(V.t('zh-CN', 'own.canvas-follow-odd', { w: 640, h: 360, src: 45 }), '已按这场录像设置画面大小：640×360。它的帧率（约每秒 45 帧）不常见，先用每秒 30 帧；想改的话，在预览上方的帧率那里改。');
  a.equal(V.t('en', 'own.canvas-follow-odd', { w: 640, h: 360, src: 45 }), 'Video size set from this recording: 640×360. Its frame rate (about 45 fps) is unusual, so 30 fps is used for now; you can change it in the frame rate menu above the preview.');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  a.match(html, /<select[^>]*id="fpsSel"[^>]*title="Project frame rate"/);
});
