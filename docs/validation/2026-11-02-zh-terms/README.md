# zh-CN / en interface terms — visible-window check

`desktop/zh-terms-smoke.cjs`, run with an existing Electron 45.2.1 and a fresh temporary
profile: visible window at 1270×800 and 804×535, the existing language preference switched
to zh-CN and to en (no input events, no clipboard). `*.screen.png` = OS screenshot of the
window, `*.page.png` = capturePage. `run.txt` per size and language: html lang, saved
preference, keyed labels, the project name (user content, unchanged in both languages),
marked elements on the live page, page overflow, and timeline-toolbar items cut off at
the right edge.

- 1270×800: nothing cut off in either language (the zoom slider now shrinks first).
- 804×535: the toolbar was already cut off in English before this change (Markers,
  Audio hold, zoom, Fit); in zh-CN the Snap group is cut off as well. Not fixed here.
