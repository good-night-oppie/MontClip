/* fablecut_lyrics / fablecut_lyrics_apply over MCP (docs/decisions/2026-11-05-lyrics-align-agent-tool.md). The transcript is
   what the local engine would have heard from a TTS voice over an accompaniment (test/lyrics-synth.js), saved as the tab
   saves one; the test plays the editor tab for the card (claims the "lyrics" job and answers it), so the protocol is
   covered without a browser. The page's own apply is test/lyrics-track.test.js. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { makeDataDir, seedProject, startServer, startMcp } = require("./helpers");
const { SONGS, sing, text } = require("./lyrics-synth");

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
  req.on("error", () => {});
  t.after(() => req.destroy());
  return {
    next: () => tickets.length ? Promise.resolve(tickets.shift()) : new Promise((r) => waiters.push(r)),
    connected: async () => { for (let i = 0; i < 100 && !req.socket?.readyState; i++) await new Promise((r) => setTimeout(r, 20)); await new Promise((r) => setTimeout(r, 100)); },
  };
}
const post = (base, p, body) => fetch(base + p, { method: "POST", body: body && JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));

const CAPTION = { id: "cap1", kind: "text", mediaId: null, track: "V3", start: 12, duration: 2, props: { text: "原来的字幕", caption: true, captionStyle: "subtitle" } };
async function boot(t) {
  const dir = makeDataDir(t, seedProject({
    revision: 5, fps: 30,
    media: [{ id: "m_s", name: "song.wav", kind: "audio", src: "/media/song.wav", duration: 120 }],
    clips: [{ id: "c_s", kind: "audio", mediaId: "m_s", track: "A1", start: 0, in: 0, duration: 120 }, CAPTION],
  }));
  fs.mkdirSync(path.join(dir, "media"), { recursive: true });
  fs.writeFileSync(path.join(dir, "media", "song.wav"), Buffer.alloc(4096));
  const srv = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1", FABLECUT_CHROME: path.join(dir, "no-such-browser") });
  // what the engine heard: the harbour song, 15 % misheard
  const words = sing(SONGS.harbour, { err: 0.15, seed: 11 }).map((w) => [w.w, w.s, w.e]);
  assert.equal((await post(srv.base, "/api/transcript?src=/media/song.wav", { model: "paraformer-zh", language: "zh", duration: 120, words })).status, 200);
  const mcp = startMcp(t, dir, { FABLECUT_PORT: String(srv.port), FABLECUT_NO_AUTOSTART: "1" });
  await mcp.request("initialize", { protocolVersion: "2025-11-25" });
  return { dir, ...srv, mcp };
}
const bytes = (dir) => fs.readFileSync(path.join(dir, "project.json"), "utf8");

test("the proposal changes nothing; each case answers in the streamer's words", async (t) => {
  const { dir, mcp } = await boot(t);
  const before = bytes(dir);
  const lyrics = [...SONGS.harbour]; lyrics.splice(4, 0, "这一句根本没有唱过");
  const ok = await mcp.callTool("fablecut_lyrics", { lyrics: text(lyrics), clipIds: ["c_s"] });
  assert.equal(ok.isError, false, ok.text);
  const r = JSON.parse(ok.text);
  assert.equal(r.code, "OK"); assert.equal(r.n, 11); assert.equal(r.k, 10); assert.equal(r.m, 1);
  assert.match(r.proposalId, /^ly_[a-z0-9]+$/);
  assert.equal(r.message["zh-CN"], "歌词对上了 10/11 行。没对上的 1 行是灰色的，可以自己拖到位置上。");
  assert.deepEqual(Object.keys(r.lines[0]).sort(), ["confidence", "end", "matched", "start", "text"]);
  assert.equal(r.lines[4].matched, false); assert.equal(r.lines[4].start, null);
  assert.equal(bytes(dir), before, "a proposal does not touch the project");

  const other = JSON.parse((await mcp.callTool("fablecut_lyrics", { lyrics: text(SONGS.garden) })).text);
  assert.equal(other.code, "TOO_FEW"); assert.equal(other.proposalId, undefined);
  assert.match(other.message["zh-CN"], /^只对上了 \d+\/10 行，可能不是这首歌/);
  const none = JSON.parse((await mcp.callTool("fablecut_lyrics", { lyrics: " \n " })).text);
  assert.equal(none.code, "NO_LYRICS"); assert.equal(none.message["zh-CN"], "还没有歌词。把歌词粘贴进来，一行一句。");
  const quiet = JSON.parse((await mcp.callTool("fablecut_lyrics", { lyrics: text(SONGS.harbour), from: 100, to: 120 })).text);
  assert.equal(quiet.code, "NO_VOCALS"); assert.equal(quiet.message.en, "No singing was heard in this part, so the lyrics can't be lined up. Try another part.");
  assert.equal(bytes(dir), before);
});

test("apply: the open editor asks on its card; the agent hears what she chose; no window, no change", async (t) => {
  const { dir, base, mcp } = await boot(t);
  const r = JSON.parse((await mcp.callTool("fablecut_lyrics", { lyrics: text(SONGS.harbour) })).text);
  assert.equal(r.code, "OK");

  // no editor window: nobody to ask, so nothing is done
  const before = bytes(dir);
  const alone = await mcp.callTool("fablecut_lyrics_apply", { proposalId: r.proposalId });
  assert.equal(alone.isError, true); assert.match(alone.text, /no editor window is open/);
  assert.equal(bytes(dir), before);

  const tab = fakeTab(t, base); await tab.connected();
  const pending = mcp.callTool("fablecut_lyrics_apply", { proposalId: r.proposalId });
  const ticket = await tab.next();
  assert.equal(ticket.kind, "lyrics");
  assert.equal(ticket.lyrics.id, r.proposalId); assert.equal(ticket.lyrics.k, 10);
  assert.equal((await post(base, "/api/export/job/claim?id=" + ticket.id)).status, 200);
  await post(base, "/api/export/job/report?id=" + ticket.id, { status: "done", result: { applied: true, track: "V4", placed: 10, grey: 0, revision: 6 } });
  const done = JSON.parse((await pending).text);
  assert.equal(done.applied, true); assert.equal(done.track, "V4"); assert.equal(done.placed, 10);
  assert.equal(done.message["zh-CN"], "歌词放到了一条新的字幕轨上，原来的字幕没动。按 ⟨Ctrl⟩+⟨Z⟩ 可以撤销。");

  // 〔先不用〕
  const p2 = mcp.callTool("fablecut_lyrics_apply", { proposalId: r.proposalId });
  const t2 = await tab.next();
  await post(base, "/api/export/job/claim?id=" + t2.id);
  await post(base, "/api/export/job/report?id=" + t2.id, { status: "done", result: { applied: false, reason: "DECLINED" } });
  const no = JSON.parse((await p2).text);
  assert.equal(no.applied, false); assert.equal(no.reason, "DECLINED"); assert.equal(no.message["zh-CN"], "没有放，什么都没改。");

  // the singing clip moved since the proposal: refused before anyone is asked
  const doc = JSON.parse(bytes(dir)); doc.clips[0].start = 2; doc.revision++;
  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify(doc));
  const moved = await mcp.callTool("fablecut_lyrics_apply", { proposalId: r.proposalId });
  assert.equal(moved.isError, true); assert.match(moved.text, /changed since this proposal/);
  const bad = await mcp.callTool("fablecut_lyrics_apply", { proposalId: "../project" });
  assert.equal(bad.isError, true);
});
