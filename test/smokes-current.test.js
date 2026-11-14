'use strict';
// Deja (2026-11-03): review-body, agent-minimum and agent-paste failed on main. Bisected:
//  - agent-minimum broke at fc93674 (#26: the official Cindy pane replaced the first pane; the smoke still looked for
//    [data-width] / [data-draft] / [data-action=send]);
//  - review-body broke at ce86d17 (#71: every user message ends with the {"references","facts"} JSON the review box shows
//    as its facts note, so its text no longer equals the raw message);
//  - agent-paste was retired on purpose at 138514e (it touched the shared clipboard).
// The software was not broken; the smokes were. These checks keep the smokes pointed at what the page really has.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('agent-minimum uses the official pane’s controls, which exist',()=>{
 const s=read('desktop/agent-minimum-smoke.cjs'),pane=read('agent-ui/pane.tsx');
 for(const gone of ['[data-width]','[data-draft]','[data-action=send]','[data-action=cancel]','[data-status]'])a.ok(!s.includes(gone),gone);
 a.ok(s.includes('[data-cindy-draft]')&&pane.includes('data-cindy-draft'));
 a.ok(s.includes('.cindy-send button')&&pane.includes('className="cindy-send"'));
 a.ok(read('app/index.html').includes('id="mcAssistantClose"'));
});

test('review-body compares each message as the box shows it, and checks that only the trailing JSON is left out',()=>{
 const s=read('desktop/review-body-smoke.cjs');
 a.match(s,/MontClipAgentPane\.displayMessage\(m\.content\)\.text/);
 a.match(s,/onlyEnvelopeHidden:/);a.match(s,/factsNamed:!r\.facts\|\|r\.factsNote/);
 a.ok(!/r\.sections\[i\+1\]\.text\.trim\(\)===m\.content\.trim\(\)/.test(s),'no longer the raw content');
});

test('agent-paste stays retired: it never touches the clipboard and says so',()=>{
 const s=read('desktop/agent-paste-smoke.cjs');
 a.match(s,/MONTCLIP_PASTE_HARNESS_DISABLED/);
 a.ok(!/clipboard\.(write|read)|require\(['"]electron['"]\)/.test(s));
});

// Deja (2026-11-03, on #87): a retired smoke must not look broken. agent-paste exits 0 and says it is skipped, and the
// smoke list says why; it still touches nothing.
test('agent-paste is shown as retired, not red: exit 0, SKIPPED, nothing touched',()=>{
 const {spawnSync}=require('node:child_process');
 const r=spawnSync(process.execPath,[path.join(__dirname,'..','desktop','agent-paste-smoke.cjs')],{encoding:'utf8'});
 a.equal(r.status,0,'exit code 0');
 a.match(r.stdout,/^MONTCLIP_PASTE_HARNESS_DISABLED \(SKIPPED\)/m);
 const s=read('desktop/agent-paste-smoke.cjs');
 a.ok(!/clipboard\.\w|require\(|process\.exitCode\s*=\s*1/.test(s),'no clipboard call, no module, no failure code');
});
test('the smoke list names every desktop smoke; agent-paste as 已停用：会动系统剪贴板',()=>{
 const list=read('desktop/SMOKES.md');
 for(const f of fs.readdirSync(path.join(__dirname,'..','desktop')).filter(f=>f.endsWith('-smoke.cjs')))a.ok(list.includes('`'+f+'`'),f);
 a.match(list,/`agent-paste-smoke\.cjs`[^\n]*已停用：会动系统剪贴板/);
});
// Deja (2026-11-03, on #87): the owner wants what is sent shown before it is sent. The facts are named in one sentence in
// the review box; one click on that sentence opens their exact text.
test('the review box’s facts sentence opens to the facts themselves, one click',()=>{
 const pane=read('agent-ui/pane.tsx');
 a.match(pane,/<details data-facts-note><summary>\{t\.factsTitle\}<\/summary><p data-facts-explain>\{t\.factsExplain\}<\/p><pre data-facts-raw>\{JSON\.stringify\(MontClipAgentPane\.messageFacts\(review\?\.messages\?\.at\(-1\)\?\.content\|\|''\),null,2\)\}<\/pre><\/details>/);
 a.ok(!/<p data-facts-note>/.test(pane));
 a.match(read('app/cindy-official.js'),/data-facts-raw/,'the bundle was rebuilt');
 const s=read('desktop/review-body-smoke.cjs');
 a.match(s,/factsOpen:/);a.match(s,/\[data-facts-note\] summary'\)\.click\(\)/);
 // JJ's explanation shows above the facts once opened (agent-facts-content.test.js has the words)
 a.match(s,/explain:n\.querySelector\('\[data-facts-explain\]'\)/);
});
// found while comparing main and this head: review-body printed REVIEW_FAIL and still exited 0
test('review-body exits 1 when it fails, 0 only when it passes',()=>{
 const s=read('desktop/review-body-smoke.cjs');
 a.ok(!/app\.exit\(0\)/.test(s),'never a fixed 0');
 // app.exit alone left the process at 0 when the page threw (checked against main's page); the exit code is set first
 a.match(s,/process\.exitCode=passed\?0:1;setTimeout\(\(\)=>app\.exit\(passed\?0:1\)/);a.match(s,/passed=ok;/);
});
