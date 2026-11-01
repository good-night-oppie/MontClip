# Third-party components shipped with MontClip

## FFmpeg (bundled `ffmpeg` and `ffprobe`)

The desktop app runs only the FFmpeg it ships in `resources/ffmpeg/`
(see `ffmpeg-path.js`); it never uses an FFmpeg found on `PATH`.

- Version: FFmpeg `n9.0.2-42-gd7643a0fe3`
- License: **LGPL-3.0-or-later** (configured with `--enable-version3`, without
  `--enable-gpl` and without `--enable-nonfree`). The full license text ships as
  `resources/ffmpeg/LICENSE.txt`.
- Corresponding source: https://github.com/FFmpeg/FFmpeg/commit/d7643a0fe3
- Built by: BtbN/FFmpeg-Builds, release `autobuild-2026-11-01-12-49`
  (build scripts: https://github.com/BtbN/FFmpeg-Builds)
- Pinned in `desktop/ffmpeg-manifest.json`; `node desktop/fetch-ffmpeg.cjs`
  refuses an archive whose SHA-256 differs, or an `ffmpeg` that reports a GPL or
  non-free configuration.

| Platform | Archive | SHA-256 |
|---|---|---|
| win32-x64 | https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-11-01-12-49/ffmpeg-n9.0.2-42-gd7643a0fe3-win64-lgpl-9.0.zip | `187fef3a0221148eaf9c342c82309209277d84b2257efcac7d230687b77f2862` |
| linux-x64 | https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-11-01-12-49/ffmpeg-n9.0.2-42-gd7643a0fe3-linux64-lgpl-9.0.tar.xz | `9f0b46b253bc352aeb63b7829dd518f4d879e10f51bc135496b7e266ceea0bb3` |

Open items before a release (not resolved by this entry):

- The build links further libraries statically (for example libopenh264,
  dav1d, libvorbis, libvmaf, librsvg). Their own license texts are not in the
  BtbN archive and are not yet collected here.
- BtbN autobuild releases are not kept forever. Keep a copy of both archives
  (and the matching source) where the release process can retrieve them.
- This LGPL build has no libx264/libx265. See the pull request for what this
  means for H.264 export and proxies.
