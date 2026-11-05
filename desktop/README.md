# MontClip desktop development shell

This hosts the existing MontClip UI and compositor. It is **not a release or M0
acceptance build**. No Python or renderer Node integration is introduced. Electron
is a development/packaging dependency; the core editor remains standard-library only.

```powershell
cd desktop
npm ci
node node_modules/electron/install.js
npm start
node smoke.js
```

The shell runs its own utility process on an OS-assigned loopback port. A fresh
256-bit session token is injected into requests by the main process, never placed
in a URL. Desktop server requests require exact Host/Origin and that token.
No preload or renderer IPC methods are exposed. Sandbox, context isolation and
web security are enabled; navigation, new windows, webviews and permissions are
denied. Downloads are limited to this editor's export files and blob outputs.
The main-frame CSP forbids remote scripts and eval; inline styles remain necessary
for the upstream compositor/UI. Font/model CDN requests and Node URL imports are
blocked in desktop mode. ASR remains unavailable until local assets are supplied.

Data lives in Electron userData/workspace. Closing asks the existing `flushSave`
to finish. A renderer fault, failed save or 15-second timeout offers bilingual
Keep waiting (default) / Force close (recent changes may be lost). Repeated close
requests and late save results cannot skip this choice or close a newer attempt.
Cleanup sends shutdown only to this instance's utility process, which kills its
tracked spawn/execFile children. It does not enumerate or terminate other apps.
Packaged worker stdout/stderr are not forwarded to avoid exposing project paths.
Desktop export/transcription/scopes/tracking reject headless execution; auto
requires an existing editor, with no system-browser fallback.
Single-instance locking prevents two windows sharing the same data directory.
Abnormal OS termination cleanup, packaging fuses, language coverage and save-failure UI acceptance
are still pending. Development smoke runs in a new Chinese/space-containing temp
directory, without showing a window or manipulating the mouse. It is not VV's
real-window test and does not measure A/V sync.

`node smoke.js --close-crash` crashes a real hidden Electron renderer;
`node smoke.js --close-timeout` injects a never-resolving save and exercises the
real 15-second deadline twice. Both inject dialog choices (wait, then force),
assert only two prompts despite repeated close clicks, and wait for app exit.
Fault injection is development-only and requires `--montclip-smoke`.

The timeline smokes (`MONTCLIP_TIMELINE_INPUT`) and the drop-reveal and three-track
runners take a synthetic 4-second clip made by `node make-fixture-av.cjs <out.mp4>`:
320x180, 30 fps, VP9 with mono AAC, fixed arguments, MontClip's own ffmpeg
(`vendor/ffmpeg`, or `--ffmpeg <path>` / `MONTCLIP_FFMPEG`; never the system PATH).
It writes `<out.mp4>.json` with the SHA-256 and the ffmpeg version; the runners make
the clip when it is missing and refuse one that does not match its record.

Runtime selection: Electron 45.2.1, resolved from npm on 2026-11-01, pinned by
`package-lock.json`; binary fetched by the official Electron installer, which uses
the version's checksums. Initial cached 42.11.12 was rejected: [GHSA-jr5w-w6x2-84p9](https://github.com/electron/electron/security/advisories/GHSA-jr5w-w6x2-84p9)
lists <42.11.16, 43 prereleases before 43.8.1, 44 prereleases before 44.9.1 and
45 prereleases before 45.0.0-beta.6 as affected by compromised certificate
mitigation. Audit on the installed 45.2.1 lock reported zero vulnerabilities;
that is not a complete security review. Electron's MIT and Chromium third-party
licenses must accompany a future package.

Security implementation follows [Electron's security checklist](https://www.electronjs.org/docs/latest/tutorial/security).

## Bundled FFmpeg

The server runs only the FFmpeg MontClip ships, never one found on `PATH`
(`ffmpeg-path.js`). Once packaged, `main.js` points it at
`resources/ffmpeg/` and ignores development overrides. In development, either
run `node desktop/fetch-ffmpeg.cjs` (downloads the pinned LGPL build for this
platform into `vendor/ffmpeg/<platform>-<arch>/`, checks its SHA-256 and that it
is not a GPL build), or set `MONTCLIP_FFMPEG` and `MONTCLIP_FFPROBE` to full paths
(or `MONTCLIP_FFMPEG_DIR` to a folder holding both). Without one of these,
export, preview frames, proxies and noise reduction report that the bundled
FFmpeg is missing. Packaging (`build.extraResources` in `package.json`) copies
`vendor/ffmpeg/<platform>-<arch>` to `resources/ffmpeg`; no packager is
configured in this repo yet. Source and checksums: `LICENSES.md`.

Reuse, not re-download: `fetch-ffmpeg.cjs` does nothing when `vendor/ffmpeg/<platform>-<arch>`
(or `MONTCLIP_FFMPEG_DIR`) already holds the pinned build with the program hashes it recorded
at install. `--cache-dir <dir>` keeps the archive between runs (CI caches it under a key made
from `desktop/ffmpeg-manifest.json`), checked against the pinned SHA-256 before every use.
Packaging copies the checked vendor folder; it never downloads. CI never uses the runner's own
ffmpeg, and never the local FFmpeg a user may choose for H.264 export.

## A private test package for one streamer (DeepSeek)

The owner (2026-11-04): 「配置好再打包，私下打包，不发布」. One package carries one streamer's DeepSeek key as a one-time
seed; QQ's rules (2026-11-04) are part of it:

1. **One key per streamer.** On the DeepSeek platform give each key a spending limit and a note naming the streamer,
   so one key can be revoked on its own. Packages are not interchangeable: never rename a zip and send it to someone
   else — it holds the first streamer's key.
2. **Point-to-point only.** No public link, no group files, no chat attachment. Write each package's SHA-256 (printed
   at the end of the build) with the streamer's number in the owner's own list; the script writes no list.
3. **Build** (Windows, a clean tree, `vendor/ffmpeg` and `vendor/asr` with the models, `npm ci` in `desktop/`):

       node desktop/package-win.cjs --full --out <a folder outside the repository> --private-seed <file holding the key> --seed-model <the DeepSeek model id> --delete-key-file

   The key file holds the key on one line, outside the repository; `--delete-key-file` deletes it once the package is
   made (without it, a reminder is printed). The build fails if the key is anywhere in the package but
   `resources/montclip-seed-v1.json`, or if anything else in the package looks like a credential. Check the zip with
   `node desktop/package-smoke.cjs <zip>`; never upload it anywhere.
4. **First launch** (`desktop/agent-seed.js`): the key is written into `agent-connection-v1.json` with Electron
   safeStorage, read back and checked, and only then the seed's bytes are overwritten and the seed deleted. A failure
   part-way keeps the seed. If rollback cannot delete a mismatching connection, both files remain; the next launch
   reports a conflict and preserves the seed. Until the conflict is resolved, the service reports not configured and refuses sends and configuration writes; its saved bytes remain unchanged. An existing connection permits seed deletion only when provider, model
   and key all match. After the conflicting connection is explicitly removed, a later launch can seal the preserved
   seed. A seed already wiped to all zero bytes is retried as cleanup on later launches; a failed unlink keeps the cleanup warning instead of reporting unreadable settings. **On Windows safeStorage is DPAPI, bound to the current Windows
   user: on another computer, or another Windows account, the AI has to be set up again** (the seed is gone after the
   first launch). The key, its first characters, the seed's name and the sealed connection never go into a log.
5. **Until that first launch the key is plain text inside the zip** — the risk of this way of doing it. Not done
   (mentioned only): a package with no seed, where the streamer pastes her own key on the first launch.
6. **The 「AI 数据说明」** (JJ's v5; DeepSeek's open-platform terms 3.5, 5.5, 8.1): the first time she opens the
   assistant it covers the whole window and only 〔我知道了〕 closes it; until then the main process refuses every send to
   DeepSeek (`NOTICE_REQUIRED`). Read, it is kept in `agent-data-notice-v1.json` (the version she read; new words show it
   again). It is shown again from 设置 › AI 助手 › 数据说明 and from the 数据说明 link in every review box. Only the
   selected clips' numbers are sent (none when nothing is selected); caption text only after 〔让 AI 看〕; danmaku text
   never. The panel says 「回复由 AI 生成」 at the top at all times; what can leave the panel (the AI's plans) carries its
   own 「AI 生成」. In this package the AI names nothing and writes no descriptions or export titles.
7. **设置 › AI 助手 › 用 AI 助手** (on by default): switched off (kept in `agent-switch-v1.json`), the assistant panel
   folds away and the main process refuses every send (`AI_OFF`) and Yolo's external steps; opened again, the panel
   says it is off. Nothing goes out. Editing works as before.
