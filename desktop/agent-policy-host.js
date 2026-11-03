'use strict';
// The main process's half of the permission modes (P4; QQ's revision 2, 3, 4, 8, 9): the mode, the approvals and the
// per-chat external totals live here, in memory only — a restart is back to 手动 with nothing approved. The page asks
// "what happens to this step?" and answers the host's approval box through a ticket; it cannot set a risk, approve
// without a ticket, or switch to Yolo without the streamer's yes in the host's own box (confirmYolo).
const Policy = require('../agent-policy');

const SESSION = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_TICKETS = 64, MAX_APPROVALS = 1000, MAX_SESSIONS = 200;
const fail = (code) => ({ ok: false, code });

function createPolicyHost({ confirmYolo, external = () => ({ enabled: false, allowlist: [] }), language = () => 'zh-CN', newId = () => require('node:crypto').randomUUID() }) {
  let mode = Policy.DEFAULT_MODE, switching = null;
  const approvals = new Set(), tickets = new Map(), totals = new Map();
  const key = (sessionId, capability, target) => JSON.stringify([sessionId, capability, target]);
  // what was let out, per scope and per capability (each has its own caps); the scope is the caller's sessionId: a chat,
  // a flow run, or a project while it is open
  const count = (sessionId, capability, bytes) => {
    if (!bytes) return;
    const k = JSON.stringify([sessionId, capability]);
    if (!totals.has(k) && totals.size >= MAX_SESSIONS) totals.delete(totals.keys().next().value);
    totals.set(k, (totals.get(k) || 0) + bytes);
  };
  return {
    getMode: () => ({ ok: true, mode }),
    /** Yolo only after the streamer's yes in the host's box; the other modes at once. One switch at a time. */
    async setMode(next) {
      if (!Policy.MODES.includes(next)) return { ...fail('MODE_INVALID'), mode };
      if (next === 'yolo' && mode !== 'yolo') {
        if (switching) return { ...fail('MODE_BUSY'), mode };
        switching = (async () => { try { return (await confirmYolo()) === true; } catch { return false; } })();
        const yes = await switching; switching = null;
        if (!yes) return { ...fail('YOLO_DECLINED'), mode };
      }
      mode = next;
      return { ok: true, mode };
    },
    /** {sessionId, capability, target:{kind, value}, bytes?} → the decision; an "ask" carries a ticket for the box. */
    decide(input) {
      if (!input || typeof input !== 'object' || !SESSION.test(input.sessionId) || !input.target || typeof input.target !== 'object') return fail('DECIDE_INVALID');
      const { sessionId, capability } = input, bytes = input.bytes ?? 0;
      let target;
      try { target = Policy.target(input.target.kind, input.target.value); } catch { return fail('TARGET_INVALID'); }
      const ext = external() || {}, lang = language();
      const allowlisted = Array.isArray(ext.allowlist) && ext.allowlist.some((o) => { try { return Policy.target('origin', o) === target; } catch { return false; } });
      const d = Policy.decide({ mode, capability, args: input.args, language: lang, approved: approvals.has(key(sessionId, capability, target)),
        external: { enabled: ext.enabled === true, allowlisted }, bytes, scopeBytes: totals.get(JSON.stringify([sessionId, capability])) || 0 });
      const shown = { ok: true, mode, ...d, target: Policy.targetText(target) };
      if (d.action === 'run' && d.risk === 'external') count(sessionId, capability, bytes);
      if (d.action !== 'ask') return shown;
      if (tickets.size >= MAX_TICKETS) tickets.delete(tickets.keys().next().value);
      const ticket = newId();
      tickets.set(ticket, { sessionId, capability, target, risk: d.risk, choices: d.choices, bytes });
      return { ...shown, ticket };
    },
    /** The streamer's answer in the host's box: once | session | deny. A ticket answers once. */
    answer({ ticket, choice } = {}) {
      const t = typeof ticket === 'string' ? tickets.get(ticket) : null;
      if (!t) return fail('TICKET_UNKNOWN');
      if (!t.choices.includes(choice)) return fail('CHOICE_INVALID');
      tickets.delete(ticket);
      if (choice === 'deny') return { ok: true, run: false };
      if (choice === 'session' && approvals.size < MAX_APPROVALS) approvals.add(key(t.sessionId, t.capability, t.target));
      if (t.risk === 'external') count(t.sessionId, t.capability, t.bytes);
      return { ok: true, run: true };
    },
  };
}

module.exports = { createPolicyHost };
