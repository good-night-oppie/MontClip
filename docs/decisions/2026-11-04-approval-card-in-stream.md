# The approval card in the message stream (助手面板 step 3)

Date: 2026-11-04. Asked by the owner (「确认框，能否以Agent出确认卡询问选择的方式在聊天窗口出现，而不是弹窗」), passed on by VV and
Deja; designed in 助手面板改版说明 v7.2 §2 「要你点头的卡」 (screenshot 03-1280-深色-要你点头). Before, #84 / #110 asked with a box over
the page (`dialog[data-agent-approval]`).

## What changed

- No box over the page. When the main process says a step must be asked (`decide` → `ask`, with a ticket), the host puts a card
  in the assistant's message stream: under the AI's reply, or under its plan list. The plan list moved into the stream too
  (it scrolls with the conversation, whole, instead of being squeezed into 40 % of the pane).
- The card (`agent-ui/HostCard.tsx`, MontClip's own) is Cindy's `InteractionPromptCardShell` (the shell of its AskUserQuestionPrompt,
  copied unchanged at 43001ea) with Cindy's `Button`. The outgoing confirm card and the Yolo countdown card are to use the same
  card (later steps); this change only makes it and uses it for approvals.
- What it says: the title (`own.ap-title`), what this step changes in 15 px (`MontClipPlan.stepDetail`, 「保留 0:00–1:55」), the
  capability's plain sentence under it in 12 px, the buttons 〔只批准这次〕 (the only main button) 〔这个聊天中都批准〕 (outlined)
  〔不同意〕 (plain). Only what the streamer must also know is added: where an external step sends to, what it sends (folded),
  and that a step that can't be undone asks every time. The summary and 「改的是项目」 lines of the box are gone: they said the
  first line again, and a card that does not fit the stream hides its own title (seen at 1280×766).
- Answered, the card is one line: 「✓ 你批准了这一次」「✓ 这个聊天中你都批准了」「你没有同意，这一步没有做」.
- While it waits: 「等你点头」 above the input, and nothing can be sent; in a plan its step shows 进行中.
- When it appears it is scrolled into view and 〔只批准这次〕 has the focus (Deja). The box gave the focus to 〔不同意〕; QQ, please
  look at this one. A screen reader hears the card's title and first line once: the card is a group named by them, outside the
  conversation's live log.
- 630×460 and 1280×820: the card is whole and above the input box (`desktop/agent-narrow-smoke.cjs`).
- MontClip's pane rules (`#mcAgentContent p`, `.cindy-port p`, `.mc-assistant p`, `.cindy-port button` and its compact size) no
  longer reach inside a Cindy part (`:where(:not([data-cindy-parts] *))`): they made the card's 15 px line 11 px, put 12 px
  above each line and gave its buttons MontClip's face.
- While a card waits, the 〔查看剪辑建议〕 and reference rows step aside (nothing can be sent or quoted then), and the buttons are
  Cindy's small size with less padding, so the card (157 px) fits the stream whole and its three buttons stay on one row in the
  338 px pane at 1280 wide (it was cut off at 1280×766, and 〔不同意〕 wrapped).

## What stays (for QQ: the safety rules, locked in `test/approval-card.test.js`)

- The host draws the card. `agent-approval.js` makes one only from a decision with a ticket from the main process
  (`agent-policy-host.js`); the pane draws cards from the host's `getApprovals` only. A reply's words are plain text in the
  stream (ThinkingText, no HTML): a reply written as a card (HTML, Markdown) shows as text, with no card and no button
  (`agent-modes-smoke.cjs`).
- A button answers only its own waiting card, once, with a choice the main process offered (anything else counts as 不同意); the
  host sends that answer to the main process with the card's ticket, which answers once (`TICKET_UNKNOWN` the second time).
- The AI's step waits for the answer: the edit is only made after the main process says run.
- One card waits at a time. Leaving the chat (new chat, another chat), the project changing under it, or a newer card: 不同意.
- New: the editor stays usable while a card waits (the box was modal). The step's own check against the project (the CAS) after
  the answer is what keeps a changed project from being edited, as before.

## Not done here

- 「↓ 回到最新」 is not in the pane yet; when it comes (the message stream step) it hides while a card waits
  (`options.approvalPending`).
- v7.2's second line also shows the tool's name (e.g. `patch_project`). The card shows the capability's plain sentence only, as
  the box did (QQ 4: never an internal name). Ledger row P4f.
- New words for JJ: 「等你点头」 / Waiting for your answer, and the three answered lines in both languages.
