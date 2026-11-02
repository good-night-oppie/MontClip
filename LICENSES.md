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

### Replacing the bundled FFmpeg (LGPL)

`ffmpeg(.exe)` and `ffprobe(.exe)` are separate programs that MontClip starts with
argument lists; MontClip does not link them. You may replace
`resources/ffmpeg/ffmpeg(.exe)` and `resources/ffmpeg/ffprobe(.exe)` with your own
build of FFmpeg (for example one you compiled from the corresponding source above
under the LGPL); MontClip will run whatever is there. In development the same files
live in `vendor/ffmpeg/<platform>-<arch>/`, or set `MONTCLIP_FFMPEG` /
`MONTCLIP_FFPROBE` to full paths.

Separately, a user may choose an FFmpeg of their own with libx264 in Settings for
H.264 export only (`docs/decisions/2026-11-02-h264-encoder.md`). That program is the
user's; MontClip does not ship or download it.

### Libraries linked into the pinned build

From the build's own `configuration:` line (`--enable-…`). Licence names are the
upstream projects' declared licences, **not yet verified against the exact versions
BtbN pinned, and their full texts are not yet collected** (release blocker):

| Library | Upstream licence (declared) |
|---|---|
| zlib | Zlib |
| libxml2, fontconfig, libfreetype (FTL/GPLv2 dual), libharfbuzz, libfribidi (LGPL-2.1), lcms2 | MIT / FTL / MIT / LGPL-2.1 / MIT |
| libdav1d, librav1e, libsvtav1, libaom, libvpx, libwebp, libjxl, libopenjpeg, libzimg | BSD-2 / BSD-2 / BSD-3 / BSD-2 / BSD-3 / BSD-3 / BSD-3 / BSD-2 / WTFPL |
| libvorbis, libtheora, libopus, libmp3lame (LGPL-2.0), libtwolame (LGPL-2.1), libsoxr (LGPL-2.1), libopencore-amrnb/amrwb (Apache-2.0) | BSD-3 / BSD-3 / BSD-3 / LGPL / LGPL / LGPL / Apache-2.0 |
| libopenh264 | BSD-2 (see the H.264 ADR: shipping it conflicts with the decision; a build without it is still to be chosen) |
| libkvazaar, libvvenc, liboapv, liblcevc-dec, libuavs3d | BSD-3 / BSD-3-Clear / BSD-3 / BSD-3-Clear / BSD-3 |
| libass, libbluray (LGPL-2.1), libgme (LGPL-2.1), libopenmpt, libaribb24 (LGPL-3), libaribcaption, libzvbi (LGPL-2), chromaprint (LGPL-2.1) | ISC / LGPL / LGPL / BSD-3 / LGPL / MIT / LGPL / LGPL |
| librsvg (LGPL-2.1), libplacebo (LGPL-2.1), vulkan loader / headers, opencl headers, ffnvcodec, amf, libvpl, lv2 | LGPL / LGPL / Apache-2.0 / Apache-2.0 / MIT / MIT / MIT / ISC |
| librist, libsrt (MPL-2.0), libssh (LGPL-2.1), libzmq (MPL-2.0), libsnappy, gmp (LGPL-3), lzma, iconv (LGPL), sdl2, openal (LGPL-2), vapoursynth (LGPL-2.1), libvmaf | BSD-2 / MPL-2.0 / LGPL / MPL-2.0 / BSD-3 / LGPL / 0BSD / LGPL / Zlib / LGPL / LGPL / BSD-2 |

Open items before a release (not resolved by this entry):

- The build links further libraries statically (for example libopenh264,
  dav1d, libvorbis, libvmaf, librsvg). Their own license texts are not in the
  BtbN archive and are not yet collected here.
- BtbN autobuild releases are not kept forever. Keep a copy of both archives
  and the corresponding source — FFmpeg at the commit above, BtbN's build scripts
  at the release tag, and every library's source at the version BtbN used — where
  the release process can retrieve them.
- This LGPL build has no libx264/libx265: H.264 export uses graphics-card encoders
  or Windows' `h264_mf` (ADR `docs/decisions/2026-11-02-h264-encoder.md`).
