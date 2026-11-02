# Agent workbench layout and state decisions

2026-11-01 requester decisions override VV layout draft where conflicting. VV document read including middle sections; public main is bc771db, not pre-merge170b844. This ADR does not approve an implemented UI.

1. Group permissions by read media / edit timeline / write files, but actual availability and execution allowlist remain per-tool. No enabled unconnected tools or default action approval.
2. One right-side page region. Assistant replaces its content and can expand; existing properties/mixer/color/transcript tabs remain accessible. Never two adjacent right rails. Current PR16 body-side pane is provisional and requires replacement.
3. At804, overlay may cover only left pane;630 may stack vertically. Decide by actual usable viewport/aspect ratio and coordinate hits for preview/play/export/undo/hide and chat actions. Collapse left pane if needed; no35%,360px or mandatory1100 docking acceptance shortcut.
4. No clear-session action in first delivery. Session persistence still required.
5. Workspace preference uses independent versioned desktop schema and explicit legacy migration, not arbitrary keys added to the original exact two-key view API.

A. Default project indicator identifies local target only. Explicit caption, danmaku and range classes stay distinct. Preview/confirm complete actual outbound payload including history. Project switches never silently rewrite a draft reference. No implicit project/subtitle/danmaku upload.
B. No Fast/remote-call/subscription-inheritance switches in first delivery.
C. Save failure preserves edits, reports unconfirmed/retry; never restore an older snapshot over concurrent edits or an unknown committed result. Rollback only within a proven safe transaction. Apply operation ID is idempotent with result readback.
D. Stop ends future generation, not completed writes. Preserve late write receipts; unknown outcomes stay pending verification and are read back, including after reopen.
E. Escape handles actual topmost layer (export modal first if topmost), restores its trigger focus. Nonmodal assistant cannot trap Tab away from editing. Current generic dialog-only keyboard handling remains incomplete pending integrated layer implementation.
F. Preview usability and reachable controls outrank nominal dimensions; measure actual content region and aspect ratio.
G. Empty state advertises connected capabilities only; no unimplemented danmaku-highlight claim.
H. Color to simple exits UI through existing setWorkspace(edit), preserving project/undo. Nested editing/export may block mode switch with explanation; assistant state persists. Other full simple-mode transitions remain pending.

2026-11-01 priority correction: JJ candidate copy was read but not integrated as a new feature batch. The next delta fixes PR16 layout blockers and anonymous-default identity adoption on top of PR19. Main verified pjLoad identity binding explicitly adopts the same generation/sequence's anonymous sessions only while the captured document snapshot still matches. No generic null→any-id auto-rebinding; old references are not rewritten. The single right-side page region retains existing side tabs; small layouts expose the media bin through a toolbar toggle. Timeline spans the workbench. Broader simple-mode design and full locale migration remain pending. Desktop session-save failures still use existing close-controller default keep-open and explicit force-close decision, not an endless non-dismissible lock.

## VV v2 source alignment — 2026-11-01

Read the complete same-path VV layout specification v2. SHA256: 0d74505ab45d61be0c3e2a3a27187c2024f671fbf803494422948b32e59b5dcf (matches reported prefix). It supersedes v1 text, not the requester overrides above. No foreign implementation was read.

“Change to current project” is a local target operation only: it must not rewrite existing reference project/sequence/revision/source IDs or historical messages. Foreign references require explicit removal/reselection before a request for another project. Current public pane has no such target-change action or provider transport; context switching uses separate scopes, and identify migrates session ownership without rewriting reference objects. This is not an implemented outbound approval protocol.

V2 §2.5 still mentions a fixed no-video/audio/account disclosure and a prior danmaku-only agreement. Apply the requester correction instead: build disclosures from the actual approved payload including full history, distinguish subtitle/danmaku/range data, and never claim arbitrary user text cannot contain an account or path. Unconnected capabilities are not advertised.

PR20 numeric preview checks are regression bounds, not usability approval or the v1 360px/35% requirements. VV must inspect readability and actual coordinate behavior. V2 remaining gaps include drag handle, pane-open/scroll persistence, narrow session selector, full simple-mode transitions, compositionend-followed-by-Enter handling, actual top-layer focus restoration and wide-docked Esc behavior. Existing generic Esc hides the pane at all widths; do not claim v2 compliance. Scope-specific PR16 foundation, PR18 workspace persistence, PR19 session persistence, PR20 layout/default identity and PR21 capacity fixes remain separately reviewable; no existing approval extends to these pending behaviors.

No new model/tool/remote connection feature or automatic rollback is introduced by this alignment. Real service, payload approval, proposal apply/readback and late write receipts remain pending.

JJ v1.1 read in full; SHA256 9d27088ef4eb7713bf6a333fe75bda9df3bcb5ea8686cc0007bf863c6ecfd793. Adopt only six currently meaningful keys in the shared locale: agent.state.disconnected.brief, agent.state.sendFailedNoProvider.brief, agent.input.newSession, agent.input.send, agent.ref.remove, agent.settings.models.title. Empty message text no longer repeats connection status; one status region changes after the real UNCONFIGURED result. No connected/streaming/proposal/permission/excluded or credential promises are rendered. Do not offer a Connect action until a real setup path exists. Read permission will require an explicit project/media scope, never whole-disk permission. Future disclosures must reflect all actual tool data and full history, including earlier references; deleting a current chip does not remove history. Candidate stopped/failed wording claiming unchanged clips and discarded late results remains unsuitable for completed/unknown write receipts and is not adopted.

Validation of this small locale/handler delta: mounted regression red 9 pass/1 fail, then node --test test/agent-pane.test.js test/agent-session-storage.test.js 21/21. New test verifies status chosen from actual unconfigured result, no message fabricated, retained draft and live language switch. No new full-suite or Electron run; not a same-head JJ approval. Keep current published review heads unchanged; this delta awaits integration with the next approved workbench batch.
