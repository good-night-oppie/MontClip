// Static data inspection only: never import/eval the inspected repository source.
import { execFileSync, spawnSync } from "node:child_process";
import { classifyFiles, pathMatches } from "./rules.mjs";

export function withoutComments(source) {
  let out = "", quote = "", regex = false, cls = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i], n = source[i + 1];
    if (quote || regex) {
      out += c;
      if (c === "\\") { out += n || ""; i++; continue; }
      if (quote) { if (c === quote) quote = ""; }
      else { if (c === "[") cls = true; if (c === "]") cls = false; if (c === "/" && !cls) regex = false; }
      continue;
    }
    if (["'", '"', "`"].includes(c)) { quote = c; out += c; continue; }
    if (c === "/" && n === "/") {
      while (i < source.length && !/[\r\n]/.test(source[i])) { out += " "; i++; }
      if (i < source.length) out += source[i]; continue;
    }
    if (c === "/" && n === "*") {
      out += "  "; i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) { out += /[\r\n]/.test(source[i]) ? source[i] : " "; i++; }
      if (i < source.length) { out += "  "; i++; } continue;
    }
    if (c === "/" && (/[=(:,;!&|?{}]\s*$/.test(out) || /\b(?:return|throw)\s*$/.test(out))) regex = true;
    out += c;
  }
  return out;
}

function loopbackArgument(text) {
  const string = /^\s*(['"])(.*?)\1/.exec(text);
  if (string) { try { return /^\s*\)/.test(text.slice(string[0].length)) && ["127.0.0.1", "[::1]", "localhost"].includes(new URL(string[2]).hostname); } catch { return false; } }
  const obj = /^\s*\{([^}]*)\}/.exec(text);
  if (!obj || obj[1].includes("...") || obj[1].includes("[") || !/^\s*\)/.test(text.slice(obj[0].length))) return false;
  const hosts = [...obj[1].matchAll(/\b(?:hostname|host)\s*:\s*(['"])(.*?)\1/g)];
  const destinationKeys = [...obj[1].matchAll(/\b(?:hostname|host)\s*:/g)];
  return hosts.length === 1 && destinationKeys.length === 1 && hosts.every(m => /^(?:127\.0\.0\.1|localhost|\[?::1\]?)(?::\d+)?$/.test(m[2]));
}

export function networkUses(source) {
  const text = withoutComments(source), hits = [];
  const add = (api, index, local = false) => { if (!local) hits.push({ api, line: text.slice(0, index).split("\n").length }); };
  const patterns = [["fetch", /\bfetch\s*(?:\?\.\s*)?\(/g], ["https", /\bhttps\s*\.\s*(?:request|get)\s*\(/g], ["http", /\bhttp\s*\.\s*(?:request|get)\s*\(/g], ["net", /\bnet\s*\.\s*(?:connect|createConnection)\s*\(/g], ["WebSocket", /\bnew\s+WebSocket\s*\(/g]];
  for (const [api, re] of patterns) for (const m of text.matchAll(re)) add(api, m.index, api === "http" && loopbackArgument(text.slice(m.index + m[0].length)));
  // Standard Node import/require aliases; unknown destinations stay conservative.
  const aliases = [];
  for (const m of text.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*require\(\s*['"](?:node:)?(https?|net)['"]\s*\)/g)) aliases.push([m[1], m[2]]);
  for (const m of text.matchAll(/import\s+(?:\*\s+as\s+)?(\w+)\s+from\s+['"](?:node:)?(https?|net)['"]/g)) aliases.push([m[1], m[2]]);
  for (const [name, type] of aliases) {
    if (name === type) continue;
    const re = new RegExp(`\\b${name}\\s*\\.\\s*(?:request|get|connect|createConnection)\\s*\\(`, "g");
    for (const m of text.matchAll(re)) add(type, m.index, type === "http" && loopbackArgument(text.slice(m.index + m[0].length)));
  }
  const named = [...text.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"](?:node:)?(https?|net)['"]/g)].map(m => [m[1], m[2], /\s+as\s+/]);
  for (const m of text.matchAll(/(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require\(\s*['"](?:node:)?(https?|net)['"]\s*\)/g)) named.push([m[1], m[2], /\s*:\s*/]);
  for (const [parts, type, separator] of named) for (const part of parts.split(",")) {
    const names = part.trim().split(separator), api = names[0], name = names[1] || api;
    if (!/^(?:request|get|connect|createConnection)$/.test(api) || !/^\w+$/.test(name)) continue;
    for (const m of text.matchAll(new RegExp(`\\b${name}\\s*\\(`, "g"))) add(type, m.index, type === "http" && loopbackArgument(text.slice(m.index + m[0].length)));
  }
  return hits.filter((h, i) => hits.findIndex(x => x.api === h.api && x.line === h.line) === i);
}

export function coverage(files, profile) {
  const missing = [], found = [], skipped = [];
  const excluded = [...(profile.exclude || []), ...(profile.outboundExclude || [])];
  for (const { path, source } of files) {
    if (excluded.some(g => pathMatches(path, g))) { skipped.push(path); continue; }
    if (!/\.(?:js|cjs|mjs)$/.test(path)) continue;
    const uses = networkUses(source);
    if (!uses.length) continue;
    const row = { path, uses }; found.push(row);
    if (!classifyFiles([path], profile).outbound) missing.push(row);
  }
  return { scanned: files.length - skipped.length, skipped, found, missing };
}

export function readMainSources(root, { refresh = process.env.GITHUB_ACTIONS === "true" } = {}) {
  const git = args => execFileSync("git", ["-C", root, ...args], { windowsHide: true, encoding: "utf8", timeout: 60000, maxBuffer: 8 << 20, stdio: ["pipe", "pipe", "pipe"] });
  const remote = git(["remote", "get-url", "origin"]).trim();
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:)good-night-oppie\/(MontClip(?:-Cindy)?)(?:\.git)?$/.exec(remote);
  if (!match) throw Error("main扫描仓库不是明确的good-night-oppie/MontClip或MontClip-Cindy");
  if (refresh) git(["fetch", "--no-tags", "--depth=1", "origin", "main:refs/remotes/origin/main"]);
  const head = git(["rev-parse", "--verify", "refs/remotes/origin/main^{commit}"]).trim();
  const entries = git(["ls-tree", "-rz", "--full-tree", head]).split("\0").filter(Boolean).map(row => {
    const m = /^\d+ blob ([a-f0-9]{40})\t([\s\S]+)$/.exec(row); return m && { sha: m[1], path: m[2] };
  }).filter(e => e && /\.(?:js|cjs|mjs)$/.test(e.path));
  // Do not read source bodies of copied demos or prohibited reverse materials.
  const excluded = entries.filter(e => e.path.startsWith("docs/demo/") || /(?:^|\/)(?:capcut|reverse-engineering)(?:\/|[-_.])/i.test(e.path));
  const selected = entries.filter(e => !excluded.includes(e));
  const result = spawnSync("git", ["-C", root, "cat-file", "--batch"], { input: selected.map(e => e.sha + "\n").join(""), windowsHide: true, timeout: 60000, maxBuffer: 64 << 20 });
  if (result.status !== 0 || result.error) throw Error("main源文件读取失败或不完整");
  let offset = 0; const files = [];
  for (const entry of selected) {
    const end = result.stdout.indexOf(10, offset); if (end < 0) throw Error("main源数据截断");
    const header = result.stdout.subarray(offset, end).toString("utf8");
    const m = /^([a-f0-9]{40}) blob (\d+)$/.exec(header);
    if (!m || m[1] !== entry.sha) throw Error("main源blob与清单不一致");
    const size = Number(m[2]); offset = end + 1;
    if (offset + size >= result.stdout.length) throw Error("main源数据截断");
    files.push({ path: entry.path, source: result.stdout.subarray(offset, offset + size).toString("utf8") }); offset += size + 1;
  }
  return { repo: `good-night-oppie/${match[1]}`, head, files, excluded: excluded.map(e => e.path), total: entries.length };
}
