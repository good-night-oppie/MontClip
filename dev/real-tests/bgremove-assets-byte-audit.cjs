'use strict';
// Opt-in, offline audit of an already authorized/extracted npm package. Never executes its code.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const A = require('../../bgremove-assets');
async function main() {
  const directory = process.argv[2];
  if (!directory) throw new Error('Supply the previously authorized extracted package directory');
  const files = new Map(Object.keys(A.FILES).map(name => [name, fs.readFileSync(path.join(directory, name))]));
  const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  assert.equal(pkg.version, A.VERSION); assert.equal(pkg.license, 'Apache-2.0');
  function platform(corrupt) {
    const blobs = new Map(); let requests = 0;
    return { blobs, get requests() { return requests; }, crypto: webcrypto, Blob,
      URL: { createObjectURL(blob) { const u = 'blob:audit/' + blobs.size; blobs.set(u, blob); return u; }, revokeObjectURL(u) { blobs.delete(u); } },
      async fetch(url, options) {
        requests++;
        const name = url.slice(A.BASE.length); assert.equal(url, A.source(name));
        assert.equal(options.integrity, 'sha256-' + A.FILES[name].sha256);
        let bytes = Buffer.from(files.get(name));
        if (name === corrupt) { if (bytes.length) bytes[0] ^= 1; else bytes = Buffer.of(1); }
        const response = new Response(bytes); Object.defineProperty(response, 'url', { value: url }); return response;
      }
    };
  }
  const good = platform(), assets = await A.load(true, good);
  assert.equal(good.requests, 9); assert.equal(good.blobs.size, 9);
  for (const [name, bytes] of files) {
    assert.deepEqual(Buffer.from(await good.blobs.get(assets.locateFile(name)).arrayBuffer()), bytes);
  }
  assets.dispose(); assert.equal(good.blobs.size, 0);
  for (const name of files.keys()) {
    const bad = platform(name); await assert.rejects(A.load(true, bad), /INTEGRITY/); assert.equal(bad.blobs.size, 0);
  }
  console.log('PASS: 9 real resources accepted/resolved byte-for-byte; 9 corruptions rejected before any Blob; no third-party execution or network');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
