'use strict';
/* Channel-sync toasts in both languages (WIP 2, JJ's final wording 2026-11-06). When a video's real channel count is
   decoded (or its source is replaced), reconcileAudioChannels links one audio clip per channel and says what it did:
   over the track limit, added tracks and linked, linked, or fewer channels. These were hardcoded English; they now go
   through uiText / MontClipView.tp with own-table rows, and the sentences are locked word for word.
   The behaviour tests run the real reconcileAudioChannels + ensureAudioTrackCount sliced from app.js against a small
   synthetic project, so the counts in the sentences are checked against what actually lands on the timeline. */
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const View = require('../ui-preferences.js');
const MontClipEdit = require('../edit-ops.js');

// JJ's final wording (europa ~/montclip-labels/jj/2026-11-06-PR139-声道提示定稿-JJ.md); channels-fewer stays as it was (JJ, 2026-11-06)
const LOCKED = {
  'own.channels-fewer': ['{name} has fewer channels now — {n} linked audio clip(s) removed', '「{name}」的声道变少了，已删掉 {n} 条多余的关联音频片段'],
  'own.channels-over-limit': ["{name} has {n} audio channels, but MontClip supports up to {max} audio tracks, so the extra {extra} weren't added to the timeline. The original file is unchanged.", '「{name}」有 {n} 个声道，MontClip 最多放 {max} 条音频轨，多出的 {extra} 个声道没有放进时间线。原文件没有变化。'],
  'own.channels-added-tracks': ['{name} has more channels than there were audio tracks. Added {tracks} audio track(s) and linked {linked} channel(s).', '「{name}」的声道比现有音频轨多，已新增 {tracks} 条音频轨，并关联了 {linked} 个声道。'],
  'own.channels-linked': ['Linked {linked} audio channel(s) from {name}.', '已关联「{name}」的 {linked} 个声道。'],
};

test('the four channel sentences are JJ\'s final wording in both languages', () => {
  for (const [key, [en, zh]] of Object.entries(LOCKED)) {
    a.equal(View.text.en[key], en, key + ' (en)');
    a.equal(View.text['zh-CN'][key], zh, key + ' (zh-CN)');
  }
});

test('no hardcoded English channel toast is left in app.js, and the demo copy matches', () => {
  for (const s of ['has fewer channels — removed ${', 'tracks supported — extra channel', 'audio track${newTracks', 'Linked ${wantCh}'])
    a.ok(!app.includes(s), 'gone: ' + s);
  a.equal(fs.readFileSync(path.join(ROOT, 'docs/demo/app.js'), 'utf8'), app, 'docs/demo/app.js is the synced copy');
});

/* ── the real function on a synthetic project ── */
const slice = (from, to) => {
  const i = app.indexOf(from), j = app.indexOf(to, i);
  a.ok(i >= 0 && j > i, 'slice markers: ' + from);
  return app.slice(i, j);
};
const CODE = [
  slice('function audioTrackIds(', 'function nextTrackId('),
  slice('function nextTrackId(', '\nfunction'),
  slice('function ensureAudioTrackCount(', '/** Attach one audio clip'),
  slice('async function reconcileAudioChannels(', '/* Apply a named title style'),
].join('\n');
const MAX = +/const MAX_TRACKS_PER_KIND = (\d+)/.exec(app)[1];

async function reconcile({ ch, language = 'en', linkedCh = [0, 1], untargeted = [], onlyTargeted = true }) {
  const TRACKS = ['V2', 'V1', 'A1', 'A2', 'A3', 'A4'].map((id) => ({ id, kind: id[0] === 'A' ? 'audio' : 'video' }));
  const state = { soloId: null, disabledTracks: new Set(), untargetedTracks: new Set(untargeted), lockedTracks: new Set() };
  const m = { id: 'm1', kind: 'video', name: 'clip.mov' };
  const v = { id: 'v1', kind: 'video', mediaId: 'm1', track: 'V1', start: 0, in: 0, duration: 5, name: 'clip.mov', linkGroup: 'g' };
  const project = { media: [m], clips: [v, ...linkedCh.map((c) => ({ id: 'a' + c, kind: 'audio', mediaId: 'm1', track: 'A' + (c + 1), linkGroup: 'g', props: { audioChannel: c } }))] };
  const toasts = []; let n = 0;
  const EDIT = MontClipEdit.create({ doc: () => project, tracks: () => TRACKS, trackLocked: () => false,
    trackTargeted: (id) => !state.untargetedTracks.has(id), uid: () => 'u' + n++, mediaTimeAt: () => 0, onRemove() {}, onPlace() {}, defaultProps: () => ({}) });
  const env = {
    project, TRACKS, state, MAX_TRACKS_PER_KIND: MAX, isEditTarget: EDIT.isEditTarget, getMedia: () => m,
    getClip: (id) => project.clips.find((c) => c.id === id), detectChannelCount: async () => ch,
    makeTrack: (id, kind) => ({ id, kind }), sortTracksInPlace() {}, applyTrackHeights() {}, serializeTracks: () => TRACKS.map((t) => t.id),
    syncAudioGraphTracks() {}, buildTrackDOM() {}, syncAllTrackDisabledUI() {}, rebuildClips() {}, setTimelineHeight: (h) => h,
    $: () => null, defaultTimelineHeight: () => 0, localStorage: { setItem() {} }, TL_H_KEY: 'k', scheduleSave() {}, releaseClipEl() {},
    uid: () => 'u' + n++, DEFAULT_PROPS: {}, defaultPanForChannel: () => 0, renderInspector() {}, toast: (s) => toasts.push(s),
    uiText: (key, vars) => View.t(language, key, vars), MontClipView: View, mcView: { get: () => ({ language }) },
  };
  const { reconcileAudioChannels } = new Function(...Object.keys(env), CODE + '\nreturn { reconcileAudioChannels };')(...Object.values(env));
  await reconcileAudioChannels(v, onlyTargeted);
  return { toasts, linked: project.clips.filter((c) => c.kind === 'audio').length, tracks: TRACKS.filter((t) => t.kind === 'audio').length };
}

test('linked counts what is linked now: all targeted, stereo already placed (6 ch → 6, not the 4 just added)', async () => {
  const r = await reconcile({ ch: 6 });
  a.equal(r.linked, 6);
  a.deepEqual(r.toasts, ['clip.mov has more channels than there were audio tracks. Added 2 audio tracks and linked 6 channels.']);
  a.deepEqual((await reconcile({ ch: 6, language: 'zh-CN' })).toasts, ['「clip.mov」的声道比现有音频轨多，已新增 2 条音频轨，并关联了 6 个声道。']);
});

test('linked never over-reports when some lanes are not edit targets (the old wantCh said 6 and 4)', async () => {
  const r = await reconcile({ ch: 6, untargeted: ['A5', 'A6'] });
  a.equal(r.linked, 4);
  a.deepEqual(r.toasts, ['clip.mov has more channels than there were audio tracks. Added 2 audio tracks and linked 4 channels.']);
  const s = await reconcile({ ch: 4, untargeted: ['A3'], language: 'zh-CN' });
  a.equal(s.linked, 3);
  a.deepEqual(s.toasts, ['已关联「clip.mov」的 3 个声道。']);
});

test('no new tracks: the linked sentence, with English singular/plural', async () => {
  a.deepEqual((await reconcile({ ch: 4 })).toasts, ['Linked 4 audio channels from clip.mov.']);
  a.deepEqual((await reconcile({ ch: 1, linkedCh: [] })).toasts, ['Linked 1 audio channel from clip.mov.']);
  a.deepEqual((await reconcile({ ch: 5, linkedCh: [0, 1, 2, 3] })).toasts, ['clip.mov has more channels than there were audio tracks. Added 1 audio track and linked 5 channels.']);
});

test('over the track limit: max is MAX_TRACKS_PER_KIND, extra = channels − max, the source untouched', async () => {
  const r = await reconcile({ ch: 20 });
  a.equal(r.tracks, MAX);
  a.equal(r.linked, MAX);
  a.deepEqual(r.toasts, [`clip.mov has 20 audio channels, but MontClip supports up to ${MAX} audio tracks, so the extra ${20 - MAX} weren't added to the timeline. The original file is unchanged.`]);
  a.deepEqual((await reconcile({ ch: 20, language: 'zh-CN' })).toasts, [`「clip.mov」有 20 个声道，MontClip 最多放 ${MAX} 条音频轨，多出的 ${20 - MAX} 个声道没有放进时间线。原文件没有变化。`]);
});

test('nothing changed says nothing; fewer channels says the fewer sentence', async () => {
  a.deepEqual((await reconcile({ ch: 2 })).toasts, []);
  const r = await reconcile({ ch: 1, language: 'zh-CN' });
  a.equal(r.linked, 1);
  a.deepEqual(r.toasts, ['「clip.mov」的声道变少了，已删掉 1 条多余的关联音频片段']);
  a.deepEqual((await reconcile({ ch: 1 })).toasts, ['clip.mov has fewer channels now — 1 linked audio clip(s) removed']);
});
