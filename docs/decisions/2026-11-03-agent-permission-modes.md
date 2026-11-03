# The AI's permission modes (P4, first half)

Date: 2026-11-03. Spec: Deja's architecture draft (sha256 cccbc16f…), sections 「AI 的权限模式」 and
「权限模式：QQ 安全审查后的修订」 (items 1–11 take precedence). The plan list is the second half (a separate PR on top of this one).

## What is decided where

- `agent-policy.js` (pure): mode × the capability's risk from `capabilities.js` → run / ask / list / refuse.
- `desktop/agent-policy-host.js` (main process): the mode, the approvals and each chat's external total, **in memory**. A restart
  is back to 手动 with nothing approved. The page asks through four fixed IPC channels (`montclip:policy:get|setMode|decide|answer`)
  behind the usual sender / frame / origin guard.
- Yolo only after the streamer's yes in the main process's own message box (Cancel is the default). The page cannot answer it.
- The page shows the switch (top of the assistant), the Yolo mark (in the pane and in the top bar, the whole time Yolo is on) and
  the host's approval box. The box shows `Capabilities.label` (the plain sentence), never an internal name.

| mode | read | undoable | sensitive | external |
|---|---|---|---|---|
| 计划 | run | list only | list only | list only |
| 手动 (default) | whitelist runs, else ask | ask until 「都批准」 | ask every time | ask until 「都批准」 |
| 自动 | run | run (one undo step, CAS) | ask until 「都批准」 | ask until 「都批准」 |
| Yolo | run | run | run | run if the switch is on and the domain allowlisted |

- Blacklist (`Capabilities.BLOCKED`, incl. overwriting an existing file) and every name not in the table: refused in every mode.
- External always shows what is sent and where; 「都批准」 spares the click only (owner, 2026-11-03).
- External caps, every mode including Yolo, **per capability** in `capabilities.js` (fixed in the main process with the
  risk levels; Deja, 2026-11-03): text sends (`assistant_request`, `song_lookup`, and `fablecut_import_media`, which sends
  only an address) 128 KiB a send and 4 MiB a chat; audio (`cloud_transcribe`, the field only, not wired) 25 MiB a part and
  2 GiB a project while it is open. The main process keeps a total per scope and per capability. Over a cap the send is
  refused and the streamer is told by how much (「超了 …」); it is never cut down and sent anyway. `assistant_request` and
  `song_lookup` are in the table now; the chat send itself is not routed through the policy yet (it keeps its review box
  and its 131072-character payload check), and the song lookup is P6b.
- 「这个聊天中都批准」 = same chat (session id) + same capability + same normalized target (https origin without path, or the
  project id). A new chat, another target or another capability asks again.
- The approval comes only from the box's answer to a ticket the main process issued. Nothing in a reply, a danmaku or a
  caption is read for it: `decide` reads only its own keys.

## What it applies to now

The assistant's replies that are a usable `keep_sentences` / `keep_ranges` proposal. 计划: a note, nothing done. 手动: the box;
「只批准这次」 / 「都批准」 apply at once (one undo step, 〔撤销〕). 自动 / Yolo: applied at once. Applying is refused when the
project or its revision changed since the reply (CAS). `keep_ranges` with `per_range` adds exports, so it always opens the
existing dialog for the streamer's own 〔应用〕. 〔查看剪辑建议〕 stays as before.

Not covered here: the chat send itself is the streamer's own action and keeps its review box in every mode (stricter than the
table). No AI step sends anything out yet, so the external rules are tested in the policy and the main process only. Export
through the system save dialog only is for the export step (later); overwriting is blacklisted already.

## Decided by Deja (2026-11-03)

- 手动 × sensitive / can't be undone (export, delete): asked every time, 〔只批准这次〕〔不同意〕 only. External is not in this
  group: three choices in every mode, and 「都批准」 only spares the click — the content is shown every time. Undoable steps
  in 手动: asked the first time, three choices.
- The caps: per capability, as above.

- No 〔先看看〕 in the box (Deja, 2026-11-03): the three buttons are the owner's own words; an undoable step can be undone,
  and an external one already shows what it sends in the box.
