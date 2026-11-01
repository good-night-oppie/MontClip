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
