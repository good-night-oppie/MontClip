# ADR 2026-11-02: user-visible product name is MontClip

Status: proposed (QQ review).

## Decision

Everywhere a person reads the product name, it is **MontClip**. MontClip is
based on [ronak-create/FableCut](https://github.com/ronak-create/FableCut) (MIT);
the README says so in one line, and `LICENSE` keeps the original copyright
notice unchanged, as MIT requires.

Changed in this step:

- `README.md`: title, tagline and intro say MontClip; the attribution line
  「基于 ronak-create/FableCut（MIT）」. The upstream banner image, badges
  (Hacker News, DEV, MCP registry, Glama, Discord) and the upstream demo video
  were removed from the header: they describe the upstream project, not this
  one. Clone instructions point to good-night-oppie/MontClip; the upstream MCP
  registry entry and Discord are named as the upstream's.
- `package.json`: `name` montclip, description, homepage (the MontClip
  repository). `server.json`: the npm package identifier follows the package
  name (release-check requires it).
- `manifest.json`: `name` montclip, `display_name` MontClip, long description,
  homepage.
- `app.js`: "Needs the MontClip server" menu notes and `[MontClip]` console
  prefixes. `server.js`: "MontClip running →". `mcp-server.js`: the product
  name inside MCP tool descriptions.
- Docs site: the home page (`docs/index.html`) and the download entry
  (`docs/start/index.html`) name MontClip. A third-party quote about the
  upstream project (`<blockquote>`) stays as it was said.

## Kept on purpose (internal identifiers)

Renaming these would break existing settings, projects and integrations:

- settings / localStorage keys `fablecut-*`;
- global objects `FableCutXxx` (`FableCutCaptions`, `FableCutFx`, …);
- HTTP headers `X-FableCut-*`;
- MCP tool names `fablecut_*` and the MCP `serverInfo` name `fablecut`;
- the `fablecut` command (`package.json` `bin`) and the `~/FableCut` data
  folder an npm install uses (`paths.js`);
- the upstream MCP registry name `io.github.ronak-create/fablecut`
  (`server.json` `name`, `package.json` `mcpName`) and the MCPB download URL,
  which belong to the upstream project.

If these are ever renamed, that needs its own migration plan (read old keys and
folders, write new ones, keep aliases for a release).

## Test

`test/brand.test.js` scans the README, package and bundle metadata, the
editor page, every string literal in `app.js`, `server.js`, `cli.js` and
`mcp-server.js`, and the docs home and download pages for the word
"FableCut". Allowed: links to `ronak-create/FableCut`, the `~/FableCut`
path, `X-FableCut-*` headers, `FableCutXxx` identifiers, and the README's
attribution line. Written first; it failed 4/4 before the change.

## Later work

- The rest of the docs site (`docs/docs/`, showcase, community, sponsors,
  translated READMEs in `docs/i18n/`) still says FableCut.
- `CLAUDE.md` (also returned by the `fablecut_docs` MCP tool) still says
  FableCut.
- Code comments are not user-visible and were left alone.

## Public copy (JJ, 2026-11-02)

The README, `docs/i18n/README.zh-CN.md`, the docs home and the docs/start page
now carry only JJ's copy (`test/fixtures/montclip-public-copy-v1.md`, sha256
`3ec69dbf…`), parsed rather than retyped (`test/public-copy-source.js`).
`test/public-copy.test.js` checks it word for word, that the pages carry no
other text, and that the banned words appear in neither language.

Implementation choices (not in the copy, for JJ to check):

- Chinese pages at the site root, English under `docs/en/`; each links the
  other ("English" / "简体中文"). The README carries one language link.
- `{upstream-docs}` = `https://github.com/ronak-create/FableCut` (Deja).
- Rule 7: PR #26 is not on this branch (`desktop/agent-service.js` absent),
  so the AI assistant is the last "Planned" item in the README and on the home
  page. The start page leaves out its "About the AI assistant" section until
  then. The test switches both automatically when #26 lands.
- The README's developer sections (Quick start, agents, layout, architecture,
  notes) moved to `DEVELOPMENT.md` unchanged.
- No download button and no release link (rule 5).

## Outbound connections (audit at this branch, base main bc771db)

"Desktop" is the Electron host in `desktop/`. Its window session cancels
every request that is not to its own local server, `blob:` or `data:`
(`webRequest.onBeforeRequest`), and its CSP allows only `'self'`.
"Developer mode" is `node server.js` opened in an ordinary browser, which is
how MontClip runs today.

| Connection | Started by | Goes to | Desktop | Developer mode |
|---|---|---|---|---|
| Import from URL | the user pastes a link (`/api/import-url`, also the MCP `fablecut_import_media`) | the HTTPS address given; private and loopback addresses refused | server makes the request: **works** | works |
| AI assistant (PR #26) | the user, after reviewing the exact text | the provider the user chose (OpenAI / DeepSeek / OpenRouter), from the desktop main process | not on main yet | n/a |
| Web fonts | a title uses a font that is neither a system font nor in `library/fonts` (`ensureFont`, app.js) | `fonts.googleapis.com`, `fonts.gstatic.com` | blocked | **automatic, no prompt** |
| AI background removal | the user turns on `bgRemove` | `cdn.jsdelivr.net` (MediaPipe) | blocked (the feature fails) | works |
| Transcription | the user clicks Transcribe | `cdn.jsdelivr.net` (transformers.js), Hugging Face (Whisper model) | blocked (the feature fails) | works |
| Spellchecker dictionaries | Electron default (`spellcheck` not turned off) | Google dictionary host | Windows uses the system spellchecker; Linux not checked | n/a |

The first two were approved by Deja. The other four are reported to Deja and
are not changed by this PR.
