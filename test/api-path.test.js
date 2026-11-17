'use strict';
// One plain spelling for /api/ paths (QQ, #326 review 5927365621; Deja): the server and the desktop main process decide with the same
// function (server/api-path.js), so neither reads a path differently from the other. The routes themselves: test/review-routes.test.js.
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { nonCanonicalApi } = require('../server/api-path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('refused: every spelling that could name an /api/ route but is not the plain one', () => {
  for (const p of [
    '/api/%72eview/prepare', '/api/review/%70repare', '/api/review%2Fprepare', '/api/%252eview/prepare', '/%61pi/review/prepare',      // encoded, twice too
    '/API/review/prepare', '/api/Review/prepare', '/Api/review/send', '/api/review/PREPARE', '/Api',                                      // case
    '//api/review/prepare', '/api//review/prepare', '/api/review//prepare', '///api/review',                                              // doubled slashes
    '/api/x/../review/prepare', '/api/./review/prepare', '/api/review/./prepare', '/media/../api/review/prepare', '/%2e%2e/api/review',   // dot segments
    '/api/review/..', '/api/.', '/api\\review\\prepare', '/api/review\\prepare', '/media\\..\\api\\review',                               // backslashes
    '/api/review/prepare%00', '/api/review/pre%20pare',
  ]) a.equal(nonCanonicalApi(p), true, p);
});

test('kept: plain API paths (a query may be encoded), and every non-API path, encoded file names included', () => {
  for (const p of [
    '/api/review/prepare', '/api/review/status?id=%72_x', '/api/export/job?id=a%20b#x', '/api/review/prepare/', '/api/x.json', '/api/media-info?src=%2Fmedia%2Fa.mp4',
    '/', '/index.html', '/media/%E4%B8%AD%E6%96%87.mp4', '/media/a%20b.mp4', '/media/api/x.mp4', '/library/sfx/whoosh.mp3', '/media/a%2Fb.mp4', '/apis', '/rapi/x',
  ]) a.equal(nonCanonicalApi(p), false, p);
});

test('the server and the main process use this one function, and no second copy of the rule exists', () => {
  const srv = read('server/server.js'), main = read('desktop/main.js');
  a.match(srv, /const \{ nonCanonicalApi \} = require\("\.\/api-path"\);/);
  a.match(srv, /if \(nonCanonicalApi\(req\.url\)\) \{ sendJSON\(res, 400, \{ code: "NONCANONICAL_PATH"/);
  a.ok(srv.indexOf('nonCanonicalApi(req.url)') < srv.indexOf('const url = new URL(req.url, "http://localhost");', srv.indexOf('async function handleRequest')), 'checked before the path is parsed');
  a.match(main, /const \{ nonCanonicalApi \} = require\("\.\.\/server\/api-path"\);/);
  const hook = main.slice(main.indexOf('ses.webRequest.onBeforeRequest('), main.indexOf('ses.webRequest.onBeforeSendHeaders('));
  a.match(hook, /nonCanonicalApi\(/, 'the window\'s requests are checked with it before they leave');
  a.ok(!/function nonCanonicalApi/.test(srv + main), 'no copy of the function');
  const headers = main.slice(main.indexOf('ses.webRequest.onBeforeSendHeaders('), main.indexOf('ses.webRequest.onHeadersReceived('));
  a.ok(!/pathname|startsWith\(/.test(headers), 'the page secret is not decided by path');
});
