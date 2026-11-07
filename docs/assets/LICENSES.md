# Sources and licenses for docs/assets

Everything in this folder is synthetic: no real stream recordings, chat (danmaku), viewer or
streamer names, and no credentials. The demo scripts draw a synthetic live room with a placeholder
streamer and placeholder viewer names (观众A/B/C). The README shows the two diagram pairs and the
demo cover (decision by Deja, 2026-11-07; this replaces the earlier note that the diagrams were not meant for the README).

| Files | How they were made |
|---|---|
| `diagrams/symbolic-perception-arch-{dark,light}.svg` | Written as SVG text by `anthropic/claude-opus-5.5` through the OpenRouter chat API with `scripts/readme-demo/generate-assets.py`, then one line edited by hand: the subtitle now reads "State first, images on demand" (JJ, 2026-11-07). |
| `diagrams/flv-input-checks-{dark,light}.svg` | Generated the same way, then edited by hand: the "proposed" half was removed and the notes were checked against the code at d51b27a. |
| `demo/readme-demo-cover.png` | One frame (t = 2.0 s) of the synthetic 22 s demo video built by `scripts/readme-demo/build.sh` at `cdc3aea1`; the video passed the six acceptance gates (`report.json` sha256 `e431ede66f27e9208b72001055881c3461324a3b22299e2c4d9fc27fce597cec`). The frame shows the synthetic / placeholder notices. |
| `demo/readme-cover-illustration.png` | **Not used by the README yet; waiting for its source record and review (PR for the cover fix).** A synthetic illustration supplied by the owner on 2026-11-07 (original JPEG 2048×1154, sha256 `4128ed3337ef0ca2baae0c09b565b20e88d5c3126ee7b411c1e0d863b1fb0842`). Which tool generated it, the prompt, and the tool's terms are **not recorded yet**. Edited by hand with `scripts/readme-demo/fix-owner-cover.py` (one comment per change): garbled and misspelled text fixed, the URL-like line, "NCP", "Edited by MontClip.", "+ COVER" and "materials from real MontClip MCP calls" removed, and anime-like posters and figures in the background blurred; then scaled to 1280×720 (sha256 `3b2a697d550efdaaddba3799a6af04ecd0491e3a0b8a23b565b3a472098af44b`). The replacement text is drawn in Noto Sans CJK SC (SIL OFL 1.1) and DejaVu Sans Mono (Bitstream Vera license, free to use and embed). |

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
