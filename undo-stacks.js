/* The editor's undo history, kept per project so it outlives the page. The undo stack lives in the
   editor tab (app.js, one stack for the streamer and the agent); a tab that is reloaded — Cindy
   rebuilds a task's tab when the task comes back to the front — would otherwise start empty.
   One file per project in <data dir>/analysis/undo/<project id>.json:
     {v:1, project, sequence, revision, current, media, undo:[…], redo:[…], time, saved}
   `current` is the open timeline as the tab last saw it (an undo snapshot), so a tab that loads a
   newer document can turn the difference into an undo step of its own. A disposable cache: deleting
   the folder only loses the undo history. */
"use strict";
const fs = require("fs");
const path = require("path");

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_STEPS = 100;   // what app.js keeps (pushUndo)

function createUndoStacks({ dir }) {
  const file = (id) => {
    if (!ID.test(id)) throw Object.assign(new Error("project id must be 1–64 letters, digits, _ or -"), { status: 400 });
    return path.join(dir, id + ".json");
  };
  const write = (f, doc) => {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = f + "." + process.pid + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(doc));
    fs.renameSync(tmp, f);
  };
  const steps = (a) => (Array.isArray(a) ? a.filter((s) => typeof s === "string").slice(-MAX_STEPS) : []);
  return {
    get(id) {
      try { return JSON.parse(fs.readFileSync(file(id), "utf8")); }
      catch (e) { if (e.status) throw e; return null; }
    },
    put(id, body) {
      if (!body || typeof body !== "object") throw Object.assign(new Error("body must be an undo stack object"), { status: 400 });
      const doc = {
        v: 1, project: id,
        sequence: typeof body.sequence === "string" ? body.sequence : null,
        revision: Number.isFinite(body.revision) ? body.revision : null,
        current: typeof body.current === "string" ? body.current : null,
        media: Array.isArray(body.media) ? body.media : null,
        undo: steps(body.undo), redo: steps(body.redo),
        time: Number.isFinite(body.time) && body.time >= 0 ? body.time : 0,
        saved: new Date().toISOString(),
      };
      write(file(id), doc);
      return { undo: doc.undo.length, redo: doc.redo.length, revision: doc.revision };
    },
    /** Only the playhead (the page is going away: a small keepalive request). */
    setTime(id, t) {
      const doc = this.get(id);
      if (!doc || !(Number.isFinite(t) && t >= 0)) return false;
      doc.time = t;
      write(file(id), doc);
      return true;
    },
    remove(id) { try { fs.rmSync(file(id), { force: true }); return true; } catch { return false; } },
  };
}

module.exports = { createUndoStacks, MAX_STEPS };
