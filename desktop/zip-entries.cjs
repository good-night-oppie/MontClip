'use strict';
/* The entry names of a zip, read from its central directory (no extraction, no dependency): [{name, utf8, size}].
   `utf8` is general-purpose flag bit 11 — the name is UTF-8. Used to check that a package's entries use "/" only
   (the zip format's separator; "\" breaks extraction on other systems and in some tools) and that non-ASCII names
   are marked UTF-8. */
const fs = require('node:fs');

function zipEntries(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size, tailLen = Math.min(size, 65557), tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw Error('not a zip: no end of central directory');
    let count = tail.readUInt16LE(eocd + 10), cdSize = tail.readUInt32LE(eocd + 12), cdOffset = tail.readUInt32LE(eocd + 16);
    if (count === 0xffff || cdOffset === 0xffffffff) {   // zip64
      const loc = eocd - 20;
      if (loc < 0 || tail.readUInt32LE(loc) !== 0x07064b50) throw Error('zip64 locator missing');
      const recOff = Number(tail.readBigUInt64LE(loc + 8)), rec = Buffer.alloc(56);
      fs.readSync(fd, rec, 0, 56, recOff);
      count = Number(rec.readBigUInt64LE(32)); cdSize = Number(rec.readBigUInt64LE(40)); cdOffset = Number(rec.readBigUInt64LE(48));
    }
    const cd = Buffer.alloc(cdSize);
    fs.readSync(fd, cd, 0, cdSize, cdOffset);
    const out = [];
    for (let p = 0, n = 0; n < count; n++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) throw Error('bad central directory entry ' + n);
      const flags = cd.readUInt16LE(p + 8), nameLen = cd.readUInt16LE(p + 28), extraLen = cd.readUInt16LE(p + 30), commentLen = cd.readUInt16LE(p + 32);
      const raw = cd.subarray(p + 46, p + 46 + nameLen), utf8 = !!(flags & 0x800);
      out.push({ name: utf8 ? raw.toString('utf8') : raw.toString('latin1'), utf8, size: cd.readUInt32LE(p + 24) });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  } finally { fs.closeSync(fd); }
}
module.exports = { zipEntries };
if (require.main === module) {
  const e = zipEntries(process.argv[2]);
  const back = e.filter((x) => x.name.includes('\\')), nonAscii = e.filter((x) => /[^\x00-\x7f]/.test(x.name));
  console.log(JSON.stringify({ entries: e.length, withBackslash: back.length, firstBackslash: back.slice(0, 3).map((x) => x.name), nonAscii: nonAscii.map((x) => [x.name, x.utf8]) }));
}
