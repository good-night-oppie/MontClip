# Third-party components shipped with MontClip

## MediaPipe selfie segmentation (optional browser download)

`@mediapipe/selfie_segmentation@0.1.1675465747` declares **Apache-2.0** in its
exact npm package metadata. It is not bundled or fetched until the user confirms
in the current browser page. All JS, WASM, graph and model bytes are size/SHA-256
pinned in `bgremove-assets.js` and verified before local Blob URLs are used.

See [exact sources, integrity and license limits](licenses/mediapipe/README.md)
and the [official project license text](licenses/mediapipe/LICENSE). The npm package
has no LICENSE/NOTICE file or source-commit mapping; the cited upstream source
commit is a license reference, not a verified build provenance claim.

## FFmpeg (bundled `ffmpeg` and `ffprobe`)

The desktop app runs only the FFmpeg it ships in `resources/ffmpeg/`
(see `ffmpeg-path.js`); it never uses an FFmpeg found on `PATH`.
The Cindy plugin (`plugins/montclip-cindy`) does not ship FFmpeg: on first use it
downloads this same pinned win32-x64 archive into `~/MontClip-Cindy/ffmpeg/win32-x64/`
(SHA-256 and size checked by Cindy, then the same LGPL check), together with its
`LICENSE.txt`, and runs only that copy.

- Version: FFmpeg `n9.0.2-42-gd7643a0fe3`
- License: **LGPL-3.0-or-later** (configured with `--enable-version3`, without
  `--enable-gpl` and without `--enable-nonfree`). The full license text ships as
  `resources/ffmpeg/LICENSE.txt`.
- Corresponding source: https://github.com/FFmpeg/FFmpeg/commit/d7643a0fe3
- Built by: this repository's `.github/workflows/build-ffmpeg.yml`, Actions run `41397853139`, from
  BtbN/FFmpeg-Builds `5ece62897c650b863c1ddda7b6964845344aef2d` (the commit of release
  `autobuild-2026-11-01-12-49`, its build image pinned by digest) with only `--disable-libopenh264`
  changed (build scripts: https://github.com/BtbN/FFmpeg-Builds). Published as release
  `ffmpeg-lgpl-n9.0.2-montclip1` of this repository.
- Pinned in `desktop/ffmpeg-manifest.json`; `node desktop/fetch-ffmpeg.cjs`
  refuses an archive whose SHA-256 differs, or an `ffmpeg` that reports a GPL or
  non-free configuration.

| Platform | Archive | SHA-256 |
|---|---|---|
| win32-x64 | https://github.com/good-night-oppie/MontClip/releases/download/ffmpeg-lgpl-n9.0.2-montclip1/ffmpeg-n9.0.2-42-gd7643a0fe3-win64-lgpl-9.0.zip | `67c30e30206b5bddcc2af9ea4f0215bbbcd2519533316997945a0fd9602a2f96` |
| linux-x64 | https://github.com/good-night-oppie/MontClip/releases/download/ffmpeg-lgpl-n9.0.2-montclip1/ffmpeg-n9.0.2-42-gd7643a0fe3-linux64-lgpl-9.0.tar.xz | `69a9690a4c0eb7e7059f2141de54b4ec57100741a95a04809734c6adc9a0b8ae` |

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

### Libraries in the build, version by version

Every library BtbN/FFmpeg-Builds `5ece62897c650b863c1ddda7b6964845344aef2d` builds for **win64** and
**linux64**, `lgpl 9.0`: the release our manifest pins, and the source of our own build without
openh264 (`.github/workflows/build-ffmpeg.yml`). The list comes from asking each `scripts.d` script
whether it is enabled for that target. Each library has its pinned source and ref, and the licence
texts from that exact ref, in `licenses/ffmpeg/texts/` (SHA-256 in `licenses/ffmpeg/inventory.json`).
"Built" means built into BtbN's image for that target. Not every library is linked into `ffmpeg`;
fftw3, for example, is not.

The licence column is detected from the text; entries with "(read)" were read by hand.
release-check fails while any entry is missing its text or is unclassified (`auditLicenses`).

| Library | Targets | Source @ ref | Licence texts | Licence |
|---|---|---|---|---|
| amf | linux64, win64 | github.com/GPUOpen-LibrariesAndSDKs/AMF @ `57ee0cfb0e1a` | LICENSE.txt | MIT |
| aom | linux64, win64 | aomedia.googlesource.com/aom @ `9ace39e02a34` | LICENSE | BSD-2 |
| brotli | linux64, win64 | github.com/google/brotli @ `2e2bcf17ae71` | LICENSE | MIT |
| cairo | linux64, win64 | gitlab.freedesktop.org/cairo/cairo @ `74755964edef` | COPYING | LGPL-2.1 OR MPL-1.1 (read) |
| chromaprint | linux64, win64 | github.com/acoustid/chromaprint @ `3b38c100022b` | LICENSE.md | LGPL-2.1 / MIT |
| dav1d | linux64, win64 | code.videolan.org/videolan/dav1d @ `b8b2d726b4b7` | COPYING | BSD-2 |
| ffnvcodec | linux64, win64 | github.com/FFmpeg/nv-codec-headers @ `f2053071ea93` | include/ffnvcodec/nvEncodeAPI.h | MIT |
| fftw3 | linux64, win64 | github.com/FFTW/fftw3 @ `a7b679c52833` | COPYING, COPYRIGHT | GPL-2.0-or-later — built in BtbN's image but NOT linked: only rubberband (GPL-only, excluded from LGPL builds) uses it; 0 fftw strings in the linux64 ffmpeg and the win64 ffmpeg.exe (read) |
| fontconfig | linux64, win64 | gitlab.freedesktop.org/fontconfig/fontconfig @ `b25ffeabd15b` | COPYING | MIT / PD |
| freetype | linux64, win64 | gitlab.freedesktop.org/freetype/freetype @ `4ba7c3d82ab8` | LICENSE.TXT | PD |
| fribidi | linux64, win64 | github.com/fribidi/fribidi @ `d2f3e1f4946e` | COPYING | LGPL-2.1 |
| glib | linux64, win64 | github.com/GNOME/glib @ `50b938a3e8f5` | LICENSES/LGPL-2.1-or-later.txt | LGPL-2.1 |
| gme | linux64, win64 | github.com/libgme/game-music-emu @ `f68963b1de06` | license.txt | LGPL-2.1 |
| gmp | linux64, win64 | github.com/BtbN/gmplib @ `5c3e9a9d52b6` | COPYING.LESSERv3, COPYINGv2, COPYINGv3 | LGPL-3.0-or-later OR GPL-2.0-or-later (dual); FFmpeg is built --enable-version3, LGPL-3 applies (read) |
| harfbuzz | linux64, win64 | github.com/harfbuzz/harfbuzz @ `75d8ac5d2313` | COPYING | MIT ("Old MIT") (read) |
| kvazaar | linux64, win64 | github.com/ultravideo/kvazaar @ `1f11f9ae33ef` | LICENSE | BSD-3 |
| lcevcdec | linux64, win64 | github.com/v-novaltd/LCEVCdec @ `741fb7c869cf` | LICENSE.md, COPYING | BSD-3-Clause-Clear (no patent license granted) (read) |
| lcms2 | linux64, win64 | github.com/mm2/Little-CMS @ `1112313b3784` | LICENSE | MIT |
| libaribb24 | linux64, win64 | github.com/nkoriyama/aribb24 @ `5e9be272f96e` | COPYING | LGPL-3 |
| libaribcaption | linux64, win64 | github.com/xqq/libaribcaption @ `37dde0f32652` | LICENSE | MIT |
| libass | linux64, win64 | github.com/libass/libass @ `f61db567e659` | COPYING | ISC |
| libbluray | linux64, win64 | code.videolan.org/videolan/libbluray @ `f33a738fd7bb` | COPYING | LGPL-2.1 |
| libdrm | linux64 | gitlab.freedesktop.org/mesa/drm @ `b97cbde15c5c` | LICENSES/MIT.txt | MIT |
| libffi | linux64, win64 | github.com/libffi/libffi @ `bc5538673672` | LICENSE | MIT |
| libglvnd | linux64 | gitlab.freedesktop.org/glvnd/libglvnd @ `c046a760d845` | README.md | MIT / BSD-2 |
| libiconv | linux64, win64 | git.savannah.gnu.org/git/libiconv @ `b5a1735e02bf` (texts via the GitMirroring mirror, same commit) | COPYING.LIB, COPYING, README | LGPL-2.1-or-later for the libiconv/libcharset library FFmpeg links (README: "The libiconv and libcharset libraries and their header files are under LGPL, see file COPYING.LIB"); COPYING (GPL-3) covers the iconv program and the documentation, not linked (read) |
| libjxl | linux64, win64 | github.com/libjxl/libjxl @ `e47d2a2b5bb4` | LICENSE | BSD-3 |
| libogg | linux64, win64 | github.com/xiph/ogg @ `06a5e0262cdc` | COPYING | BSD-3 |
| libopus | linux64, win64 | github.com/xiph/opus @ `a8b2545eec71` | COPYING | BSD-3 |
| libpciaccess | linux64 | gitlab.freedesktop.org/xorg/lib/libpciaccess @ `38e6f15f839f` | COPYING | MIT |
| libplacebo | linux64, win64 | code.videolan.org/videolan/libplacebo @ `275f7dea2792` | LICENSE | LGPL-2.1 |
| libpng | linux64, win64 | github.com/glennrp/libpng @ `0b0876829d77` | LICENSE.md | libpng-2.0 (PNG Reference Library License v2) (read) |
| libpsl | linux64, win64 | github.com/rockdaboot/libpsl @ `620d51d13351` | LICENSE | MIT |
| librist | linux64, win64 | code.videolan.org/rist/librist @ `47ad5513d1aa` | COPYING | BSD-2 |
| librsvg | linux64, win64 | github.com/GNOME/librsvg @ `0c074d0a25ad` | COPYING.LIB | LGPL-2.1 |
| libsamplerate | linux64, win64 | github.com/libsndfile/libsamplerate @ `0844c208f683` | COPYING | BSD-2 |
| libssh | linux64, win64 | gitlab.com/libssh/libssh-mirror @ `9de02f3d01ba` | COPYING | LGPL-2.1 |
| libtheora | linux64, win64 | github.com/xiph/theora @ `28fd5ec77f0a` | LICENSE, COPYING | BSD-3-Clause (Xiph), with On2 patent non-assertion (read) |
| libudfread | linux64, win64 | code.videolan.org/videolan/libudfread @ `b0bc6957e7e0` | COPYING | LGPL-2.1 |
| libunibreak | linux64, win64 | github.com/adah1972/libunibreak @ `f8172fe771ef` | LICENCE | Zlib |
| libva | linux64, win64 | github.com/intel/libva @ `f052e984e0c8` | COPYING | MIT |
| libvorbis | linux64, win64 | github.com/xiph/vorbis @ `1b75110b5a27` | COPYING | BSD-3 |
| libvpx | linux64, win64 | chromium.googlesource.com/webm/libvpx @ `900b2a52b69e` | LICENSE | BSD-3 |
| libwebp | linux64, win64 | chromium.googlesource.com/webm/libwebp @ `1844042d1ca7` | COPYING | BSD-3 |
| libx11 | linux64 | gitlab.freedesktop.org/xorg/lib/libx11 @ `b8d5a7046a98` | COPYING | MIT |
| libxau | linux64 | gitlab.freedesktop.org/xorg/lib/libxau @ `be1daeb909f1` | COPYING | MIT / X11-style (read) |
| libxcb | linux64 | gitlab.freedesktop.org/xorg/lib/libxcb @ `d4e07bab5729` | COPYING | MIT |
| libxcursor | linux64 | gitlab.freedesktop.org/xorg/lib/libxcursor @ `15efad7ccd03` | COPYING | MIT / X11-style (read) |
| libxext | linux64 | gitlab.freedesktop.org/xorg/lib/libxext @ `508f8adca254` | COPYING | MIT |
| libxfixes | linux64 | gitlab.freedesktop.org/xorg/lib/libxfixes @ `55bb2d1d57d4` | COPYING | MIT |
| libxi | linux64 | gitlab.freedesktop.org/xorg/lib/libxi @ `9ea632ab9dce` | COPYING | MIT |
| libxinerama | linux64 | gitlab.freedesktop.org/xorg/lib/libxinerama @ `d7162b962710` | COPYING | MIT |
| libxml2 | linux64, win64 | github.com/GNOME/libxml2 @ `c79c9612fcc7` | Copyright | MIT |
| libxrandr | linux64 | gitlab.freedesktop.org/xorg/lib/libxrandr @ `8a4ba1974bcf` | COPYING | MIT / X11-style (read) |
| libxrender | linux64 | gitlab.freedesktop.org/xorg/lib/libxrender @ `f30d654658eb` | COPYING | MIT / X11-style (read) |
| libxscrnsaver | linux64 | gitlab.freedesktop.org/xorg/lib/libxscrnsaver @ `3f753e7a4050` | COPYING | MIT |
| libxv | linux64 | gitlab.freedesktop.org/xorg/lib/libxv @ `f315ec50fcad` | COPYING | MIT / X11-style (read) |
| libxxf86vm | linux64 | gitlab.freedesktop.org/xorg/lib/libxxf86vm @ `c76fde6bffcc` | COPYING | MIT |
| libzmq | linux64, win64 | github.com/zeromq/libzmq @ `46493370217a` | LICENSE | MPL-2.0 (the GPL match is the MPL text naming GPL as a secondary licence) (read) |
| lilv | linux64, win64 | github.com/lv2/lilv @ `4b8f30055fa5` | COPYING | ISC |
| lv2 | linux64, win64 | github.com/lv2/lv2 @ `3c57dae600a5` | COPYING | ISC |
| mbedtls | linux64, win64 | github.com/ARMmbed/mbedtls @ `v4.2.0` | LICENSE | Apache-2.0 |
| mingw | win64 | git.code.sf.net/p/mingw-w64/mingw-w64 @ `7213d719fe34` | COPYING | BSD-3 / PD |
| mingw-std-threads | win64 | github.com/meganz/mingw-std-threads @ `c931bac289dd` | LICENSE | BSD-2 |
| nghttp2 | linux64, win64 | github.com/nghttp2/nghttp2 @ `3baf9561e09f` | COPYING | MIT |
| nghttp3 | linux64, win64 | github.com/ngtcp2/nghttp3 @ `ac11a456eb9d` | COPYING | MIT |
| ngtcp2 | linux64, win64 | github.com/ngtcp2/ngtcp2 @ `20da63db12a3` | COPYING | MIT |
| onevpl | linux64, win64 | github.com/intel/libvpl @ `674d015bcb29` | LICENSE | MIT |
| openal | linux64, win64 | github.com/kcat/openal-soft @ `4a52288b772d` | COPYING | LGPL-2 |
| openapv | linux64, win64 | github.com/AcademySoftwareFoundation/openapv @ `b4ff69856b4c` | LICENSE | BSD-3 |
| opencl | linux64, win64 | github.com/KhronosGroup/OpenCL-Headers @ `82f60316cc14` | LICENSE | Apache-2.0 |
| opencore-amr | linux64, win64 | git.code.sf.net/p/opencore-amr/code @ `7dba8c322384` | LICENSE | Apache-2.0 |
| openjpeg | linux64, win64 | github.com/uclouvain/openjpeg @ `8314119b067c` | LICENSE | BSD-2 |
| openmpt | linux64, win64 | github.com/OpenMPT/openmpt @ `3ee3c8000b45` | LICENSE | BSD-3 |
| openssl | linux64, win64 | github.com/openssl/openssl @ `openssl-3.6.5` | LICENSE.txt | Apache-2.0 |
| pango | linux64, win64 | github.com/GNOME/pango @ `68e981d243d5` | COPYING | LGPL-2 |
| pcre2 | linux64, win64 | github.com/PCRE2Project/pcre2 @ `be940c4eaec0` | LICENCE.md | BSD-3 / PD |
| pixman | linux64, win64 | gitlab.freedesktop.org/pixman/pixman @ `e7fd44140fe6` | COPYING | MIT |
| pulseaudio | linux64 | gitlab.freedesktop.org/pulseaudio/pulseaudio @ `77d25a1e6130` | LICENSE | LGPL-2.1 (client library; GPL parts are optional server modules, not linked) (read) |
| rav1e | linux64, win64 | github.com/xiph/rav1e @ `31435de9d76f` | LICENSE | BSD-2 |
| sdl | linux64, win64 | github.com/libsdl-org/SDL @ `8acf7cfc0f88` | LICENSE.txt | Zlib |
| serd | linux64, win64 | github.com/drobilla/serd @ `b621b0bc790d` | COPYING | ISC |
| shaderc | linux64, win64 | github.com/google/shaderc @ `2737994b5521` | LICENSE | Apache-2.0 |
| snappy | linux64, win64 | github.com/google/snappy @ `946606459314` | COPYING | BSD-3 / PD |
| sord | linux64, win64 | github.com/drobilla/sord @ `4b5232bb91e7` | COPYING | ISC |
| soxr | linux64, win64 | git.code.sf.net/p/soxr/code @ `945b592b7047` | LICENCE, COPYING.LGPL | LGPL-2.1 |
| spirv-cross | linux64, win64 | github.com/KhronosGroup/SPIRV-Cross @ `300681bbcb83` | LICENSE | Apache-2.0 |
| spirv-headers | linux64, win64 | github.com/KhronosGroup/SPIRV-Headers @ `fbf86836a9b1` | LICENSE | MIT / PD |
| sratom | linux64, win64 | github.com/lv2/sratom @ `9e8ee84eed50` | COPYING | ISC |
| srt | linux64, win64 | github.com/Haivision/srt @ `9f2390232a82` | LICENSE | MPL-2.0 (the GPL match is the MPL text naming GPL as a secondary licence) (read) |
| svtav1 | linux64, win64 | gitlab.com/AOMediaCodec/SVT-AV1 @ `f2c3fb78611d` | LICENSE.md | BSD-3 |
| twolame | linux64, win64 | github.com/njh/twolame @ `6fced852d4d5` | COPYING | LGPL-2.1 |
| uavs3d | linux64, win64 | github.com/uavs3/uavs3d @ `0e20d2c29185` | COPYING | BSD-3 |
| vapoursynth | linux64, win64 | github.com/vapoursynth/vapoursynth @ `R81` | COPYING.LESSER | LGPL-2.1 |
| vmaf | linux64, win64 | github.com/Netflix/vmaf @ `f712fa7564fe` | LICENSE | BSD-2 |
| vulkan-headers | linux64, win64 | github.com/KhronosGroup/Vulkan-Headers @ `v1.4.366` | LICENSE.md | Apache-2.0 OR MIT (read) |
| vulkan-loader | linux64, win64 | github.com/BtbN/Vulkan-Shim-Loader @ `65b3936528cd` | LICENSE | MIT |
| vvenc | linux64, win64 | github.com/fraunhoferhhi/vvenc @ `0e7508b811bb` | LICENSE.txt | BSD-3 |
| xcbproto | linux64 | gitlab.freedesktop.org/xorg/proto/xcbproto @ `cf7e2581b613` | COPYING | MIT |
| xorg-macros | linux64 | gitlab.freedesktop.org/xorg/util/macros @ `ea1e15a4909a` | COPYING | MIT |
| xproto | linux64 | gitlab.freedesktop.org/xorg/proto/xorgproto @ `6d3907b6d5dc` | COPYING-applewmproto, COPYING-bigreqsproto, COPYING-compositeproto (+34) | MIT / X11-style (one file per protocol) (read) |
| xtrans | linux64 | gitlab.freedesktop.org/xorg/lib/libxtrans @ `79f6b0bfe217` | COPYING | MIT |
| xxhash | linux64, win64 | github.com/Cyan4973/xxHash @ `61fd0fece2eb` | LICENSE | BSD-2 |
| xz | linux64, win64 | github.com/tukaani-project/xz @ `299eb5c3f597` | COPYING | LGPL-3 / PD |
| zimg | linux64, win64 | github.com/sekrit-twc/zimg @ `67e0603271c0` | COPYING | WTFPL |
| zix | linux64, win64 | github.com/drobilla/zix @ `17d632393f5a` | COPYING | ISC |
| zlib | linux64, win64 | github.com/madler/zlib @ `9d314c341b2c` | LICENSE | Zlib |
| zstd | linux64, win64 | github.com/facebook/zstd @ `49cf51799ea0` | LICENSE, COPYING | BSD-3 / LGPL-2 |
| zvbi | linux64, win64 | github.com/zapping-vbi/zvbi @ `34bb6f660c5c` | COPYING.md | LGPL-2 |

Still missing (release blocker): none. libiconv's texts came from github.com/GitMirroring/libiconv at the pinned commit `b5a1735e02bf43ee6e490fcf9395e8abc8d32432` (git.savannah.gnu.org unreachable from here and from GitHub's runners; a fetch by commit hash yields that commit's content, its tree `90720578248f` included).

Open items before a release (not resolved by this entry):

- **libopenh264 must not ship** (H.264 ADR): the manifest moves to our own build without it
  (`.github/workflows/build-ffmpeg.yml`); release-check fails until then.
- Licence texts: collected for every library above except the ones listed as missing.
- BtbN autobuild releases are not kept forever. Keep a copy of both archives
  and the corresponding source — FFmpeg at the commit above, BtbN's build scripts
  at the release tag, and every library's source at the version BtbN used — where
  the release process can retrieve them.
- This LGPL build has no libx264/libx265: H.264 export uses graphics-card encoders
  or Windows' `h264_mf` (ADR `docs/decisions/2026-11-02-h264-encoder.md`).

## On-device transcription (sherpa-onnx, Paraformer zh, CT-Transformer, silero VAD)

Speech is turned into words on this computer by the local server with sherpa-onnx-node 2.0.1 (#70, Deja 2026-11-03; ADR
`docs/decisions/2026-11-03-bundle-offline-transcribe.md`). Every file is pinned in `desktop/asr-manifest.json`
(version or SHA-256, size, sources). `desktop/fetch-asr.cjs` fills `vendor/asr/` and packaging copies it into
`resources/asr/`. Texts in `licenses/asr/`.

| Component | Version / file | Licence | In which package | Text |
|---|---|---|---|---|
| sherpa-onnx-node (JavaScript) and sherpa-onnx-win-x64 (`sherpa-onnx.node`, `sherpa-onnx-c-api.dll`, `sherpa-onnx-cxx-api.dll`) | 2.0.1 (npm, pinned integrity) | Apache-2.0 | every package | `licenses/asr/sherpa-onnx-Apache-2.0.txt` (the npm packages carry no LICENSE file; package.json says Apache-2.0) |
| ONNX Runtime (`onnxruntime.dll`, `onnxruntime_providers_shared.dll`, inside sherpa-onnx-win-x64) | as built by sherpa-onnx 2.0.1 | MIT | every package | `licenses/asr/onnxruntime-MIT.txt` |
| silero VAD `silero_vad.onnx` | SHA-256 9e2449e1… (k2-fsa asr-models release) | MIT | every package | `licenses/asr/silero-vad-MIT.txt` |
| Paraformer-large zh, int8 (`sherpa-onnx-paraformer-zh-2023-09-14`: `model.int8.onnx`, `tokens.txt`) | SHA-256 f36a0433… / 59aba887… | Apache-2.0 (model card) | the 完整版 package; otherwise downloaded or imported by the user | `licenses/asr/paraformer-zh-Apache-2.0.txt` |
| CT-Transformer punctuation, int8 (`sherpa-onnx-punct-ct-transformer-zh-en-vocab272727-2024-04-12-int8`, k2-fsa's ONNX conversion of FunASR's `punc_ct-transformer_zh-cn-common-vocab272727-pytorch`) | SHA-256 65a3fb9f… / c960ab87… | Apache-2.0: both official model cards say so (modelscope.cn/models/iic/punc_ct-transformer_zh-cn-common-vocab272727-pytorch, huggingface.co/funasr/ct-punc) and neither links FunASR's MODEL_LICENSE (FunASR's README: that agreement applies only when a model card links it; SenseVoice's does, this one does not). Checked 2026-11-03 | the 完整版 package; otherwise downloaded or imported by the user (optional) | `licenses/asr/ct-transformer-Apache-2.0.txt` |

- Not used: SenseVoice (its licence question, QwenAudio/SenseVoice issue #334, was reopened on 2026-08-29 and has no
  answer from the licensor), and `sherpa-onnx-paraformer-zh-int8-2025-10-07` (a Sichuan-dialect model).

## Third-party code in the official Cindy integration

MontClip host code retains the repository's MIT LICENSE. Imported components retain their own terms.

- Cindy: https://github.com/makecindy/cindy/tree/021923684f54129effbba6b72a8218526418fa45 — Apache-2.0; [LICENSE](agent-ui/upstream/LICENSE), [NOTICE](agent-ui/upstream/NOTICE), Copyright2026 XD Inc. Exact unchanged files/hashes: [SOURCES.json](agent-ui/SOURCES.json).
- Cindy, the assistant pane parts: https://github.com/makecindy/cindy/tree/43001eaaa31ef322de9ae148c4051087277d6198 — the same Apache-2.0 LICENSE and NOTICE (kept in [agent-ui/cindy-43001ea](agent-ui/cindy-43001ea)). The 145 unchanged files and their hashes are in [SOURCES.json](agent-ui/SOURCES.json) under `parts`; the MontClip stand-ins that take the place of a few Cindy files are in [agent-ui/stand-ins](agent-ui/stand-ins), each saying what it replaces ([cindy-resolve.cjs](agent-ui/cindy-resolve.cjs)). Cindy's zh-CN and en strings used by these parts: [cindy-strings.json](agent-ui/cindy-strings.json).
- React19.2.0 and ReactDOM19.2.0: MIT. lucide-react0.468.0: ISC. The pane parts also bring @radix-ui popover, tooltip and alert-dialog (MIT), i18next and react-i18next (MIT), clsx and tailwind-merge (MIT), and what they depend on (MIT; tslib 0BSD). [BUNDLED-PACKAGES.json](agent-ui/BUNDLED-PACKAGES.json) lists every npm package in the bundle. Full bundled license notices: [THIRD-PARTY-NOTICES.txt](agent-ui/THIRD-PARTY-NOTICES.txt).
- esbuild0.25.12 (MIT) and typescript 5.9.3 (Apache-2.0, used only to find the strings when copying the parts): build tools, not shipped. Lockfile fixes build versions.

The generated cindy-official.js has been adapted through bundling/minification and MontClip host interfaces. It has an explicit modification notice; the copied upstream source files have not been edited. No private Cindy configuration, API key, packaged extraction or Rea source is included. See the [reuse/change inventory](docs/decisions/2026-11-01-official-cindy-port.md).

The complete original282-byte Cindy NOTICE is also embedded verbatim in THIRD-PARTY-NOTICES.txt; upstream/NOTICE remains unchanged. Behavior SPEC v2 reference/hash is recorded in the ADR; it is not a source-code license substitute.

The official pane bundle also includes scheduler 0.27.0 (MIT, Meta Platforms, Inc. and affiliates). Its full license is retained in agent-ui/THIRD-PARTY-NOTICES.txt. BUNDLED-LICENSES.json pins each bundled dependency version and full notice hash.
