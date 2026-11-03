"use strict";
// VV (dev build, 2026-11-02): the default 「d:master」 export said 「这个导出设置要用 x264」. When the export starts while
// the dialog's delivery spec is not filled in yet, fastExport got no delivery and quietly fell back to the raw encoding
// profile "delivery" (libx264, which only the user's own FFmpeg has). A delivery choice must always export as a delivery.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

test("a delivery choice always sends a delivery spec: filled from the chosen preset when the dialog had none", () => {
  const fn = app.slice(app.indexOf("function startChosenExport("), app.indexOf("\n}\n", app.indexOf("function startChosenExport(")));
  assert.match(fn, /if \(c\.kind === "delivery"\) \{\n\s+if \(!dlvSpec\) \{ const n = normalizeDelivery\(c\.id\); dlvSpec = n\.spec; dlvNotes = n\.notes; \}/);
});
