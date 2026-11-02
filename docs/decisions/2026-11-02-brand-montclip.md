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
- The download entry still links the upstream release assets; MontClip has no
  release of its own yet.
- Code comments are not user-visible and were left alone.
