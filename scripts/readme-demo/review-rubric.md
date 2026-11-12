# Review rubric for the README demo films

Give this file, the rendered MP4 and the current `README.md` to a reviewer who did not make the film
(a person, or a separate AI session). The reviewer watches the film, then answers every item below with
**pass / fail + the timestamp and one sentence of evidence**. Fix every fail, render again, review again.
The film is not ready until two rounds are done and nothing in sections A or B fails. Put both rounds'
answers in the PR description.

## A. Truth (any fail blocks the film)

1. **No fake interface.** Every software surface on screen is either a frame MontClip actually exported in
   this run, an image MontClip returned in this run (contact sheet, frame), or a line MontClip actually
   returned over MCP in this run (`run-lines.py` writes them; nothing is typed by hand). Shapes, arrows,
   highlight boxes and captions drawn by the page are allowed only as annotations *around* those, never as
   a stand-in for MontClip's own window, buttons or timeline.
2. **Only what works today.** Every step the film shows is listed under "What it can do today" in the
   current `README.md` (when this rubric was written: import a local recording, export MP4). Anything under
   "Planned" (choosing lines by sentence, SRT export, the optional AI assistant, …) does not appear, not even
   as a teaser. A step the film shows that the README does not list at all (for example crop / zoom / cover)
   is a fail until the README lists it or the step is cut.
3. **Synthetic is labelled.** The live room is synthetic and the film says so on screen for its whole length,
   in Chinese and English.
4. **No private data.** No real person, real nickname, local path, URL, IP address or account name is
   visible in any frame.

## B. Fit for the README

5. **Text stays inside the frame** at 1280×720 and when the film is shown 390 px wide on a phone: no word is
   cut off at an edge.
6. **Readable on a phone.** At 390 px wide, the shortest on-screen text the viewer needs (labels, the final
   line) can still be read; anything smaller is decoration only.
7. **The first two seconds explain the product**: a recording goes in, a shorter, cropped clip comes out.
8. **The last frame says what to do next** and matches the README wording (JJ decides the words).

## C. Craft

9. Each shot holds long enough to read its one line of text.
10. Motion is smooth: no dropped or doubled frames at the shot changes (step through ±3 frames around each).
11. Colours and type are consistent from start to end.
12. The film is no longer than it needs to be: name one second that could be cut, or say none.

## Record

- Film: file name, sha256, duration, resolution, fps
- Commit the film was built from
- Round 1 answers, what was changed, round 2 answers
