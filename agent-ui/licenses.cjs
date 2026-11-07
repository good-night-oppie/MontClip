'use strict';
// Writes BUNDLED-LICENSES.json and the package part of THIRD-PARTY-NOTICES.txt for every npm package that build.cjs put
// into cindy-official.js (BUNDLED-PACKAGES.json). Run after build.cjs:  node agent-ui/licenses.cjs
// A package that ships no license file gets its project's LICENSE from licenses/<name>.LICENSE, and the notice says so.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
// and for the npm packages whose code styles.cjs put into cindy-parts.css (STYLE-PACKAGES.json)
const dir = __dirname, packages = [...new Set([...require('./BUNDLED-PACKAGES.json'), ...require('./STYLE-PACKAGES.json')])].sort();
const FETCHED = { 'react-remove-scroll-bar': 'the npm package ships no license file; package.json and README say MIT. Text: LICENSE of github.com/theKashey/react-remove-scroll-bar @ 8ca9ba5ea52de03308fe8ced94f7b159a44d28ff' };
const HEAD = fs.readFileSync(path.join(dir, 'THIRD-PARTY-NOTICES.txt'), 'utf8').replace(/\r\n/g, '\n').split('\n--- End original Cindy NOTICE ---\n')[0] + '\n--- End original Cindy NOTICE ---\n';
const registry = {}, blocks = [];
for (const name of packages) {
  const root = path.join(dir, 'node_modules', name), meta = require(path.join(root, 'package.json'));
  const file = fs.readdirSync(root).find((f) => /^(license|licence)(\.(md|txt))?$/i.test(f));
  const text = (file ? fs.readFileSync(path.join(root, file), 'utf8') : fs.readFileSync(path.join(dir, 'licenses', name + '.LICENSE'), 'utf8')).replace(/\r\n/g, '\n').trim();
  if (!file && !FETCHED[name]) throw Error(name + ' has no license file');
  registry[name] = { version: meta.version, license: meta.license, licenseSha256: crypto.createHash('sha256').update(text).digest('hex'), ...(file ? {} : { note: FETCHED[name] }) };
  blocks.push(`${name}/LICENSE\n${file ? '' : '(' + FETCHED[name] + ')\n'}${text}\n`);
}
const intro = [
  '',
  'Cindy official source: https://github.com/makecindy/cindy',
  '  @ 021923684f54129effbba6b72a8218526418fa45 (agent-ui/upstream: the composer, send button, text field, thinking text)',
  '  @ 43001eaaa31ef322de9ae148c4051087277d6198 (agent-ui/cindy-43001ea: the assistant pane parts)',
  'Apache-2.0. Copyright 2026 XD Inc. The LICENSE and NOTICE are the same at both commits.',
  'Full original terms: upstream/LICENSE and upstream/NOTICE (and the same files in cindy-43001ea/). File inventory: SOURCES.json.',
  'Generated cindy-official.js is a modified bundled combination with MontClip adapters and stand-ins (agent-ui/stand-ins); original copied source files are unchanged.',
  '',
  'npm packages bundled into cindy-official.js (BUNDLED-PACKAGES.json) and cindy-parts.css (STYLE-PACKAGES.json); versions in BUNDLED-LICENSES.json and package-lock.json:',
  '',
].join('\n');
fs.writeFileSync(path.join(dir, 'BUNDLED-LICENSES.json'), JSON.stringify(registry, null, 2) + '\n');
fs.writeFileSync(path.join(dir, 'THIRD-PARTY-NOTICES.txt'), HEAD + intro + '\n' + blocks.join('\n'));
console.log(`${packages.length} packages`);
