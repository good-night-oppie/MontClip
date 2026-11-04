# ADR 2026-11-02: user-visible product name is MontClip

> 部分被 [2026-11-04-rename-internal-globals.md](2026-11-04-rename-internal-globals.md) 取代（内部全局对象 `FableCutXxx` 已改名 `MontClipXxx`；其余「保留的内部标识符」仍有效）。

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

- The rest of the docs site (`docs/docs/`, showcase, sponsors, translated
  READMEs in `docs/i18n/`) still says FableCut.
- **Docs site header and footer (Deja, 2026-11-02).** Every `docs/docs/` page
  still shows "FableCut" as the brand in its header and footer (with
  `aria-label="FableCut home"`), and still points at upstream's hosted
  services: the Studio link (`studio.fablecut.space`), the Status link
  (`status.fablecut.space`), and the `SITE` constant behind canonical and
  og addresses (`fablecut.space`). The Studio docs page itself describes
  upstream's hosted Studio. Left for the docs-site rework, all together.

## Community page removed (Deja, 2026-11-02, JJ's option a)

`docs/community/` was upstream's page wholesale (FableCut name, Discord,
`hello@fablecut.space`, press quotes). It is deleted, with every way to it:
the Community entry in the `docs/docs/` header (generator and the generated
pages; the home pages had none), and its `docs/sitemap.xml` entry. The
upstream support channels went with it: the Discord icon in the header, the
Discord and Email links in the footer, the Discord icon in
`docs/docs/icons.svg`, and the "ask on the FableCut Discord or email
support@fablecut.space" sentence in `docs/docs/studio.md`.
`test/brand.test.js` checks that the page is gone, that no page under
`docs/` (and not the generator or sitemap) links to it, and that no public
page under `docs/` (the playground included, `docs/validation/` excluded)
shows a fablecut.space email address or mentions Discord.
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

## Not published to npm or the MCP registry (QQ option A, Deja 2026-11-02)

Publishing to npm needs the owner's authorization, which has not been given.
Until it is, MontClip is published nowhere:

- `package.json` is `"private": true` (npm refuses to publish it), keeps the
  name `montclip`, and has no `mcpName`. Its `repository` points to
  `good-night-oppie/MontClip`, and so do the bundle (`manifest.json`
  repository, documentation) and the Claude Code plugin (`plugin.json`
  repository, homepage).
- `server.json` (the MCP registry manifest) is deleted. It named
  `io.github.ronak-create/fablecut` and the upstream's MCPB bundle.
  `release-check` now checks the opposite: the package is private, has no
  `mcpName`, and there is no `server.json`.
- CI packs and installs the package as `montclip` to check what it ships. The
  `npm publish --dry-run` step is removed.
- No install command anywhere a person reads: `npx -y fablecut` installs the
  upstream package. README, `DEVELOPMENT.md`, `CLAUDE.md` (and the docs built
  from it), the `fablecut` CLI help, `mcp-server.js`'s header and `llms.txt`
  now register the MCP server from a clone (`node <path>/mcp-server.js`). The
  upstream plugin-marketplace and MCPB instructions are removed.
  `CHANGELOG.md` keeps its history as written.
- `docs/docs/build.js` read its icon sprite from the home page, which now
  holds only JJ's copy; the sprite moved to `docs/docs/icons.svg`.

To publish later, the owner first registers the npm name `montclip` and the
MCP registry name `io.github.good-night-oppie/montclip`. Then, together and
in one change: `private` comes off, `mcpName` and a new `server.json` name
those registrations, the MCPB bundle is built from our own release,
`release-check` checks the registry metadata again, CI rehearses the publish,
and the install instructions come back.
