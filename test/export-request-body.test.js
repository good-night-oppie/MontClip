"use strict";
/* MontClip#337 (PG, 6886869583): POST /api/export/request used to drop any field it did not know, so {start, end} at the
   top level of the body exported the whole timeline. Now top-level start / end are the span (like range {start, end}),
   given both ways they must agree, and any other unknown field is a 400 that names it — before anything is queued. */
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { makeDataDir, seedProject, startServer } = require("./helpers");
const { exportRequestBody } = require("../server/export-jobs");

const FF = require("../server/ffmpeg-path");
let HAS_FFMPEG = false;
try { HAS_FFMPEG = spawnSync(FF.path("ffmpeg"), ["-version"], { stdio: "ignore" }).status === 0; } catch { }
const skip = HAS_FFMPEG ? false : "export requests need ffmpeg";

test("exportRequestBody: top-level start / end become range {start, end}; the other known fields pass as they are", () => {
  assert.deepEqual(exportRequestBody({ start: 1, end: 2.5, where: "tab", preview: true }).opts, { where: "tab", preview: true, range: { start: 1, end: 2.5 } });
  assert.deepEqual(exportRequestBody({ range: "entire", profile: "draft" }).opts, { range: "entire", profile: "draft" });
  assert.deepEqual(exportRequestBody({}).opts, {});
  assert.deepEqual(exportRequestBody({ start: null, end: null, range: "in-out" }).opts, { range: "in-out" }, "null is not given");
  assert.deepEqual(exportRequestBody({ start: 3, end: 4, range: { start: 3, end: 4 } }).opts, { range: { start: 3, end: 4 } }, "the same span both ways is fine");
  // every field the current callers send (MCP fablecut_export, the Cindy plugin's montclip/export-start, the smokes)
  const all = { range: { start: 0, end: 1 }, preview: false, profile: "draft", preset: "youtube", delivery: {}, outputs: ["master"], where: "auto", project: "p_1", session: "task-1" };
  assert.deepEqual(exportRequestBody(all).opts, all);
});

test("exportRequestBody: unknown fields, half a span, a bad span and a span that disagrees with range are refused with a reason", () => {
  const no = (body, code, re) => {
    const r = exportRequestBody(body);
    assert.ok(r.error, JSON.stringify(body));
    assert.equal(r.error.code, code, JSON.stringify(body));
    assert.match(r.error.error, re);
    assert.match(r.error.error, /nothing was exported/);
    return r.error;
  };
  assert.deepEqual(no({ from: 1, to: 2 }, "UNKNOWN_FIELD", /"from", "to"/).fields, ["from", "to"]);
  assert.deepEqual(no({ startTime: 1, where: "tab" }, "UNKNOWN_FIELD", /"startTime"/).fields, ["startTime"]);
  assert.deepEqual(no({ range: { start: 1, end: 2, label: "x" } }, "UNKNOWN_FIELD", /"range\.label"/).fields, ["range.label"]);
  no({ start: 1 }, "RANGE_INCOMPLETE", /start was given without end/);
  no({ end: 4 }, "RANGE_INCOMPLETE", /end was given without start/);
  no({ start: "1", end: 2 }, "BAD_RANGE", /0 <= start < end/);
  no({ start: 2, end: 2 }, "BAD_RANGE", /0 <= start < end/);
  no({ start: -1, end: 2 }, "BAD_RANGE", /0 <= start < end/);
  no({ start: 1, end: 2, range: { start: 1, end: 3 } }, "RANGE_CONFLICT", /pass one of them/);
  no({ start: 1, end: 2, range: "entire" }, "RANGE_CONFLICT", /pass one of them/);
  no(null, "BAD_BODY", /JSON object/);
  no([1, 2], "BAD_BODY", /JSON object/);
});

const post = (base, p, body) => fetch(base + p, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));

/* An open editor tab, as far as the server can tell: an SSE subscriber that keeps the export tickets. */
function fakeTab(t, base) {
  const tickets = [], waiters = [];
  let buf = "";
  const req = http.get(base + "/api/events", (res) => {
    res.setEncoding("utf8");
    res.on("data", (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        if (/^event: (.*)$/m.exec(block)?.[1] !== "export") continue;
        const ticket = JSON.parse(/^data: (.*)$/m.exec(block)[1]);
        const w = waiters.shift();
        if (w) w(ticket); else tickets.push(ticket);
      }
    });
  });
  req.on("error", () => { });
  t.after(() => req.destroy());
  return {
    next: () => tickets.length ? Promise.resolve(tickets.shift()) : new Promise((r) => waiters.push(r)),
    count: () => tickets.length,
    connected: async () => { await new Promise((r) => setTimeout(r, 300)); },
  };
}
const boot = async (t) => {
  const dir = makeDataDir(t, seedProject({ revision: 7 }));   // a 5 s timeline
  const srv = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1", FABLECUT_CHROME: path.join(dir, "no-such-browser") });
  const tab = fakeTab(t, srv.base);
  await tab.connected();
  return { dir, tab, ...srv };
};

test("/api/export/request: top-level start / end export just that part, not the whole timeline", { skip, timeout: 60_000 }, async (t) => {
  const { base, tab } = await boot(t);
  const r = await post(base, "/api/export/request", { where: "tab", start: 1, end: 2, profile: "prores422" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.range, { start: 1, end: 2 }, "the job takes the seconds that were asked, not the whole timeline");
  const ticket = await tab.next();
  assert.deepEqual(ticket.range, { start: 1, end: 2 }, "the editor page renders 1–2 s");
  assert.equal((await post(base, "/api/export/job/cancel?id=" + ticket.id, {})).status, 200);

  // the #325 checks apply to the top-level span too: an end past the 5 s timeline is refused, not cut short
  const past = await post(base, "/api/export/request", { where: "tab", start: 4, end: 9, profile: "prores422" });
  assert.equal(past.status, 400, JSON.stringify(past.body));
  assert.equal(past.body.code, "RANGE_PAST_END");
});

test("/api/export/request: a field it does not know is a 400 naming it, and nothing is queued", { skip, timeout: 60_000 }, async (t) => {
  const { base, tab } = await boot(t);
  for (const [body, code, fields] of [
    [{ where: "tab", from: 1, to: 2 }, "UNKNOWN_FIELD", ["from", "to"]],
    [{ where: "tab", range: { start: 1, end: 2, fps: 60 } }, "UNKNOWN_FIELD", ["range.fps"]],
    [{ where: "tab", start: 1 }, "RANGE_INCOMPLETE"],
    [{ where: "tab", start: 1, end: 2, range: "entire" }, "RANGE_CONFLICT"],
    [{ where: "tab", start: 1, end: 2, range: { start: 0, end: 2 } }, "RANGE_CONFLICT"],
    ["{not json", "BAD_BODY"],
  ]) {
    const r = await post(base, "/api/export/request", body);
    assert.equal(r.status, 400, JSON.stringify(body) + " → " + JSON.stringify(r.body));
    assert.equal(r.body.code, code, JSON.stringify(r.body));
    if (fields) assert.deepEqual(r.body.fields, fields);
  }
  // none of them queued a job: the next good request is not JOB_BUSY, and it is the only ticket the tab got
  const ok = await post(base, "/api/export/request", { where: "tab", start: 0, end: 1, range: { start: 0, end: 1 }, profile: "prores422" });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const ticket = await tab.next();
  assert.equal(ticket.id, ok.body.id);
  assert.equal(tab.count(), 0);
});
