/* JJ's final wording for a recording whose length can't be read (2026-11-05, via Deja), word for word, in both
   languages. And the two notes fablecut_import_media gives an agent (importNote) are for the agent only: JJ passed them
   on the condition that they never show in the interface — locked here. */
"use strict";
const test = require("node:test"), a = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const V = require("../shared/ui-preferences");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

// once 〔帮我修好〕 is there (#157), the two toasts end with JJ's 「点〔帮我修好〕试试。」 / "Click “Fix it for me” to try."
test("JJ's three sentences, word for word", () => {
  a.equal(V.t("zh-CN", "own.media-duration-unknown", { name: "录屏.webm" }), "「录屏.webm」可能没录完整（比如录屏中途停了），读不出有多长，现在还剪不了。原文件没有改动。点〔帮我修好〕试试。");
  a.equal(V.t("en", "own.media-duration-unknown", { name: "rec.webm" }), "\"rec.webm\" may not have finished recording (for example, a screen recording that was stopped), so its length can't be read and it can't be edited yet. The original file is unchanged. Click “Fix it for me” to try.");
  a.equal(V.t("zh-CN", "own.media-duration-unknown-n", { n: 3 }), "有 3 个视频可能没录完整，读不出有多长，现在还剪不了。原文件都没有改动。点〔帮我修好〕试试。");
  a.equal(V.t("en", "own.media-duration-unknown-n", { n: 3 }), "3 videos may not have finished recording, so their length can't be read and they can't be edited yet. The original files are unchanged. Click “Fix it for me” to try.");
  a.equal(V.t("zh-CN", "own.media-cannot-cut", { name: "录屏.webm" }), "读不出「录屏.webm」有多长，放不上时间线。原文件没有改动。");
  a.equal(V.t("en", "own.media-cannot-cut", { name: "rec.webm" }), "Can't read how long \"rec.webm\" is, so it can't go on the timeline. The original file is unchanged.");
});

test("dragging such a file onto the timeline says own.media-cannot-cut, with its name", () => {
  const app = read("app/app.js"), at = app.indexOf("function addClipFromMedia"), body = app.slice(at, at + 700);
  a.match(body, /if \(MediaLib\.cannotCut\(m\)\) \{ toast\(uiText\("own\.media-cannot-cut", \{ name: m\.name \}\)\); return null; \}/);
});

test("the agent's import notes never reach the interface", () => {
  const src = read("server/mcp-server.js");
  const at = src.indexOf("function importNote"), body = src.slice(at, src.indexOf("\n}\n", at));
  // every sentence importNote can say
  const said = [...body.matchAll(/(?:"|`)(Note: [^"`$]{12,60})/g)].map((m) => m[1]);
  a.ok(said.length >= 4, "found the notes: " + said.length);
  // where the interface's words live: none of them holds one of these
  for (const f of ["app/app.js", "app/index.html", "shared/ui-preferences.js", "shared/ui-terms.js", "shared/capabilities.js", "app/capabilities-page.js"]) {
    if (!fs.existsSync(path.join(__dirname, "..", f))) continue;
    const text = read(f);
    for (const s of said) a.ok(!text.includes(s.slice(0, 40)), `${f} shows an agent note: ${s}`);
  }
  // importNote is used in one place only: the text fablecut_import_media answers the agent with
  const uses = [...src.matchAll(/importNote\(/g)].length;
  a.equal(uses, 2, "its definition and the import tool's reply");
  a.match(src, /return `Imported → \$\{JSON\.stringify\(entry\)\}\\n` \+\s*importNote\(entry, probed\)( \+ audioTracksNote\(entry\))?;/);   // + the audio tracks (#177)
  // and the editor never shows a tool's text to the user: the server has no route that passes it on
  a.doesNotMatch(read("server/server.js"), /importNote/);
});
