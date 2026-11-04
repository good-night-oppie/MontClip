// Two binds for the same new session sent at once (what a task view does on open + visible).
"use strict";
const { spawn } = require("node:child_process");
const [worker, data] = process.argv.slice(2);
const p = spawn(process.execPath, [worker], { env: { ...process.env, MONTCLIP_CINDY_DATA: data }, stdio: ["pipe", "pipe", "ignore"] });
let buf = "";
const got = [];
p.stdout.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) { got.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); }
  if (got.length === 3) { console.log(JSON.stringify(got.map((m) => m.result && { project: m.result.project, created: m.result.created }))); p.kill(); }
});
const send = (id, method, params) => p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
send(1, "montclip/bind", { session: "first-task" });
setTimeout(() => { send(2, "montclip/bind", { session: "new-task" }); send(3, "montclip/bind", { session: "new-task" }); }, 2000);
