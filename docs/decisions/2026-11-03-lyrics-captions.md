# Correct captions from the lyrics, on this computer (P6a)

Date: 2026-11-03. Spec: ADR 本机能力边界 (Deja's documents, sha256 7271fd01…), 补记「用歌词校准听写字幕」. P6b (the lyrics
coming back with the song name from the AI service) waits for QQ's review of what is sent; this part sends nothing.

- `lyrics-align.js` (pure): the transcript's words in the song's part and the pasted lyrics are aligned character by
  character (letters and digits; case and width folded) by edit distance. On a tie, lyric lines nobody sang stay unheard
  rather than taking the last heard characters as wrong ones.
- The times stay the transcript's: each lyric character takes the time of the transcript character it is aligned with
  (a word's time shared evenly among its characters). Only wrong characters change. One lyric line is one caption.
- Heard characters with no lyric counterpart (talking between lines) go with the line before.
- A line's score is the characters that match over the longer of the line and what was heard for it. Under 0.5, or with
  nothing heard under it, the line is 「可能不对」: not ticked. A line with nothing heard can't be placed at all.
- In the editor: 〔按歌词校准字幕〕 in the Transcript tab's caption row. The part is the selected captions, else IN–OUT.
  Paste → 〔对齐〕 → each line as heard and as it becomes, ticked or not. Nothing changes before 〔应用勾选的〕 /
  〔全部应用（可能不对的除外）〕. Then the part's captions are replaced in one undo step: ticked lines as the lyrics,
  the others as heard, one caption per lyric line; the captions' size and place stay; 〔撤销〕 in the toast.
- Applying is refused when the project changed after the window opened (CAS).
- At most 3000 characters on each side and 300 lines at a time ("narrow it down to one song").
- Not yet: the song card's 〔按歌词校准字幕〕 in 自动出切片 (shown before anything is on the timeline) stays as it was;
  registering the step in the capability table comes with the AI path (P6b).

## Only the picked captions change (QQ's request-changes on #85; Deja, 2026-11-03)

The captions picked are the ones changed; the ones not picked do not change by a single character.

- The part is the picked captions themselves, not the span from the first to the last: with A and C picked and B between
  them not, B's words are not aligned. With nothing picked, the part is every unlocked caption whose middle is in
  IN–OUT (a locked one is left out, like one not picked). The words are the transcript's whose middle is inside one of
  those captions (`MontClipLyrics.scope`).
- Every new caption lies inside one picked caption (`MontClipLyrics.plan`). A lyric line placed anywhere else — across two
  captions, outside them, or with nothing heard between lines that went to two different captions (B's line in the
  example) — is not made, and the window says so under the comparison: 「有 {n} 行歌词对应的是你没选的字幕，没改」.
- Not in Deja's list, decided here (for QQ): a picked caption that such a dropped line reaches into is left as it was,
  with the lines inside it (「有 {n} 条选中的字幕没改：里面有歌词行跨出了这条字幕」), so no heard word disappears.
- 〔应用〕 removes only the picked captions that get new ones; each new caption takes the track, style, size and place of
  the one it replaces. The removed ids leave the selection (and the primary). One undo step; undone, every caption is
  as it was.
- 「可能不对」 lines stay unticked, as before.
- Both sentences are new and wait for JJ.
