/* Editor events (owner, 2026-11-03: "every step is an editor event — the AI stops to ask where it should, every edit can
   be taken back, and a run can also go all the way on its own"; docs/decisions/2026-11-03-unified-backend-architecture.md).
   One shape for the streamer's own edits, the AI's steps and a recipe's:
     {id, runId, step, capability, args, actor: streamer|ai|recipe, risk, state, revisionBefore, revisionAfter, at}
   States move forward only: planned → awaiting_confirmation → running → has_result → applied / rejected / undone / failed.
   The risk is the host's: it comes from the capability table (capabilities.js), whatever the event says. The log is kept
   in the project as summaries (bounded count, bounded args; never pictures, sound or recordings). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./capabilities"));
  else root.MontClipEvents = factory(root.MontClipCapabilities);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Cap) {
  "use strict";
  const STATES = ["planned", "awaiting_confirmation", "running", "has_result", "applied", "rejected", "undone", "failed"];
  const NEXT = { planned: ["awaiting_confirmation", "running", "rejected"], awaiting_confirmation: ["running", "rejected"], running: ["has_result", "failed"],
    has_result: ["applied", "rejected", "failed"], applied: ["undone"], rejected: [], undone: [], failed: [] };
  const ACTORS = ["streamer", "ai", "recipe"];
  // what the streamer does by hand that is not a capability of its own (yet): each is one undo step
  const STREAMER = { manual_edit: "undoable", redo: "undoable" };
  const KEYS = ["actor", "args", "at", "capability", "id", "revisionAfter", "revisionBefore", "risk", "runId", "state", "step"];
  const MAX_EVENTS = 500, MAX_ARGS = 2048;
  const fail = (code) => { throw new Error(code); };

  function transition(e, to, { revision, at } = {}) {
    if (!STATES.includes(to) || !(NEXT[e.state] || []).includes(to)) fail("EVENT_STATE");
    // applied needs its revision; null = the next save writes it (settle)
    if (to === "applied" && revision === undefined) fail("EVENT_REVISION");
    return { ...e, state: to, revisionAfter: to === "applied" ? revision : e.revisionAfter, at: at ?? e.at };
  }
  const plain = (o) => !!o && typeof o === "object" && !Array.isArray(o) && Object.getPrototypeOf(o) === Object.prototype;
  const id = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v);
  const rev = (v) => v === null || Number.isSafeInteger(v) && v >= 0;
  /** A checked copy with the host's risk, or an error code. args larger than MAX_ARGS are kept as a size note. */
  function normalize(e) {
    if (!plain(e) || Object.keys(e).sort().join() !== KEYS.join()) fail("EVENT_INVALID");
    if (!id(e.id) || !id(e.runId) || !Number.isSafeInteger(e.step) || e.step < 0 || !ACTORS.includes(e.actor) || !STATES.includes(e.state)
      || !rev(e.revisionBefore) || !rev(e.revisionAfter) || typeof e.at !== "string" || e.at.length > 40 || !(e.args === null || plain(e.args))) fail("EVENT_INVALID");
    const risk = e.actor === "streamer" && STREAMER[e.capability] ? STREAMER[e.capability] : Cap.riskOf(e.capability);
    if (risk === "blocked") fail("EVENT_BLOCKED");
    let args = e.args;
    const size = JSON.stringify(args).length;
    if (size > MAX_ARGS) args = { omitted: true, bytes: size };
    return { ...JSON.parse(JSON.stringify({ ...e, args })), risk };
  }
  function createLog(saved) {
    let events = [];
    if (saved && saved.version === 1 && Array.isArray(saved.events)) {
      try { events = saved.events.slice(-MAX_EVENTS).map(normalize); } catch { events = []; }   // damaged: dropped, never trusted
    }
    const at = (i) => events.findIndex((e) => e.id === i);
    return {
      append(e) {
        const n = normalize(e);
        if (at(n.id) >= 0) fail("EVENT_DUPLICATE");
        events.push(n); if (events.length > MAX_EVENTS) events.shift();
        return n;
      },
      get: (i) => events[at(i)] || null,
      /** Move one event on; returns the new event, or throws EVENT_STATE / EVENT_REVISION / EVENT_UNKNOWN. */
      move(i, to, extra = {}) { const k = at(i); if (k < 0) fail("EVENT_UNKNOWN"); events[k] = transition(events[k], to, extra); return events[k]; },
      /** The save wrote `revision`: applied events still waiting for theirs get it (once). */
      settle(revision) { for (const e of events) if (e.state === "applied" && e.revisionAfter == null) e.revisionAfter = revision; },
      /** Undoing a run as a whole: the run's applied events must be the newest entries of the undo stack (oldest first),
       *  with nothing else between or after them. Returns the order to undo them in, or RUN_INTERLEAVED. */
      undoPlan(runId, stack) {
        const mine = new Set(events.filter((e) => e.runId === runId && e.state === "applied").map((e) => e.id));
        if (!mine.size) return { ok: false, code: "RUN_EMPTY" };
        const top = [];
        for (let k = stack.length - 1; k >= 0 && mine.has(stack[k]); k--) top.push(stack[k]);
        return top.length === mine.size ? { ok: true, events: top } : { ok: false, code: "RUN_INTERLEAVED" };
      },
      list: () => events.slice(),
      toJSON: () => ({ version: 1, events: events.slice(-MAX_EVENTS) }),
    };
  }
  return { STATES, ACTORS, MAX_EVENTS, MAX_ARGS, transition, normalize, createLog };
});
