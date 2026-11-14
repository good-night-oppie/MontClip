/* The AI's permission modes (P4; Deja, 2026-11-03; docs/decisions/2026-11-03-agent-permission-modes.md): 计划 / 手动 /
   自动 / Yolo, 手动 by default. The host — never the AI — decides what happens to a step, from the capability's risk in the
   table (capabilities.js, fixed in the program) and the mode:
     mode   | read                         | undoable                 | sensitive              | external
     计划   | run                          | list only                | list only              | list only
     手动   | whitelist runs, else ask     | ask (until 「都批准」)    | ask, every time        | ask (until 「都批准」)
     自动   | run                          | run (undoable)           | ask (until 「都批准」)  | ask (until 「都批准」)
     Yolo   | run                          | run                      | run                    | run, if the switch is on and the domain allowlisted
   The blacklist and every name not in the table are refused in every mode. An external step always shows what it sends
   and where (QQ's revision 1, the owner's ruling 11): 「都批准」 spares the click only. External sends are capped per send
   and per scope in every mode, Yolo too (QQ 8), by the capability's own caps in the table (Deja on #83: text and audio
   differ); over a cap the send is refused with by how much, never cut down to fit. Pure: the main process (desktop/agent-policy-host.js) keeps the mode and
   the approvals, in memory. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./capabilities"));
  else root.MontClipPolicy = factory(root.MontClipCapabilities);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Cap) {
  "use strict";
  const MODES = Object.freeze(["plan", "manual", "auto", "yolo"]);
  const DEFAULT_MODE = "manual";
  const NAMES = Object.freeze({ "zh-CN": { plan: "计划", manual: "手动", auto: "自动", yolo: "全自动" }, en: { plan: "Plan", manual: "Manual", auto: "Auto", yolo: "Full auto" } });
  // read-only steps 手动 runs without asking (only looking at the project's own summary); the rest ask the first time
  const DEFAULT_WHITELIST = Object.freeze(["fablecut_status", "fablecut_docs", "fablecut_get_project", "fablecut_encode_profiles"]);
  const ALL = Object.freeze(["once", "session", "deny"]), EVERY_TIME = Object.freeze(["once", "deny"]);

  const modeLabel = (mode, language) => NAMES[language === "zh-CN" ? "zh-CN" : "en"][mode] || "";
  const refuse = (code, risk, label) => ({ action: "refuse", code, risk, label, showContent: false, choices: [] });

  /** One step's fate. Reads only these keys: anything else (the AI's reply, its args) is never looked at. */
  function decide({ mode, capability, args, language, whitelist = DEFAULT_WHITELIST, approved, external, bytes = 0, scopeBytes = 0 } = {}) {
    // args are read only where the table says the risk depends on them (fablecut_import_media: a web address is blocked)
    const risk = Cap.riskOf(capability, args), label = Cap.label(capability, language), ok = approved === true;
    if (risk === "blocked") return refuse("BLOCKED", risk, label);
    if (!MODES.includes(mode)) return refuse("MODE_UNKNOWN", risk, label);
    const out = (action, choices = []) => ({ action, code: null, risk, label, showContent: risk === "external", choices: action === "ask" ? choices : [] });
    // run only because of an earlier 「这个聊天中都批准」 (not by the mode itself): the page says so after applying (JJ, 2026-11-04)
    const allowed = () => ({ ...out("run"), byApproval: true });
    if (risk === "external") {
      const L = Cap.limits(capability), over = (code, limit, more) => ({ ...refuse(code, risk, label), showContent: true, ...more, limit });
      if (!L) return over("NO_LIMITS", 0, {});
      if (!Number.isSafeInteger(bytes) || bytes < 0 || !Number.isSafeInteger(scopeBytes) || scopeBytes < 0) return over("SEND_INVALID", L.perSend, {});
      if (bytes > L.perSend) return over("SEND_TOO_LARGE", L.perSend, { over: bytes - L.perSend });
      if (scopeBytes + bytes > L.perScope) return over("SCOPE_LIMIT", L.perScope, { over: scopeBytes + bytes - L.perScope, used: scopeBytes });
      if (mode === "plan") return out("list");
      if (mode === "yolo") {
        if (!external || external.enabled !== true) return { ...refuse("EXTERNAL_OFF", risk, label), showContent: true };
        if (external.allowlisted !== true) return { ...refuse("DOMAIN_NOT_ALLOWED", risk, label), showContent: true };
        return out("run");
      }
      return ok ? allowed() : out("ask", ALL);
    }
    if (mode === "plan") return risk === "read" ? out("run") : out("list");
    // asked every time in every mode, Yolo too (capabilities.js CONFIRM_EVERY_TIME): no 「都批准」, an earlier yes counts for nothing
    if (Cap.confirmEveryTime(capability)) return out("ask", EVERY_TIME);
    if (mode === "yolo") return out("run");
    if (mode === "auto") return risk !== "sensitive" ? out("run") : ok ? allowed() : out("ask", ALL);
    // 手动
    if (risk === "sensitive") return out("ask", EVERY_TIME);
    if (risk === "read" && Array.isArray(whitelist) && whitelist.includes(capability)) return out("run");
    return ok ? allowed() : out("ask", ALL);
  }

  /** A target as the host compares it: an https origin (no path, query or credentials), or a project id. */
  function target(kind, value) {
    const bad = () => { throw new Error("TARGET_INVALID"); };
    if (kind === "project") return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? "project:" + value : bad();
    if (kind !== "origin" || typeof value !== "string") return bad();
    let u;
    try { u = new URL(value); } catch { return bad(); }
    if (u.protocol !== "https:" || u.username || u.password || !u.hostname) return bad();
    return u.origin.toLowerCase();
  }
  /** What the approval box shows for a target: the domain (and a port other than 443); a project shows its name. */
  const targetText = (t) => (typeof t === "string" && t.startsWith("https://") ? t.slice(8) : "");

  return Object.freeze({ MODES, DEFAULT_MODE, DEFAULT_WHITELIST, CHOICES: ALL, decide, target, targetText, modeLabel });
});
