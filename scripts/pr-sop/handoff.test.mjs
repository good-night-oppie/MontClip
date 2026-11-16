// 送审改看 PR 评论首行 @QQOppieXYZ（主人 2026-11-16 定，SOP v4.1 第 5 条），以及例外核验也认 qqoppiexyz[bot]。
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import { checkPR, handoffRequested, mentionOf, verifiedExceptionItems, formatReport } from "./rules.mjs";
import { collectMetadata } from "./run.mjs";
const policy = JSON.parse(fs.readFileSync(new URL("policy.json", import.meta.url), "utf8"));
const teammates = JSON.parse(fs.readFileSync(new URL("teammates.json", import.meta.url), "utf8"));
const REPO = "good-night-oppie/MontClip", head = "a".repeat(40), old = "b".repeat(40);
const BODY = "QQ 请审\n负责人：Deja\n改动：规则\n复现：node --test\n测试：1/1\n依赖：无";
const comment = (body, login = "dejaoppiexyz[bot]") => ({ author: { login }, body });
const qqReview = (more = {}) => ({ author: { login: "qqoppiexyz[bot]" }, commit: { oid: head }, state: "APPROVED", body: "", ...more });
const pr = (more = {}) => ({ body: BODY, headRefOid: head, author: { login: "dejaoppiexyz[bot]" }, reviewRequests: [], reviews: [], comments: [], ...more });
const run = (more = {}, files = ["docs/a.md"]) => checkPR({ pr: pr(more), files, repo: REPO, policy, teammates });
const missing = (r, item) => r.issues.some((i) => i.item === item);

describe("送审：PR 评论首行 @QQOppieXYZ，或已有 qqoppiexyz[bot] review", () => {
  it("policy 不再要求 GoodNightOppie 当审查人", () => {
    assert.equal(policy.reviewer, undefined);
    assert.equal(policy.handoff.mention, "QQOppieXYZ");
    assert.equal(policy.handoff.reviewer, "qqoppiexyz[bot]");
  });
  it("评论首个非空行以 @QQOppieXYZ 开头即算送审，伙伴 App 账号写的也算", () => {
    for (const text of ["@QQOppieXYZ 请终审（改 lint 规则）", "\n\n  @QQOppieXYZ 请复审", "@qqoppiexyz 请审", "@QQOppieXYZ", "\r\n@QQOppieXYZ\r\n正文"]) {
      assert.equal(run({ comments: [comment(text)] }).status, "passed", JSON.stringify(text));
    }
    assert.equal(run({ comments: [comment("@QQOppieXYZ 请审", "EdwardTang")] }).status, "passed");
  });
  it("首行不是 @、在引用或代码块里、@ 了别人或名字只是前缀，都不算", () => {
    for (const text of ["请 @QQOppieXYZ 审", "说明\n@QQOppieXYZ 请审", "> @QQOppieXYZ 请审", "```\n@QQOppieXYZ 请审\n```", "~~~\n@QQOppieXYZ\n~~~",
      "    @QQOppieXYZ 请审", "`@QQOppieXYZ` 请审", "@QQOppieXYZabc 请审", "@QQOppieXYZ-bot 请审", "@DDOppieXYZ 请审", "QQOppieXYZ 请审", ""]) {
      const r = run({ comments: [comment(text)] });
      assert.equal(r.status, "failed", JSON.stringify(text)); assert.ok(missing(r, "reviewer"), JSON.stringify(text));
    }
  });
  it("PR 正文首行写 @QQ 不算送审（正文首行仍须写<伙伴名> 请审）", () => {
    assert.ok(missing(run({ body: BODY + "\n@QQOppieXYZ 请审" }), "reviewer"));
  });
  it("已有 qqoppiexyz[bot] 的 review（任何 head、任何状态）即算送审", () => {
    for (const state of ["APPROVED", "COMMENTED", "CHANGES_REQUESTED"]) assert.equal(run({ reviews: [qqReview({ state })] }).status, "passed", state);
    assert.equal(run({ reviews: [qqReview({ commit: { oid: old } })] }).status, "passed");
    assert.equal(run({ reviews: [{ user: { login: "qqoppiexyz[bot]" }, commit_id: head, state: "APPROVED" }] }).status, "passed");
  });
  it("GoodNightOppie 的请求或 review 不再算送审", () => {
    const r = run({ reviewRequests: [{ login: "GoodNightOppie" }], reviews: [{ author: { login: "GoodNightOppie" }, commit: { oid: head }, state: "APPROVED" }] });
    assert.equal(r.status, "failed"); assert.ok(missing(r, "reviewer"));
  });
  it("缺送审的提示写清楚怎么补，不再提 GoodNightOppie", () => {
    const text = formatReport(run());
    assert.match(text, /@QQOppieXYZ/); assert.doesNotMatch(text, /GoodNightOppie/);
  });
  it("QQ 自己写的 PR：@DDOppieXYZ、@ADOppieXYZ、@VVOppieXYZ 也算；别人写的 PR 不算", () => {
    const qqPR = { author: { login: "qqoppiexyz[bot]" }, body: BODY.replace("QQ 请审", "DD 请审") };
    for (const who of ["DDOppieXYZ", "ADOppieXYZ", "VVOppieXYZ", "QQOppieXYZ"]) {
      assert.equal(run({ ...qqPR, comments: [comment(`@${who} 请审`, "qqoppiexyz[bot]")] }).status, "passed", who);
    }
    assert.ok(missing(run({ ...qqPR, comments: [comment("@BBOppieXYZ 请审", "qqoppiexyz[bot]")] }), "reviewer"));
    assert.ok(missing(run({ comments: [comment("@DDOppieXYZ 请审")] }), "reviewer"));
  });
  it("mentionOf 只看首个非空行", () => {
    assert.equal(mentionOf("\n\n@QQOppieXYZ 请审"), "qqoppiexyz");
    assert.equal(mentionOf("hi\n@QQOppieXYZ"), null);
    assert.equal(handoffRequested(pr({ comments: [comment("@QQOppieXYZ 请审")] }), policy.handoff), true);
  });
  it("最近一次 QQ review 在旧 head、且没有 @ 评论：只提示重新 @，不判失败", () => {
    const r = run({ reviews: [qqReview({ commit: { oid: old }, submittedAt: "2026-11-15T00:00:00Z" })] });
    assert.equal(r.status, "passed"); assert.equal(r.warnings.length, 1); assert.match(formatReport(r), /@QQOppieXYZ/);
    assert.deepEqual(run({ reviews: [qqReview({ commit: { oid: old } })], comments: [comment("@QQOppieXYZ 请复审")] }).warnings, []);
    assert.deepEqual(run({ reviews: [qqReview()] }).warnings, []);
  });
});

describe("SOP 例外已核验：也认 qqoppiexyz[bot] 当前 head 的 review（单独请 QQ 确认）", () => {
  const exBody = BODY + "\nSOP 例外：测试 — 人工核读 — 证据：c1c25e38";
  const items = (reviews) => [...verifiedExceptionItems(pr({ reviews }))];
  it("qqoppiexyz[bot] 当前 head APPROVED/COMMENTED 的精确整行有效", () => {
    for (const state of ["APPROVED", "COMMENTED"]) assert.deepEqual(items([qqReview({ state, body: "核了\nSOP 例外已核验：测试" })]), ["tests"], state);
    assert.equal(run({ body: exBody, reviews: [qqReview({ body: "SOP 例外已核验：测试" })] }).status, "passed");
  });
  it("GoodNightOppie 仍有效（账号恢复后不必再改规则）", () => {
    assert.deepEqual(items([qqReview({ author: { login: "GoodNightOppie" }, body: "SOP 例外已核验：测试" })]), ["tests"]);
  });
  it("旧 head、其他状态、引用、代码块、行内多字、其他 bot 都不算", () => {
    const bad = [
      qqReview({ commit: { oid: old }, body: "SOP 例外已核验：测试" }),
      qqReview({ state: "CHANGES_REQUESTED", body: "SOP 例外已核验：测试" }),
      qqReview({ state: "DISMISSED", body: "SOP 例外已核验：测试" }),
      qqReview({ body: "> SOP 例外已核验：测试" }),
      qqReview({ body: "```\nSOP 例外已核验：测试\n```" }),
      qqReview({ body: "SOP 例外已核验：测试 " }),
      qqReview({ author: { login: "dejaoppiexyz[bot]" }, body: "SOP 例外已核验：测试" })
    ];
    for (const r of bad) assert.deepEqual(items([r]), [], JSON.stringify(r));
    assert.deepEqual(items([qqReview({ body: "SOP 例外已核验：测试" })].map((r) => ({ ...r, commit: { oid: head } }))), ["tests"]);
    assert.equal(verifiedExceptionItems({ ...pr({ reviews: [qqReview({ body: "SOP 例外已核验：测试" })] }), headRefOid: "aaaa" }).size, 0);
  });
  it("needs_qq 的提示写 QQ 的 App 账号", () => {
    assert.match(formatReport(run({ body: exBody, comments: [comment("@QQOppieXYZ 请审")] })), /qqoppiexyz\[bot\]/);
  });
});

describe("runner 读取 PR 评论", () => {
  const eventPR = { number: 1, head: { sha: head }, body: BODY, user: { login: "dejaoppiexyz[bot]" } };
  const base = (route) => route.includes("/files?") ? [] : route.includes("/reviews?") ? [] : route.endsWith("/requested_reviewers") ? { users: [] } : { ...eventPR, changed_files: 0 };
  it("分页读 /issues/N/comments，只留作者和正文", async () => {
    const calls = [];
    const get = async (route) => {
      calls.push(route);
      if (route.includes("/issues/1/comments?")) return route.includes("page=1&") || route.endsWith("page=1")
        ? Array.from({ length: 100 }, (_, id) => ({ id, user: { login: "x" }, body: "hi", updated_at: "t", html_url: "u" }))
        : [{ id: 100, user: { login: "dejaoppiexyz[bot]" }, body: "@QQOppieXYZ 请审", updated_at: "t" }];
      return base(route);
    };
    const m = await collectMetadata({ get, repo: REPO, number: 1, eventPR });
    assert.equal(m.pr.comments.length, 101);
    assert.deepEqual(m.pr.comments[100], { author: { login: "dejaoppiexyz[bot]" }, body: "@QQOppieXYZ 请审" });
    assert.ok(calls.some((r) => r === `/repos/${REPO}/issues/1/comments?per_page=100&page=2`));
    assert.equal(checkPR({ ...m, repo: REPO, policy, teammates }).status, "passed");
  });
  it("前后两次读到的评论不一致（编辑、删除）明确失败", async () => {
    for (const changed of [{ body: "edited" }, { user: { login: "BB" } }, { updated_at: "t2" }, null]) {
      let reads = 0; const row = { id: 1, user: { login: "dejaoppiexyz[bot]" }, body: "@QQOppieXYZ 请审", updated_at: "t" };
      const get = async (route) => route.includes("/comments?") ? (++reads === 1 ? [row] : changed ? [{ ...row, ...changed }] : []) : base(route);
      await assert.rejects(collectMetadata({ get, repo: REPO, number: 1, eventPR }), /COMMENTS_CHANGED/);
    }
  });
  it("评论超过 3000 条不静默截断", async () => {
    const get = async (route) => route.includes("/comments?") ? Array.from({ length: 100 }, (_, id) => ({ id })) : base(route);
    await assert.rejects(collectMetadata({ get, repo: REPO, number: 1, eventPR }), /API_INCOMPLETE/);
  });
});
