import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkPR, classifyFiles, ownerDeclaration, testLineHasResult, EXCEPTION_LABEL, formatReport } from "./rules.mjs";
import { collectMetadata, main } from "./run.mjs";
import { workflowText, FILES } from "./make-workflow.mjs";
import { createHash } from "node:crypto";
const policy = JSON.parse(fs.readFileSync(new URL("policy.json", import.meta.url), "utf8"));
const teammates = JSON.parse(fs.readFileSync(new URL("teammates.json", import.meta.url), "utf8"));
const REPO = "good-night-oppie/MontClip";
const BODY = "QQ 请审\n负责人：BB\n改动：增加模板检查\n复现：node scripts/pr-sop/rules.test.mjs\n测试：\n- 单元：23/23\n- 媒体：没跑—仅元数据规则，没有修改媒体执行路径\n依赖：无";
const run = (body = BODY, more = {}) => checkPR({ pr: { body, isDraft: false, reviewRequests: [{ login: "GoodNightOppie" }] }, files: ["docs/example.md"], repo: REPO, policy, teammates, ...more });
const missing = (r, item) => r.issues.some((i) => i.item === item);

describe("PR SOP：逐项正负控", () => {
  it("合规正文通过，Draft跳过，ready后恢复检查", () => {
    assert.equal(run().status, "passed");
    assert.equal(run("", { pr: { isDraft: true } }).status, "skipped");
    assert.equal(run("", { pr: { body: "", isDraft: false } }).status, "failed");
  });
  it("第一行缺失、带@、前置空行都失败", () => {
    for (const body of [BODY.replace("QQ 请审", ""), "@" + BODY, "\n" + BODY]) assert.ok(missing(run(body), "header"));
  });
  it("第二行缺失、第三行才登记均失败", () => {
    assert.ok(missing(run(BODY.replace("负责人：BB", "")), "owner"));
    assert.ok(missing(run(BODY.replace("负责人：BB", "说明\n负责人：BB")), "owner"));
  });
  it("共用账号EdwardTang/GoodNightOppie不当实际伙伴", () => {
    for (const name of ["EdwardTang", "GoodNightOppie"]) assert.ok(missing(run(BODY.replace("负责人：BB", `负责人：${name}`)), "owner"));
  });
  it("未入名单、多人及占位符失败，名单来自文件", () => {
    for (const name of ["NewPerson", "BB、QQ", "<伙伴名>"]) assert.ok(missing(run(BODY.replace("负责人：BB", `负责人：${name}`)), "owner"));
    assert.equal(ownerDeclaration("QQ 请审\n负责人：BB", ["QQ"], policy.sharedAccounts).state, "invalid");
  });
  for (const [label, item] of [["改动", "changes"], ["复现", "reproduce"], ["测试", "tests"]]) {
    it(`缺${label}或空段都失败`, () => {
      const body = BODY.replace(new RegExp(`${label}：[\\s\\S]*?(?=\\n(?:改动|复现|测试|依赖)：|$)`), "");
      assert.ok(missing(run(body), item));
      assert.ok(missing(run(body + `\n${label}：`), item));
    });
  }
  it("测试每行有数字结果或没跑原因，不能用版本数字或裸通过冒充", () => {
    for (const line of ["通过", "node 22", "没跑", "没跑：原因", "0/0"]) assert.equal(testLineHasResult(line), false, line);
    for (const line of ["23/23", "通过：12，失败：0", "23 tests passed", "5组通过", "没跑：当前没有媒体变动"]) assert.equal(testLineHasResult(line), true, line);
    assert.ok(missing(run(BODY.replace("- 单元：23/23", "- 单元：通过")), "tests"));
  });
  it("依赖必须存在，硬依赖带类型", () => {
    for (const text of ["", "看上一个PR", "#12", "#0（类型：代码）"]) assert.ok(missing(run(BODY.replace("依赖：无", `依赖：${text}`)), "dependencies"));
    assert.equal(run(BODY.replace("依赖：无", "依赖：#12（硬依赖，类型：代码）")).status, "passed");
    assert.equal(run(BODY.replace("依赖：无", "依赖：#12（软依赖）")).status, "passed");
  });
  it("审查人须API请求或已有review，正文提名不算", () => {
    assert.ok(missing(run(BODY, { pr: { body: BODY + "\nGoodNightOppie", reviewRequests: [] } }), "reviewer"));
    assert.equal(run(BODY, { pr: { body: BODY, reviewRequests: [], reviews: [{ author: { login: "GoodNightOppie" } }] } }).status, "passed");
  });
  it("批准后请求被GitHub清空：已有当前head review仍通过", () => {
    const head = "a".repeat(40);
    const r = run(BODY, { pr: { body: BODY, headRefOid: head, reviewRequests: [], reviews: [{ author: { login: "GoodNightOppie" }, state: "APPROVED", commit: { oid: head }, submittedAt: "2026-11-07T00:00:00Z" }] } });
    assert.equal(r.status, "passed"); assert.deepEqual(r.warnings, []);
  });
  it("从没请过且没有review失败，正文提名不能冒充审查请求", () => {
    const r = run(BODY, { pr: { body: BODY + "\n## 备注\nGoodNightOppie", headRefOid: "a".repeat(40), reviewRequests: [], reviews: [] } });
    assert.equal(r.status, "failed"); assert.ok(missing(r, "reviewer"));
  });
  it("新head没有请求、最近review在旧head：只提示不失败；重新请求后消除提示", () => {
    const head = "a".repeat(40), older = "b".repeat(40);
    const pr = { body: BODY, headRefOid: head, reviewRequests: [], reviews: [
      { author: { login: "GoodNightOppie" }, commit: { oid: older }, submittedAt: "2026-11-07T01:00:00Z" },
      { author: { login: "GoodNightOppie" }, commit: { oid: head }, submittedAt: "2026-11-07T00:00:00Z" }
    ] };
    const r = run(BODY, { pr }); assert.equal(r.status, "passed"); assert.equal(r.issues.length, 0);
    assert.equal(r.warnings.length, 1); assert.match(formatReport(r), /请重新请审查人/);
    assert.deepEqual(run(BODY, { pr: { ...pr, reviewRequests: [{ login: "GoodNightOppie" }] } }).warnings, []);
  });
  it("改剪辑/导出须音画同步行，纯文档不加门槛", () => {
    assert.ok(missing(run(BODY, { files: ["export.js"] }), "avsync"));
    assert.equal(run(BODY + "\n音画同步：没跑—此用例只验证格式", { files: ["export.js"] }).status, "passed");
    assert.equal(run().status, "passed");
  });
  it("外发说明须内容/接收方/可关三项", () => {
    const files = ["desktop/agent-service.js"];
    for (const note of ["", "外发：内容：文本", "外发：接收方：服务商；能否关闭：可以"]) assert.ok(missing(run(BODY + "\n" + note, { files }), "outbound"));
    assert.equal(run(BODY + "\n外发：内容：PR元数据；接收方：api.github.com；能否关闭：可取消检查", { files }).status, "passed");
  });
  it("重命名不能通过换路径逃过剪辑/外发分类", () => {
    const c = classifyFiles([{ filename: "docs/moved.txt", previous_filename: "desktop/agent-service.js" }], policy.repositories[REPO]);
    assert.equal(c.outbound, true);
  });
  it("Cindy worker同时触发两类门槛，未知仓库不静默通过", () => {
    const r = run(BODY, { repo: "good-night-oppie/MontClip-Cindy", files: ["node/worker.cjs"] });
    assert.ok(missing(r, "avsync")); assert.ok(missing(r, "outbound"));
    assert.ok(missing(run(BODY, { repo: "unknown/repo" }), "configuration"));
  });
  it("例外格式正确也只能需要QQ核验，不作机器批准", () => {
    const r = run(BODY.replace("- 单元：23/23", "- 单元：没跑") + "\nSOP 例外：测试 — 当前先做文档核读 — 证据：c1c25e38");
    assert.equal(r.status, "needs_qq"); assert.equal(r.issues.length, 0);
    assert.equal(r.exceptions[0].item, "tests");
  });
  it("例外格式错、缺证据、未知项目不能豁免", () => {
    for (const line of ["SOP 例外：测试 - 原因 - 证据：c1c25e38", "SOP 例外：测试 — 当前没法跑 — 证据：", "SOP 例外：未知 — 原因说明 — 证据：c1c25e38"]) {
      const r = run(BODY + "\n" + line); assert.ok(missing(r, "exception")); assert.equal(r.status, "failed");
    }
  });
  it("例外只有QQ最后添加且当前仍存在的标签才放行", () => {
    const body = BODY.replace("- 单元：23/23", "- 单元：没跑") + "\nSOP 例外：测试 — 当前先做文档核读 — 证据：https://github.com/good-night-oppie/MontClip/issues/200";
    const pr = { body, labels: [{ name: EXCEPTION_LABEL }], reviewRequests: [{ login: "GoodNightOppie" }] };
    const event = (id, actor, kind = "labeled") => ({ id, event: kind, actor: { login: actor }, label: { name: EXCEPTION_LABEL } });
    assert.equal(run(body, { pr }).status, "needs_qq");
    assert.equal(run(body, { pr, labelEvents: [event(1, "BB")] }).status, "needs_qq");
    assert.equal(run(body, { pr, labelEvents: [event(1, "GoodNightOppie")] }).status, "passed");
    assert.equal(run(body, { pr, labelEvents: [event(1, "GoodNightOppie"), event(2, "BB", "unlabeled")] }).status, "needs_qq");
    assert.equal(run(body, { pr, labelEvents: [event(3, "BB"), event(1, "GoodNightOppie")] }).status, "needs_qq");
    assert.equal(run(body, { pr: { ...pr, labels: [] }, labelEvents: [event(1, "GoodNightOppie")] }).status, "needs_qq");
    assert.equal(run(body, { pr, labelEvents: [event("bad", "GoodNightOppie")] }).status, "needs_qq");
    assert.equal(run(body, { pr: { ...pr, body: body.replace("负责人：BB", "负责人：EdwardTang") }, labelEvents: [event(1, "GoodNightOppie")] }).status, "failed");
  });
  it("文件列表未知不能通过，事件正文改动立即重算", () => {
    assert.ok(missing(run(BODY, { files: undefined }), "files"));
    assert.equal(run().status, "passed"); assert.equal(run(BODY.replace("改动：增加模板检查", "改动：")).status, "failed");
  });
  it("模板注释不算非空内容，额外Markdown证据标题不污染依赖段", () => {
    assert.ok(missing(run(BODY.replace("改动：增加模板检查", "改动：<!-- 尚未填写 -->")), "changes"));
    assert.equal(run(BODY + "\n## 证据\n工作流链接稍后补").status, "passed");
  });
});

describe("只读API及工作流安全", () => {
  const eventPR = { number: 1, head: { sha: "a".repeat(40) }, body: BODY, user: { login: "EdwardTang" } };
  it("API分页读取文件/审查人，丢弃patch，事件正文不当代码", async () => {
    const calls = [];
    const get = async (route) => {
      calls.push(route);
      if (/\/files\?/.test(route)) return [{ filename: "docs/a.md", patch: "throw Error('do not execute')" }];
      if (route.endsWith("/requested_reviewers")) return { users: [{ login: "GoodNightOppie" }] };
      if (/\/reviews\?/.test(route)) return [];
      if (/\/events\?/.test(route)) return [];
      return { ...eventPR, changed_files: 1 };
    };
    const m = await collectMetadata({ get, repo: REPO, number: 1, eventPR });
    assert.deepEqual(m.files, [{ filename: "docs/a.md", previous_filename: undefined }]);
    assert.equal(m.pr.body, BODY); assert.equal(calls.length, 7);
  });
  it("文件未取全、PR已push时明确失败", async () => {
    await assert.rejects(collectMetadata({ get: async () => ({ head: { sha: "b".repeat(40) } }), repo: REPO, number: 1, eventPR }), /PR_CHANGED/);
    const get = async (r) => /files\?/.test(r) ? [] : r.endsWith("requested_reviewers") ? { users: [] } : /(?:reviews|events)\?/.test(r) ? [] : { ...eventPR, changed_files: 2 };
    await assert.rejects(collectMetadata({ get, repo: REPO, number: 1, eventPR }), /API_INCOMPLETE/);
    await assert.rejects(collectMetadata({ get: async () => ({ ...eventPR, draft: false }), repo: REPO, number: 1, eventPR: { ...eventPR, draft: true } }), /PR_CHANGED/);
  });
  it("只监听指定pull_request事件、只读权限、无checkout/install/PR代码执行", () => {
    const yml = workflowText();
    assert.match(yml, /types: \[opened, edited, synchronize, ready_for_review, reopened, labeled, unlabeled, review_requested, review_request_removed\]/);
    assert.doesNotMatch(yml, /pull_request_target|uses:|checkout@|npm (?:ci|install)|secrets\./);
    assert.match(yml, /pull-requests: read/); assert.match(yml, /contents: read/);
    assert.match(yml, /issues: read/); assert.match(yml, /name: sop-pr-lint/);
    assert.doesNotMatch(yml, /continue-on-error|paths:|paths-ignore:|: write/);
    assert.equal(fs.readFileSync(new URL("../../.github/workflows/pr-sop.yml", import.meta.url), "utf8"), yml);
  });
  it("同head正文已改、标签事件读取间变化和未取全都失败", async () => {
    await assert.rejects(collectMetadata({ get: async () => ({ ...eventPR, body: BODY + "changed" }), repo: REPO, number: 1, eventPR }), /PR_CHANGED/);
    let reads = 0;
    const get = async (r) => {
      if (/files\?/.test(r)) return [];
      if (r.endsWith("requested_reviewers")) return { users: [] };
      if (/reviews\?/.test(r)) return [];
      if (/events\?/.test(r)) return ++reads === 1 ? [] : [{ id: 2, event: "labeled", actor: { login: "BB" }, label: { name: EXCEPTION_LABEL } }];
      return { ...eventPR, changed_files: 0 };
    };
    await assert.rejects(collectMetadata({ get, repo: REPO, number: 1, eventPR }), /LABEL_CHANGED/);
    await assert.rejects(collectMetadata({ get: async (r) => /events\?/.test(r) ? Array.from({ length: 100 }, (_, id) => ({ id })) : get(r), repo: REPO, number: 1, eventPR }), /API_INCOMPLETE/);
  });
  it("runner缺负责人及待QQ例外返回1，QQ标签核验后返回0", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pr-sop-exit-test-"));
    const event = path.join(dir, "event.json"); const original = globalThis.fetch;
    let current, events = [], requested = [{ login: "GoodNightOppie" }], reviewRows = [];
    globalThis.fetch = async (url) => ({ ok: true, json: async () => {
      const route = String(url);
      if (route.includes("/files?")) return [];
      if (route.endsWith("requested_reviewers")) return { users: requested };
      if (route.includes("/reviews?")) return reviewRows;
      if (route.includes("/events?")) return events;
      return { ...current, changed_files: 0 };
    } });
    const env = { GITHUB_EVENT_PATH: event, GITHUB_EVENT_NAME: "pull_request", GITHUB_REPOSITORY: REPO };
    try {
      current = { ...eventPR, body: BODY.replace("负责人：BB", "") };
      fs.writeFileSync(event, JSON.stringify({ pull_request: current })); assert.equal(await main(env), 1);
      current = { ...eventPR, body: BODY + "\nSOP 例外：测试 — 暂时人工核验 — 证据：c1c25e38", labels: [{ name: EXCEPTION_LABEL }] };
      fs.writeFileSync(event, JSON.stringify({ pull_request: current })); assert.equal(await main(env), 1);
      events = [{ id: 1, event: "labeled", actor: { login: "GoodNightOppie" }, label: { name: EXCEPTION_LABEL } }];
      assert.equal(await main(env), 0);
      current = { ...eventPR, body: BODY };
      requested = []; reviewRows = [{ user: { login: "GoodNightOppie" }, commit_id: "b".repeat(40), submitted_at: "2026-11-07T00:00:00Z" }];
      fs.writeFileSync(event, JSON.stringify({ pull_request: current }));
      assert.equal(await main(env), 0, "old-head review notice must not fail the check");
    } finally { globalThis.fetch = original; }
  });
  it("嵌入的规则/名单/分类/runner逐字节等于源文件，校验SHA256", () => {
    const yml = workflowText();
    const raw = yml.match(/const payload = (.+);/)[1]; const payload = JSON.parse(raw);
    assert.deepEqual(Object.keys(payload), FILES);
    for (const name of FILES) {
      const original = fs.readFileSync(new URL(name, import.meta.url)); const embedded = Buffer.from(payload[name].base64, "base64");
      assert.ok(embedded.equals(original)); assert.equal(payload[name].sha256, createHash("sha256").update(original).digest("hex"));
    }
  });
  it("真实执行嵌入工作流的Node代码：Draft只核当前状态、不执行PR文件", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pr-sop-workflow-test-"));
    const event = path.join(dir, "event.json"), script = path.join(dir, "embedded.mjs");
    fs.writeFileSync(event, JSON.stringify({ pull_request: { ...eventPR, draft: true, body: "$(touch do-not-execute)" } }));
    const code = workflowText().split("          node --input-type=module <<'PR_SOP_NODE'\n")[1].split("          PR_SOP_NODE")[0].split("\n").map((l) => l.slice(10)).join("\n");
    fs.writeFileSync(script, `globalThis.fetch = async () => ({ ok: true, json: async () => JSON.parse((await import('node:fs')).readFileSync(process.env.GITHUB_EVENT_PATH)).pull_request });\n` + code);
    const r = spawnSync(process.execPath, [script], { windowsHide: true, encoding: "utf8", env: { ...process.env, GITHUB_EVENT_PATH: event, GITHUB_EVENT_NAME: "pull_request", GITHUB_REPOSITORY: REPO, GITHUB_STEP_SUMMARY: path.join(dir, "summary.md"), GITHUB_TOKEN: "" } });
    assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /Draft/); assert.ok(!fs.existsSync(path.join(dir, "do-not-execute")));
  });
});

describe("Deja追加的七项独立阻断回归", () => {
  it("缺负责人必须失败",()=>assert.equal(run(BODY.replace("负责人：BB", "")).status,"failed"));
  it("共用账号不能代替负责人",()=>assert.equal(run(BODY.replace("负责人：BB", "负责人：GoodNightOppie")).status,"failed"));
  it("测试没有数字或没跑原因必须失败",()=>assert.equal(run(BODY.replace("23/23", "已经通过")).status,"failed"));
  it("例外格式错必须失败",()=>assert.equal(run(BODY+"\nSOP 例外：测试 — 没空").status,"failed"));
  const body=BODY+"\nSOP 例外：测试 — 人工核对 — 证据：https://github.com/good-night-oppie/MontClip/issues/200";
  it("例外格式对但没有标签仍等QQ",()=>assert.equal(run(body).status,"needs_qq"));
  it("标签由非GoodNightOppie添加仍等QQ",()=>assert.equal(run(body,{pr:{body,labels:[{name:EXCEPTION_LABEL}],reviewRequests:[{login:"GoodNightOppie"}]},labelEvents:[{id:1,event:"labeled",actor:{login:"BB"},label:{name:EXCEPTION_LABEL}}]}).status,"needs_qq"));
  it("材料齐全无例外通过",()=>assert.equal(run().status,"passed"));
});
