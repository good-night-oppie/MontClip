"use strict";
/** One close attempt at a time. Only a current save receipt or explicit force
 * can close. Cancel/timeout invalidate both the host result and renderer freeze. */
function createCloseController({ save, cancel, prompt, close, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let phase = "idle", generation = 0, timer;
  const clear = () => { clearTimer(timer); timer = null; };
  const restore = (id) => { try { Promise.resolve(cancel(id)).catch(() => {}); } catch {} };
  function problem(reason, id) {
    if (phase !== "saving" || id !== generation) return;
    phase = "prompting"; clear(); restore(id);
    Promise.resolve().then(() => prompt(reason)).then((choice) => {
      if (phase !== "prompting" || generation !== id) return;
      if (choice === 1) { phase = "closing"; close(); }
      else { phase = "idle"; generation++; }
    }, () => { if (phase === "prompting" && generation === id) { phase = "idle"; generation++; } });
  }
  return {
    request() {
      if (phase !== "idle") return;
      phase = "saving";
      const id = ++generation;
      timer = setTimer(() => problem("timeout", id), 15000);
      Promise.resolve().then(() => save(id)).then((saved) => {
        if (phase !== "saving" || id !== generation) return;
        if (saved !== true) { problem("save-failed", id); return; }
        clear(); phase = "closing"; close();
      }, () => problem("save-failed", id));
    },
    fault(reason) { problem(reason, generation); },
    dispose() { clear(); restore(generation); generation++; phase = "disposed"; },
    state() { return phase; },
  };
}
module.exports = { createCloseController };
