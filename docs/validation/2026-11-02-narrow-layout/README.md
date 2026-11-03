# Narrow windows: preview, player and every tool (2026-11-02)

VV found that at 804×535, in both languages, the preview was 0×0 and the player
controls sat on the timeline toolbar. The toolbar clipped its overflow, so the
cut-off tools could not be clicked.

## Before (`before/`, this branch's base bcbaa2c, same harness)

| size | preview | player over timeline | tools unreachable |
|---|---|---|---|
| 1270×800 | 243×137 | no | zh-CN: roll, slip, slide; en: slip, slide (covered by Split / Close gap) |
| 804×535 | 0×0 | yes | zh-CN 11, en 9 of 19 (zh-CN includes Snap) |
| 630×452 | 0×0 | yes | zh-CN 13, en 12 of 19 |

At 1270 the toolbar never fitted either: the edit-tool group shrank under
Split and Close gap, so three tools only looked visible.

## Causes

- The media bin and the inspector were fixed at 320 px each: at 804 the
  monitor kept 143 px, and at 630 it kept 1 px. Its header controls wrapped to
  179 px tall, leaving the picture 0 px.
- The top bar wrapped to two rows below 1100 px.
- The timeline's height budget assumed three gaps and no undo/redo row, so the
  upper area fell below its own minimum and the player spilled onto the
  timeline.

## Change

- Below 1100 px the side panels are `clamp(150px, 23vw, 320px)` wide.
- **More menus.** The timeline toolbar, the monitor header, the top bar's
  right-hand group and the bin header move what does not fit into their own
  "更多 / More" menu. The real elements are moved, so their state and
  shortcuts stay. Order of leaving the timeline toolbar:
  - first: Audio hold, Trim, Limit, Markers, Fit, Zoom, Find gap, Close gap,
    Lift, Extract, the edit tools, Delete, Ripple delete, Split;
  - **Snap last**.

  The sequence menu and Export never move. The zoom slider still shrinks
  first.
- Tools keep their width (no item shrinks under its neighbour).
- On a monitor narrower than 540 px the player takes two rows: timecode and
  IN/OUT on top, the buttons below.
- The timeline's room is measured from the actual rows. The upper area keeps
  the monitor header, the player and a 90 px picture (at least 150 px); the
  timeline keeps at least 140 px. It is re-clamped once those rows have
  settled after a resize.
- Narrow side panels scroll their tab strips (wheel moves them sideways; the
  open tab scrolls into view).
- Below 700 px the top bar's spacing tightens so Export stays in reach in
  English.

## After (`desktop/narrow-layout-smoke.cjs`, `after.txt`, `layout.json`)

What the smoke checks:
- Visible window, shown and on top (page captures `*.page.png`; the OS-level
  screenshots were dropped because an unrelated system prompt covered them;
  `*.more.page.png` shows the timeline More menu open).
- Windows 11, 135 % scaling.
- A fresh profile whose path has Chinese and a space.
- Every tool of the timeline toolbar, the monitor header, the top bar and the
  bin header counts as reachable only if it is fully in its bar, hit at its
  centre, overlapping nothing and showing its whole label, or hit at its
  centre in the opened More menu.
- Player buttons are hit at their centre.
- Tabs are scrolled to, then hit.

Result: **LAYOUT_PASS 12 cases**.

| size | language | mode | preview | player over timeline (px²) | tools | tabs | player | in More | Snap |
|---|---|---|---|---|---|---|---|---|---|
| 1270×800 | zh-CN | simple | 298×168 | 0 | 37/37 | 10/10 | yes | 4 | bar |
| 1270×800 | zh-CN | advanced | 298×168 | 0 | 37/37 | 10/10 | yes | 4 | bar |
| 1270×800 | en | simple | 298×168 | 0 | 37/37 | 10/10 | yes | 4 | bar |
| 1270×800 | en | advanced | 298×168 | 0 | 37/37 | 10/10 | yes | 4 | bar |
| 804×535 | zh-CN | simple | 131×73 | 0 | 37/37 | 10/10 | yes | 19 | bar |
| 804×535 | zh-CN | advanced | 131×73 | 0 | 37/37 | 10/10 | yes | 19 | bar |
| 804×535 | en | simple | 131×73 | 0 | 37/37 | 10/10 | yes | 20 | bar |
| 804×535 | en | advanced | 131×73 | 0 | 37/37 | 10/10 | yes | 20 | bar |
| 630×452 | zh-CN | simple | 102×57 | 0 | 37/37 | 10/10 | yes | 28 | bar |
| 630×452 | zh-CN | advanced | 102×57 | 0 | 37/37 | 10/10 | yes | 28 | bar |
| 630×452 | en | simple | 102×57 | 0 | 37/37 | 10/10 | yes | 30 | bar |
| 630×452 | en | advanced | 102×57 | 0 | 37/37 | 10/10 | yes | 30 | bar |

At 1270 four tools are now in More because the bar never fitted:
- zh-CN: Markers, Audio hold, Fit, and the monitor's export-frame menu;
- en: Markers, Audio hold, the export-frame menu and Safe.

Before, roll, slip and slide were covered instead. The 1270 preview grew from
243×137 to 298×168, because the monitor header is one row.

Remaining limits:
- The 630×452 picture is small (102×57).
- Not tested: physical mouse input (hit tests use elementFromPoint), the light
  theme, screen readers, the Color workspace and the Source monitor.
- "提起（留空隙）/ 提取（补上空隙）" is unchanged. Whether to shorten it is
  JJ's decision.
- "更多 / More" is a new `own.more` key for JJ.
