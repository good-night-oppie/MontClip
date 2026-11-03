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
 a.ok(read('index.html').includes('id="mcAssistantClose"'));
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
