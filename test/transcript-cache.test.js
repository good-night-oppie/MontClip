'use strict';
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
test('explicit background track refresh replaces a cached miss even without SSE', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  const cache = new Map([['/media/a#a1', false], ['/media/a', false]]);
  const context = { Map, Promise, encodeURIComponent, transcriptCache: cache, transcriptGen: 0,
    project: { media: [{ src: '/media/a', audioTrack: 0 }] }, MediaLib: { audioTrackOf: () => 0 },
    MontClipTranscribe: { validate: x => x }, fetch: async url => {
      a.match(url, /track=1$/); return { ok: true, json: async () => ({ transcript: { words: [['hello', 0, 1]] } }) };
    } };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function loadTranscript('), source.indexOf('function onTranscriptEvent(')), context);
  const doc = await context.loadTranscript('/media/a', true, 1);
  a.equal(cache.get('/media/a#a1'), doc); a.equal(cache.get('/media/a'), false);
});
