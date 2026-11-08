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

test('a transcription ticket keeps its captured audio track after the tab changes projects', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  let heard = false, result;
  const context = { MontClipTranscribe: { model: x => x }, trState: { busy: false },
    loadTranscript: async (src, force, track) => track === 1 ? null : { words: [['wrong track', 0, 1]] },
    transcribeSrcs: async (srcs, opts) => { a.equal(opts.tracks['/media/a'], 1); heard = true; return {done:[{src:'/media/a',saved:true}],failed:[]}; },
    fetch: async (url, opts) => { result = JSON.parse(opts.body); return { json: async () => ({}) }; },
    exportTabId: 'fake-tab', document: {hidden:false}, encodeURIComponent,
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('async function runTranscribeJob('), source.indexOf('function clearSilences(')), context);
  await context.runTranscribeJob({id:'job-a',transcribe:{srcs:['/media/a'],tracks:{'/media/a':1}}}, a.fail);
  a.equal(heard,true,'the foreground track must not cause a background ticket to be skipped');
  a.equal(result.result.done.length,1);
});
