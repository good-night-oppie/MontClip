// Metadata-only runner. The workflow embeds this audited checker; no checkout or PR imports.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { checkPR, formatReport, EXCEPTION_LABEL } from "./rules.mjs";

const policy = JSON.parse(fs.readFileSync(new URL("./policy.json", import.meta.url), "utf8"));
const teammates = JSON.parse(fs.readFileSync(new URL("./teammates.json", import.meta.url), "utf8"));
export async function collectMetadata({ get, repo, number, eventPR }) {
  const prefix = `/repos/${repo}/pulls/${number}`;
  const first = await get(prefix);
  const labels = (p) => (p.labels || []).map((l) => l.name).sort();
  const same = (a, b) => a.head?.sha === b.head?.sha && (a.body || "") === (b.body || "") && !!a.draft === !!b.draft && JSON.stringify(labels(a)) === JSON.stringify(labels(b));
  if (!same(first, eventPR)) throw Error("PR_CHANGED");
  if (first.draft) return { pr: { isDraft: true }, files: [], labelEvents: [] };
  async function pages(suffix, base = prefix) {
    const items = [];
    for (let page = 1; page <= 30; page++) {
      const rows = await get(`${base}/${suffix}?per_page=100&page=${page}`);
      if (!Array.isArray(rows)) throw Error("API_SHAPE");
      // Ignore patches/content. Only names and reviewer metadata are used.
      items.push(...rows);
      if (rows.length < 100) return items;
    }
    throw Error("API_INCOMPLETE");
  }
  const issue = `/repos/${repo}/issues/${number}`;
  const [fileRows, requested, reviews, labelEvents] = await Promise.all([pages("files"), get(`${prefix}/requested_reviewers`), pages("reviews"), pages("events", issue)]);
  if (fileRows.length !== first.changed_files) throw Error("API_INCOMPLETE");
  const finalEvents = await pages("events", issue);
  const fingerprint = (events) => JSON.stringify(events.filter((e) => ["labeled", "unlabeled"].includes(e.event) && e.label?.name === EXCEPTION_LABEL).map((e) => [e.id, e.event, e.actor?.login]));
  if (fingerprint(labelEvents) !== fingerprint(finalEvents)) throw Error("LABEL_CHANGED");
  const last = await get(prefix);
  if (!same(last, first)) throw Error("PR_CHANGED");
  if (!Array.isArray(requested.users)) throw Error("API_SHAPE");
  return {
    pr: { body: eventPR.body || "", isDraft: !!eventPR.draft, headRefOid: eventPR.head.sha, author: { login: eventPR.user?.login },
      labels: first.labels || [], reviewRequests: requested.users.map((u) => ({ login: u.login })), reviews: reviews.map((r) => ({ author: { login: r.user?.login }, commit: { oid: r.commit_id }, submittedAt: r.submitted_at })) },
    labelEvents,
    files: fileRows.map((f) => ({ filename: f.filename, previous_filename: f.previous_filename }))
  };
}

export async function main(env = process.env) {
  const event = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
  const pr = event.pull_request;
  if (env.GITHUB_EVENT_NAME !== "pull_request" || !pr || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPOSITORY || "") || !Number.isInteger(pr.number) || pr.number <= 0 || !/^[a-f0-9]{40}$/.test(pr.head?.sha || "")) throw Error("EVENT_SHAPE");
  const get = async (route) => {
      const response = await fetch(`https://api.github.com${route}`, { method: "GET", redirect: "error", signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${env.GITHUB_TOKEN || ""}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } });
      if (!response.ok) throw Error(`API_${response.status}`);
      return response.json();
  };
  const metadata = await collectMetadata({ get, repo: env.GITHUB_REPOSITORY, number: pr.number, eventPR: pr });
  const result = checkPR({ ...metadata, repo: env.GITHUB_REPOSITORY, policy, teammates });
  const text = formatReport(result);
  console.log(text); // only fixed messages; never PR body, token, exception reasons or URLs
  for (const warning of result.warnings || []) console.log(`::notice::${warning.message}`);
  const fingerprints = ["rules.mjs", "policy.json", "teammates.json"].map((name) => `${name}: ${createHash("sha256").update(fs.readFileSync(new URL(name, import.meta.url))).digest("hex")}`).join("\n");
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `## sop-pr-lint\n\n${text}\n\nHead: ${pr.head.sha}\n\n\`\`\`text\n${fingerprints}\n\`\`\`\n例外须QQ标签核验；此结果不等于正式批准。\n`);
  if (!["passed", "skipped"].includes(result.status)) {
    console.log("::warning::PR送审信息需补齐或需要QQ核验，请查看本步骤摘要。");
    return 1;
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch(() => {
    console.error("检查未完成：请核对PR是否已有新提交、只读API权限和网络，再运行最新事件；不能当作检查通过。");
    process.exitCode = 1;
  });
}
