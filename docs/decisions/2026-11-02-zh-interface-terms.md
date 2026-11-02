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
| SPEC §B (整句 / 标签对照) | 276 | used as written; `term.<slug of the English>`; the SPEC's 282 rows give 281 keys because `None` / `none` are one key |
| SPEC §B, rewritten by SPEC §A | 4 | §B and §A disagree; §A (core terms) wins: `term.effects` 效果→**特效** (§A Effects: 不用「效果」); `term.transform` 变换→**画面** (§A Transform: 面板级用「画面」); `term.new-folder-new-composition` 新建合成→**新建复合片段** and `term.comp-clip-bin-comp` 素材库合成→**素材库复合片段** (§A Composition: 不用「合成」) |
| SPEC §B row "(旧窗口标题) Video Editor" | 1 | stored as `term.window-title` "MontClip · Video Editor" / "MontClip · 视频剪辑" |
| SPEC §A (核心术语) | — | used as the rule for the 4 rewrites above; §A words are not separate keys |
| MontClip's own wording (§C left it to the implementation) | 15 | `own.*` in `ui-preferences.js`: bin buttons (+ 标题 / + 调节层 / + 导入 / + 网址, built from §A/§B words), `own.fit` 适配, `own.inspector-empty` (§B rows "Select a clip to edit its" + "transform, effects & audio." joined into one sentence), export progress (`own.exporting-pct`, `own.rendering-pct`, `own.encoding`, `own.encoding-pct`, `own.mixing-audio`, `own.finishing`), `own.needs-server` (menu note) |

Kept from the SPEC although debatable, for JJ to decide: `Lift` 抽取 /
`Extract` 剔除; `Precompose` 预合成 (a verb, so §A's "不用「合成」" was not
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
- Still English in the zh-CN window: "Full canvas", "All media" and other
  options `app.js` builds, the empty-bin hint (it contains markup), the
  connection status next to the project name.
