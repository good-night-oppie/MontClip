// Shared pure PR metadata rules. No I/O, dependencies, evaluation, or PR code execution.
const ITEM = { "首行": "header", "负责人": "owner", "改动": "changes", "复现": "reproduce", "测试": "tests", "依赖": "dependencies", "审查人": "reviewer", "音画同步": "avsync", "外发": "outbound" };
const LABEL = { "改动": "changes", "复现": "reproduce", "测试": "tests", "依赖": "dependencies", "音画同步": "avsync", "外发": "outbound" };
const clean = (s) => String(s || "").replace(/^\s*(?:[-*]|\d+[.)])\s+/, "").trim();
const placeholder = (s) => /^(?:TODO|待补|原因|无|N\/A|<[^>]+>)$/i.test(s);

export const reviewHeaderValid = (body) => String(body || "").split(/\r?\n/)[0] === "QQ 请审";

export function ownerDeclaration(body, teammates, sharedAccounts = []) {
  const lines = String(body || "").split(/\r?\n/);
  if (!reviewHeaderValid(body)) return { state: "missing", reason: "首行请写QQ 请审（不带@），第二行登记负责人" };
  const m = /^负责人：(.+)$/.exec(lines[1] || "");
  if (!m || !m[1].trim()) return { state: "missing", reason: "第二行请写负责人：<伙伴名>" };
  const owner = m[1].trim();
  if (sharedAccounts.some((x) => String(x).toLowerCase() === owner.toLowerCase())) return { state: "invalid", reason: "负责人须写实际伙伴名，不能写共用作者账号" };
  if (!Array.isArray(teammates) || !teammates.includes(owner)) return { state: "invalid", reason: "负责人须在仓库伙伴名单里，且只能一人" };
  return { state: "registered", owner, source: "pr_body_line_2" };
}

// Deja已确认：requested_reviewers含GoodNightOppie，或历史reviews含其审查，任一即算送审。
// GitHub会在审查后清空请求；正文提名不算。历史review在这里不表示当前head正式批准。
// 督查与CI直接共用本函数，不各写一套口径。
export function reviewerRequested(pr, reviewer = "GoodNightOppie", allowReviewHistory = true) {
  return (pr.reviewRequests || []).some((r) => r.login === reviewer)
    || (allowReviewHistory && (pr.reviews || []).some((r) => r.author?.login === reviewer));
}

// Historical review satisfies handoff; a new head can still need a fresh request.
// This is a notice only. Current-head approval remains a separate merge gate.
export function reviewerNotice(pr, reviewer = "GoodNightOppie") {
  if ((pr.reviewRequests || []).some(r => r.login === reviewer)) return null;
  const history = (pr.reviews || []).filter(r => r.author?.login === reviewer);
  const head = pr.headRefOid || pr.head?.sha;
  if (!history.length || !/^[a-f0-9]{40}$/.test(head || "")) return null;
  const latest = history.map((review, index) => ({ review, index, time: Date.parse(review.submittedAt || "") || 0 }))
    .sort((a, b) => a.time - b.time || a.index - b.index).at(-1).review;
  const reviewHead = latest.commit?.oid || latest.commit_id;
  return reviewHead && reviewHead !== head ? { item: "reviewer", message: "请重新请审查人：GoodNightOppie最近一次review不在当前head；仅提示，不判失败" } : null;
}

function sectionsOf(body) {
  const sections = {}; let current;
  for (const line of String(body || "").replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/).slice(2)) {
    const text = line.replace(/^\s*#{1,6}\s+/, "");
    const m = /^([^：:]+)[：:](.*)$/.exec(text);
    if (m) {
      const next = LABEL[m[1]];
      if (next) { current = next; (sections[current] ||= []).push(m[2]); continue; }
      if (m[1] === "SOP 例外") current = undefined;
    }
    if (/^\s*#{1,6}\s+/.test(line) && (!m || !LABEL[m[1]])) { current = undefined; continue; }
    if (current) sections[current].push(line);
  }
  return Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.map(clean).filter(Boolean)]));
}

function exceptionsOf(body) {
  const valid = [], invalid = [];
  for (const line of String(body || "").split(/\r?\n/)) {
    if (!/^\s*(?:[-*]\s*)?SOP\s*例外/.test(line)) continue;
    const m = /^SOP 例外：(.+?)\s+—\s+(.+?)\s+—\s+证据：(\S+)$/.exec(line.trim().replace(/^[-*]\s*/, ""));
    const evidenceOK = m && (/^https:\/\/[^\s]+$/i.test(m[3]) || /^[A-Za-z0-9_-]{6,128}$/.test(m[3]));
    if (!m || !ITEM[m[1]] || !m[2].trim() || placeholder(m[2].trim()) || !evidenceOK) invalid.push("SOP例外格式不完整：请写SOP 例外：<项目> — 原因 — 证据：<HTTPS链接或消息号>");
    else valid.push({ item: ITEM[m[1]], label: m[1] }); // never print arbitrary reasons or evidence URLs
  }
  return { valid, invalid };
}

export function testLineHasResult(line) {
  const s = clean(line);
  if (s.includes("没跑")) {
    const reason = s.slice(s.indexOf("没跑") + 2).replace(/^[\s:：—-]+/, "").trim();
    return reason.length > 0 && !placeholder(reason);
  }
  return /\b\d+\s*\/\s*[1-9]\d*\b/.test(s)
    || /(?:通过|失败|用例|tests?|pass(?:ed)?|fail(?:ed)?)\s*[:：=]?\s*\d+/i.test(s)
    || /\b\d+\s*(?:(?:个|项|组|条)\s*)?(?:tests?|passed|failed|通过|失败)/i.test(s);
}

export function dependenciesValid(lines = []) {
  if (lines.length !== 1) return false;
  if (lines[0] === "无") return true;
  return lines[0].split(/[;；]/).every((part) => {
    const s = part.trim();
    return /^#[1-9]\d*\s*[（(][^）)]+[）)]$/.test(s)
      && (/软依赖/.test(s) || /类型[：:]\s*[^，,）)\s]+/.test(s));
  });
}

function matches(path, glob) {
  const pattern = glob.split("**").map((chunk) => chunk.split("*").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")).join(".*");
  return new RegExp(`^${pattern}$`).test(path);
}

export function classifyFiles(files, profile) {
  const paths = files.flatMap((f) => typeof f === "string" ? [f] : f && typeof f === "object" ? [f.filename, f.previous_filename].filter((p) => typeof p === "string") : []).filter(p => !(profile.exclude || []).some(g => matches(p, g)));
  return { av: paths.some((p) => profile.av.some((g) => matches(p, g))), outbound: paths.some((p) => profile.outbound.some((g) => matches(p, g))) };
}

export const EXCEPTION_LABEL = "sop-exception-verified";
// Commit author/committer dates are author-controlled, not PR arrival times.
// Only an explicit timeline event timestamp can establish a head boundary.
export function headEnteredAt(pr, timeline) {
  if (!/^[a-f0-9]{40}$/.test(pr.headRefOid || "") || !Array.isArray(timeline)) return null;
  const moves = timeline.filter(e => ["committed", "head_ref_force_pushed"].includes(e.event));
  const last = moves.at(-1);
  if (!last) return null;
  const sha = last.event === "committed" ? last.sha : last.commit_id;
  const time = eventTime(last.created_at);
  return sha === pr.headRefOid && time !== null ? time : null;
}
function eventTime(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) return null;
  const n = Date.parse(value);
  return Number.isFinite(n) && n <= Date.now() ? n : null;
}
export function exceptionVerified(pr, events, timeline) {
  if (!(pr.labels || []).some((label) => (typeof label === "string" ? label : label?.name) === EXCEPTION_LABEL) || !Array.isArray(events)) return false;
  const changes = events.filter((e) => ["labeled", "unlabeled"].includes(e.event) && e.label?.name === EXCEPTION_LABEL);
  if (!changes.length || changes.some((e) => !/^\d+$/.test(String(e.id)) || !e.actor?.login)) return false;
  changes.sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0);
  const last = changes.at(-1);
  const entered = headEnteredAt(pr, timeline), labeled = eventTime(last.created_at);
  return last.event === "labeled" && last.actor.login === "GoodNightOppie" && entered !== null && labeled !== null && labeled > entered;
}

export function checkPR({ pr, files, repo, policy, teammates, labelEvents, timeline }) {
  if (pr.isDraft) return { status: "skipped", issues: [], exceptions: [], owner: { state: "skipped" } };
  const issues = [], exception = exceptionsOf(pr.body);
  const notice = policy?.allowReviewHistory ? reviewerNotice(pr, policy.reviewer) : null;
  const warnings = notice ? [notice] : [];
  const add = (item, message) => { if (!exception.valid.some((e) => e.item === item)) issues.push({ item, message }); };
  if (!policy?.repositories?.[repo] || !Array.isArray(teammates) || !teammates.length) {
    return { status: "failed", issues: [{ item: "configuration", message: "仓库或伙伴名单未配置，请维护者补规则，不能当检查通过" }], exceptions: [], owner: { state: "unknown" } };
  }
  if (!Array.isArray(files)) issues.push({ item: "files", message: "改动文件列表不完整，请重试只读API，不能省略条件检查" });
  exception.invalid.forEach((message) => issues.push({ item: "exception", message }));
  if (!reviewHeaderValid(pr.body)) add("header", "第一行请写QQ 请审，不带@、空行或其他文字");
  const owner = ownerDeclaration(pr.body, teammates, [...policy.sharedAccounts, pr.author?.login].filter(Boolean));
  if (owner.state !== "registered") add("owner", owner.reason + "；请Deja协调补负责人登记");
  const sections = sectionsOf(pr.body);
  for (const [key, label] of [["changes", "改动"], ["reproduce", "复现"], ["tests", "测试"]]) {
    if (!sections[key]?.length || sections[key].every(placeholder)) add(key, `请补非空的${label}：段`);
  }
  if (sections.tests?.some((line) => !testLineHasResult(line))) add("tests", "测试段每一行请写结果数字（如23/23），或没跑加具体原因");
  if (!dependenciesValid(sections.dependencies)) add("dependencies", "请写依赖：无，或依赖：#编号（硬依赖，类型：代码）；多项用分号分开");
  if (!reviewerRequested(pr, policy.reviewer, policy.allowReviewHistory)) add("reviewer", "请添加审查人GoodNightOppie；正文提到名字不算请求审查");
  const categories = classifyFiles(files || [], policy.repositories[repo]);
  if (categories.av && !sections.avsync?.length) add("avsync", "改了剪辑或导出文件，请补音画同步：测量结果，没跑时说明原因或提供SOP例外");
  if (categories.outbound) {
    const text = (sections.outbound || []).join(" ");
    if (!/(?:发什么|内容)[：:]\s*\S/.test(text) || !/(?:发给谁|接收方)[：:]\s*\S/.test(text) || !/(?:能不能关|能否关闭|关闭方式)[：:]\s*\S/.test(text)) {
      add("outbound", "改了联网或外发文件，请补外发：内容：…；接收方：…；能否关闭：…");
    }
  }
  const verified = exception.valid.length > 0 && exceptionVerified(pr, labelEvents, timeline);
  return { status: issues.length ? "failed" : exception.valid.length && !verified ? "needs_qq" : "passed", issues, warnings, exceptions: exception.valid, exceptionVerified: verified, owner, categories };
}

export function formatReport(result) {
  const label = { passed: "模板检查通过（不代替审查批准）", skipped: "Draft：跳过送审模板检查", failed: "模板检查需补齐", needs_qq: "需要 QQ 核验：仅确认例外格式，机器未证明例外成立" }[result.status];
  return [label, ...result.issues.map((i) => `- ${i.message}`), ...(result.warnings || []).map(w => `- 提示：${w.message}`), ...result.exceptions.map((e) => `- ${e.label}使用SOP例外，${result.exceptionVerified ? "已核对QQ标签晚于当前head进入PR；不等于正式批准" : "等 QQ 重新核验：需可靠的当前head进入PR时间，及此后由GoodNightOppie重新添加的sop-exception-verified标签"}`)].join("\n");
}
