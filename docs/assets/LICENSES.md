# Sources and licenses for docs/assets

Everything in this folder is synthetic: no real stream recordings, chat (danmaku), viewer or
streamer names, and no credentials. The demo scripts draw a synthetic live room with a placeholder
streamer and placeholder viewer names (观众A/B/C). Nothing here is referenced from the README yet; the
diagrams are not meant for the README.

| Files | How they were made |
|---|---|
| `diagrams/symbolic-perception-arch-{dark,light}.svg` | Written as SVG text by `anthropic/claude-opus-5.5` through the OpenRouter chat API with `scripts/readme-demo/generate-assets.py`. Not edited afterwards. |
| `diagrams/flv-input-checks-{dark,light}.svg` | Generated the same way, then edited by hand: the "proposed" half was removed and the notes were checked against the code at d51b27a. |

The four SVGs in `diagrams/` are released under the MIT License, the same license as this repository
(see `LICENSE`), as decided by Deja on 2026-11-06 (recorded in the PR #187 discussion).

`provenance.json` records the prompt, request ID and model of every generated file, the SHA-256
of what was generated, what was changed by hand, and the SHA-256 of the committed file.

The SVGs embed no fonts, images, icons or links. They name system fonts
(`Helvetica, Arial, sans-serif`, `Menlo, Consolas, monospace` and similar), so each viewer draws
them with the fonts on their own computer. No third-party icons, images or sound are used.

## Fonts used by the demo scripts

`scripts/readme-demo/` renders a demo video (not committed) and draws these fonts into its frames:

| Font | Used for | Source | License |
|---|---|---|---|
| Inter | Headings and labels | `library/fonts/Inter.woff2` in this repository (see `library/fonts/LICENSES.md`) | SIL Open Font License 1.1 |
| JetBrains Mono, else DejaVu Sans Mono | Terminal text in the motion layer | System install, https://www.jetbrains.com/lp/mono/ | SIL Open Font License 1.1 |
| Noto Sans CJK SC | Text in the synthetic live room (`make-synthetic-source.py`) | System install (Debian `fonts-noto-cjk`), https://github.com/notofonts/noto-cjk | SIL Open Font License 1.1 |
