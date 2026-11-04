/* The AI's plan (P4, second half; Deja, 2026-11-03, 「AI 拆任务、排计划、执行」, after Codex CLI's update_plan): one sentence
   becomes an ordered list of at most 30 steps, each one capability from the table (capabilities.js), shown in the assistant.
   States, in v7.2's words (说明第 39 行): 待做 / 进行中 / 完成 / 没做成, and at most one step 进行中. Before it starts the streamer
   can delete a step or drop the whole plan; a step that fails (or is declined, or only listed) stops the plan there. The
   model's plan is data: checked here, and each step again against the project when its turn comes (the page does that
   with the step's own check, e.g. chat-proposal.js). What happens to a step — run, ask, list, refuse — is the host's call
   (agent-policy.js), never the plan's. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./capabilities"));
  else root.MontClipPlan = factory(root.MontClipCapabilities);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Cap) {
  "use strict";
  const STATES = Object.freeze(["todo", "doing", "done", "failed"]);
  const MAX_STEPS = 30, MAX_TEXT = 16000;
  // 助手面板 v7.2 说明第 39 行 (Deja, 2026-11-04): ○ 待做 / 转圈 进行中 / ✓ 完成（文字划掉）/ ✕ 没做成
  const NAMES = Object.freeze({ "zh-CN": { todo: "待做", doing: "进行中", done: "完成", failed: "没做成" }, en: { todo: "To do", doing: "In progress", done: "Done", failed: "Not done" } });
  const MARKS = Object.freeze({ todo: "○", doing: "", done: "✓", failed: "✕" }); // 进行中: a spinner (style.css)
  const stateLabel = (s, language) => NAMES[language === "zh-CN" ? "zh-CN" : "en"][s] || "";
  const stateMark = (s) => MARKS[s] ?? "";
  const plain = (o) => !!o && typeof o === "object" && !Array.isArray(o) && Object.getPrototypeOf(o) === Object.prototype;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const fail = (code) => ({ ok: false, code });

  /** A reply that is a plan → {ok, steps} or {ok:false, code}; any other reply → null (not a plan). */
  function parse(text) {
    if (typeof text !== "string" || text.length > MAX_TEXT) return null;
    const m = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(text), body = (m ? m[1] : text).trim();
    if (!body.startsWith("{")) return null;
    let v;
    try { v = JSON.parse(body); } catch { return null; }
    if (!plain(v) || v.type !== "plan") return null;
    if (Object.keys(v).sort().join() !== "steps,type" || !Array.isArray(v.steps)) return fail("PLAN_INVALID");
    if (!v.steps.length) return fail("PLAN_EMPTY");
    if (v.steps.length > MAX_STEPS) return fail("PLAN_TOO_LONG");
    for (const s of v.steps) if (!plain(s) || Object.keys(s).sort().join() !== "args,capability" || typeof s.capability !== "string" || !plain(s.args)) return fail("PLAN_INVALID");
    // a plan with anything the table refuses is refused as a whole: nothing of it runs
    if (v.steps.some((s) => Cap.riskOf(s.capability) === "blocked")) return fail("PLAN_BLOCKED");
    return { ok: true, steps: v.steps.map((s) => ({ capability: s.capability, args: clone(s.args), state: "todo", code: null })) };
  }
  const stepLabel = (s, language) => Cap.label(s && s.capability, language);
  // What a step changes, said first (VV on #84 53f641d; v7.2 §2: 先写具体改什么), so two steps of one kind differ:
  // 「保留 0:00–1:55」. Times as m:ss, with tenths when there are any. Nothing concrete to say: "".
  const clock = (t) => { const d = Math.round(Math.max(0, Number(t) || 0) * 10), m = Math.floor(d / 600), s = (d % 600) / 10;
    return m + ":" + (s < 10 ? "0" : "") + (d % 10 ? s.toFixed(1) : String(Math.floor(s))); };
  function stepDetail(s, language) {
    const zh = language === "zh-CN", ranges = s && s.args && Array.isArray(s.args.ranges) ? s.args.ranges : [];
    if (s && s.capability === "keep_ranges" && ranges.length) {
      const shown = ranges.slice(0, 3).map((r) => clock(r.from) + "–" + clock(r.to)).join(zh ? "、" : ", ");
      const more = ranges.length > 3 ? (zh ? " 等 " + ranges.length + " 段" : " and " + (ranges.length - 3) + " more") : "";
      const each = s.args.output_mode === "per_range" ? (zh ? "，各成一条" : ", each its own clip") : "";
      return (zh ? "保留 " : "Keep ") + shown + more + each;
    }
    if (s && s.capability === "keep_sentences" && ranges.length)
      return zh ? "保留 " + ranges.length + " 句" : "Keep " + ranges.length + (ranges.length === 1 ? " sentence" : " sentences");
    return "";
  }

  /** One plan's state. Steps run in order, one at a time; the page does the work and reports each step's end. */
  function create(steps) {
    let list = clone(steps).map((s) => ({ capability: s.capability, args: s.args, state: "todo", code: null }));
    let status = list.length ? "ready" : "discarded";   // ready → running → done | stopped; ready → discarded
    const doing = () => list.findIndex((s) => s.state === "doing");
    return {
      list: () => clone(list),
      status: () => status,
      remove(i) {
        if (status === "discarded") return fail("PLAN_DISCARDED");
        if (status !== "ready") return fail("PLAN_STARTED");
        if (!Number.isInteger(i) || i < 0 || i >= list.length) return fail("STEP_UNKNOWN");
        list.splice(i, 1);
        if (!list.length) status = "discarded";
        return { ok: true };
      },
      discard() { if (status !== "ready") return fail(status === "discarded" ? "PLAN_DISCARDED" : "PLAN_STARTED"); status = "discarded"; return { ok: true }; },
      start() { if (status !== "ready") return fail(status === "discarded" ? "PLAN_DISCARDED" : "PLAN_STARTED"); status = "running"; return { ok: true }; },
      /** The next step, now 进行中; null when there is none left (or the plan is not running). */
      next() {
        if (status !== "running") return null;
        if (doing() >= 0) return fail("STEP_BUSY");
        const i = list.findIndex((s) => s.state === "todo");
        if (i < 0) { status = "done"; return null; }
        list[i].state = "doing";
        return { index: i, capability: list[i].capability, args: clone(list[i].args) };
      },
      /** The step 进行中 ended: done, or failed (which stops the plan). */
      finish(i, { ok, code = null } = {}) {
        if (i !== doing()) return fail("STEP_NOT_DOING");
        list[i].state = ok ? "done" : "failed"; list[i].code = ok ? null : String(code || "FAILED");
        if (!ok) status = "stopped";
        else if (!list.some((s) => s.state === "todo")) status = "done";
        return { ok: true };
      },
      /** The step 进行中 was not done (declined, only listed, refused): it is 待做 again and the plan stops. */
      halt(i, code) {
        if (i !== doing()) return fail("STEP_NOT_DOING");
        list[i].state = "todo"; list[i].code = String(code || "HALTED"); status = "stopped";
        return { ok: true };
      },
    };
  }
  return Object.freeze({ STATES, MAX_STEPS, parse, create, stateLabel, stateMark, stepLabel, stepDetail });
});
