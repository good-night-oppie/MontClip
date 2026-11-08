/* Transcripts on disk, one per version of a file: analysis/transcripts/
   <stem>-<hash of its path>-<hash of its size and mtime>.json, holding the
   document transcribe.js validates ({v, src, model, language, duration,
   created, words:[[text, start, end], …]}, times in file seconds). A cache,
   like the proxies: a re-rendered or replaced file simply has no transcript
   until it is transcribed again, and saving a new one drops the old ones.
   A file with several audio streams has one transcript per stream: `track` (the media entry's audioTrack) adds
   ".a<track>" to the name; stream 0 keeps the name it always had. Picking another stream finds no transcript
   until that stream is transcribed; going back finds the first one again.

     createTranscripts({dir, resolveSrc}) → {
       get(src, track?)        → the document | false (none for this version of the file) | null (no such file)
       info(src, track?)       → {words, language, model, duration, created, spans} | false | null — without the words
                                 (spans: the parts of the file it covers, null = all of it)
       put(src, doc, track?)   → the document as saved (validated; throws on a bad one or a missing file)
       remove(src, track?)     → true when one was deleted
     }
   Zero dependencies. */
"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const T = require("./transcribe.js");

const hash = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 10);

function createTranscripts({ dir, resolveSrc }) {
  /** "<stem>-<path hash>-" (every version of the file) and the full name of this version. */
  function names(file, track = 0) {
    const st = fs.statSync(file);
    const stem = path.basename(file, path.extname(file)).replace(/[^\w\-]+/g, "_").slice(0, 40) || "media";
    const prefix = `${stem}-${hash(path.resolve(file))}-`, version = prefix + hash(st.size + "|" + Math.round(st.mtimeMs));
    return { prefix, version, name: `${version}${track > 0 ? ".a" + track : ""}.json` };
  }
  function read(src, track) {
    const file = resolveSrc(src);
    if (!file) return null;
    let n;
    try { n = names(file, track); } catch { return null; }
    try { return JSON.parse(fs.readFileSync(path.join(dir, n.name), "utf8")); } catch { return false; }
  }
  return {
    get(src, track = 0) {
      const d = read(src, track);
      if (!d) return d;
      try { return T.validate(d); } catch { return false; }
    },
    info(src, track = 0) {
      const d = this.get(src, track);
      if (!d) return d;
      return { words: d.words.length, language: d.language, model: d.model, duration: d.duration, created: d.created, spans: d.spans || null };
    },
    put(src, doc, track = 0) {
      const file = resolveSrc(src);
      if (!file) throw Object.assign(new Error("no such file: " + src), { code: 404 });
      const clean = T.validate({ ...doc, src });
      const { prefix, version, name } = names(file, track);
      fs.mkdirSync(dir, { recursive: true });
      const tmp = path.join(dir, name + ".tmp-" + process.pid);
      fs.writeFileSync(tmp, JSON.stringify(clean));
      fs.renameSync(tmp, path.join(dir, name));
      // earlier versions of the file keep nothing worth reading (this version's other streams stay)
      for (const old of fs.readdirSync(dir)) if (!old.startsWith(version) && old.startsWith(prefix) && old.endsWith(".json")) {
        try { fs.unlinkSync(path.join(dir, old)); } catch { }
      }
      return clean;
    },
    remove(src, track = 0) {
      const file = resolveSrc(src);
      if (!file) return false;
      let n;
      try { n = names(file, track); } catch { return false; }
      let k = 0;
      let list = [];
      try { list = fs.readdirSync(dir); } catch { }
      // this stream's transcript, and any of an earlier version of the file
      for (const f of list) if (f.startsWith(n.prefix) && f.endsWith(".json") && (f === n.name || !f.startsWith(n.version))) { try { fs.unlinkSync(path.join(dir, f)); k++; } catch { } }
      return k > 0;
    },
  };
}

module.exports = { createTranscripts };
