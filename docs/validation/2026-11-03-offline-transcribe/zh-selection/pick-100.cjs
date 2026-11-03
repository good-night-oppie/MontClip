'use strict';
// Evaluation only. Picks the 100 FLEURS cmn_hans_cn test sentences used for the Chinese comparison:
// for each sentence id the audio file whose name sorts first (as text), ids in ascending order, the first 100.
//   node pick-100.cjs <fleurs dir containing test.tsv>   → writes <dir>/pick100.json
// test.tsv columns: id, file, raw transcript, normalized transcript, …
const fs = require('fs'), path = require('path');
const dir = process.argv[2];
const seen = new Map();
for (const line of fs.readFileSync(path.join(dir, 'test.tsv'), 'utf8').split('\n')) {
  const [id, file, raw, norm] = line.split('\t');
  if (!id || !file || (seen.has(id) && seen.get(id).file <= file)) continue;
  seen.set(id, { id, file, raw, norm });
}
const picked = [...seen.values()].sort((a, b) => Number(a.id) - Number(b.id)).slice(0, 100);
fs.writeFileSync(path.join(dir, 'pick100.json'), JSON.stringify(picked, null, 1) + '\n');
console.log(picked.length, 'sentences,', picked.reduce((n, p) => n + p.norm.replace(/\s+/g, '').length, 0), 'characters');
