# ADR 2026-11-02: Chinese interface terms from Rea's SPEC-i18n-terms v1

Status: proposed (PR for QQ code review, JJ copy review, VV real-window review).

## Decision

The editor's Chinese interface uses the terms in Rea's
`handoff/i18n-terms/SPEC-i18n-terms.md` (v1, 2026-11-01, 15434 bytes,
SHA-256 `16c23a77ac7bd4a7bf7173f82347e143e267cd2d7b713473554ca520bde6882d`),
wired into the existing `ui-preferences.js` text system:

- `ui-terms.js` holds the terms as keyed rows `key: [en, zh-CN, source, note]`.
- `MontClipView.t(language, key, vars)` looks a key up; missing in zh-CN falls
  back to English, an unknown key gives `""` (a key is never shown).
- `MontClipView.applyI18n(root, language)` rewrites only elements that carry
  `data-i18n`, `data-i18n-title`, `data-i18n-placeholder` or
  `data-i18n-aria-label` or `data-i18n-tail` (an icon button's trailing label
  text; its icon stays). There is no page-wide text-node replacement.
- `app.js` builds dynamic text with `uiText(key, vars)`.
- The language is the existing `MontClipView` preference: zh-CN by default,
  en switchable from the existing `#mcLanguage` control, saved by the desktop
  main process (`view-settings.json`) and in browser mode by the existing
  fallback. No second switch and no new storage key.
- The product name is MontClip in every user-visible string.
- User content (project name, media names, clip names, captions) is never
  passed through the table; the elements that show it carry no marker.

## Where each term comes from

| Source | Rows | What |
|---|---|---|
| SPEC §B (整句 / 标签对照) | 264 | used as written; `term.<slug of the English>`; the SPEC's 282 rows give 281 keys because `None` / `none` are one key |
| SPEC §B, rewritten by SPEC §A | 4 | §B and §A disagree; §A (core terms) wins: `term.effects` 效果→**特效** (§A Effects: 不用「效果」); `term.transform` 变换→**画面** (§A Transform: 面板级用「画面」); `term.new-folder-new-composition` 新建合成→**新建复合片段** and `term.comp-clip-bin-comp` 素材库合成→**素材库复合片段** (§A Composition: 不用「合成」) |
| SPEC §B row "(旧窗口标题) Video Editor" | 1 | stored as `term.window-title` "MontClip · Video Editor" / "MontClip · 视频剪辑" |
| SPEC §B row, changed after JJ copy review (2026-11-02) | 12 | source `own` in `ui-terms.js`: `term.color` 调节→**调色** and `term.color-workspace` →**调色工作区** (「调节」was used for three things; 「调节层」 stays); `term.lift` 抽取→**提起（留空隙）**, `term.extract` 剔除→**提取（补上空隙）** (their titles `own.lift-title` / `own.extract-title` say whether the gap stays); `term.close-gap` / `term.close-gap-at-playhead-g` 关闭→**合拢**; `term.shapes-and-transforms` →形状与**画面**; `term.preferences-are-stored-in-this-browser-only` →这些偏好只保存在**这台电脑上**; `term.large-tracks` →**较高**轨道; `term.main` →**主序列**; `term.click-a-word` →**点击文稿中的文字** (Chinese has sentence-level timing only, so no word-level promise); `term.scrub-source-drag-to-seek` →**拖动以定位源画面** (the repeated half removed) |
| SPEC §A (核心术语) | — | used as the rule for the 4 rewrites above; §A words are not separate keys |
| MontClip's own wording (§C left it to the implementation) | 18 | `own.*` in `ui-preferences.js`: bin buttons (+ 标题 / + 调节层 / + 导入 / + 网址, built from §A/§B words), `own.fit` 适配, `own.or-click` 或点击, `own.lift-title` / `own.extract-title`, `own.inspector-empty` (§B rows "Select a clip to edit its" + "transform, effects & audio." joined into one sentence), export progress (`own.exporting-pct`, `own.rendering-pct`, `own.encoding`, `own.encoding-pct`, `own.mixing-audio`, `own.finishing`), `own.needs-server` (menu note) |

Kept from the SPEC: `Precompose` 预合成 (a verb, so §A's "不用「合成」" was not
applied); `Program` 播放器; `Preferences are stored in this browser only.`
(accurate for the browser build; the desktop build stores view settings in the
main process).

The full list of new strings (key, English, Chinese, source) is
`docs/i18n/2026-11-02-zh-terms-review.md`.

## Isolation

- The only input from the reverse-engineering side was the SPEC file above,
  read once from Rea's `handoff/i18n-terms/` folder after checking its
  SHA-256. It contains only user-visible terms, no source code and no
  decompiled material.
- I did not open, fetch, diff or copy Rea's `feat/i18n-en-zh` branch or any
  other reverse-engineering material. This branch starts from `origin/main`
  (`bc771db`), and every change in it was written here.
- The table was converted from the SPEC's markdown tables by a throwaway
  script outside the repository; the generated `ui-terms.js` is reviewed as
  source.

## Coverage and limits

- Covered: 220 static labels, titles, placeholders, aria-labels and icon-button
  label texts (`data-i18n-tail`) in `index.html`, context-menu items that match SPEC rows, the armed
  delete/restore buttons, the export progress title, and the menu notes.
- Not covered yet: most strings that `app.js` builds at run time (toasts,
  inspector sections, dialogs, the export dialog's dynamic parts, the
  projects dashboard). These are not in the SPEC (§C); each needs its own
  key and wording, in later small steps.
- Language switch re-applies the markers at once; panels that `app.js`
  rebuilds pick up keyed text the next time they render.
- Native dialogs and the desktop menu are not part of this change.
- A new project's default name "Untitled Project" is stored in the project
  document, so it is user content and stays as stored; translating the default
  for new projects is a separate change.
- `term.filter-e-g-marker-trim-mask` keeps the English examples
  (筛选 — 例如 marker、trim、mask): the shortcut rows it filters are still
  English, so Chinese keywords would find nothing yet.
- Later batches (still English in the zh-CN window), one by one:
  - `connected` / `offline` status next to the project name (`app.js`, set
    with the project name, which itself stays as written);
  - `Full canvas` and the other export-frame options (`app.js`, built from a
    constant list);
  - `All media`, `★ Favorites`, `Used in the edit`, `Unused` and the other bin
    filter options (`app.js`, built at run time);
  - `Double-click to open in Source, or drag onto the timeline.` (bin hint);
  - the second column of the keyboard-shortcut table.
- Wired in this round: the empty-bin hint's first line
  (`term.drop-video-audio-or-images-here`) and `or click + Import / + URL`
  (`own.or-click`, `own.add-import`, `own.add-url`).
