# Timeline reveal after a drop / after a resize (VV real-window findings on PR #27)

Runner: `node desktop/run-drop-reveal.cjs <electron.exe> <synthetic.mp4> <label>` —
visible always-on-top window, fresh temporary profile, the task's synthetic MP4
(SHA-256 `1c4e4a41…0789`, mono, so A2 starts empty) plus a synthetic caption on V3.
Pointer input is `webContents.sendInputEvent` at real window coordinates (no OS
input, no clipboard). `*.screen.png` = OS screenshot of the window client area,
`*.page.png` = `capturePage`.

- `red/` — app.js of e9e0c07: advanced mode 804×535, A2 scrolled fully into view,
  A1 audio dragged onto empty A2 → the timeline re-focused (scrollTop 153 → 116)
  and the dropped clip was 6.6 % visible.
- `green/` — this branch:
  - drop onto A2 at 804×535 and 630×452: scrollTop unchanged, dropped clip 100 % visible;
  - simple mode narrowed from 1270×800 to 804×535 and to 630×452: V1 100 %, A1 99.1 % visible
    (re-focused once, 150 ms after the last resize event);
  - window resized mid-drag: no re-focus while the pointer is down (scrollTop stays at the
    user's 33.3); after release the dropped rows are kept visible.
