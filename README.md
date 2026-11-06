# MontClip

A video editor for streamers who cut their own streams. Chinese first, English one click away.

Based on [ronak-create/FableCut](https://github.com/ronak-create/FableCut) (MIT).

[简体中文](docs/i18n/README.zh-CN.md)

## What MontClip is

MontClip is an editor you install and run on your own computer. Bring in your stream recordings, pick the parts you want to keep sentence by sentence from the subtitles, and export the finished clip with its subtitle file. Your recordings are processed on your computer and are not uploaded.

## What it can do today

- **Import local recordings**: add video files from your computer to a project.
- **Keep by sentence**: when subtitles are available, tick the sentences you want to keep and MontClip joins them in order. Preview first, then apply; one Undo reverts it, and your original files are never changed.
- **Export MP4 and subtitles**: export the finished clip as MP4, together with a matching SRT subtitle file.
- **Optional AI assistant**: connect your own AI service account and ask it for editing suggestions. Before every send you see the exact text that will go out; a suggestion only changes your clip when you click Apply, and it can be undone. Editing works fine without it. Service charges are billed to your own AI account.

## Planned

These are still in progress or not yet verified, and are not available now:

- More of the interface in Chinese (some panels and dialogs are still in English)
- An installer (for now MontClip runs the developer way)
- Cutting Chinese by individual words (Chinese transcription currently has sentence-level timing only)
- macOS and Linux versions (only tested on Windows so far)

## About the upstream project

MontClip is a modified version of FableCut and keeps its MIT license. FableCut has many more features that MontClip has not verified one by one, so they are not listed here. See the [upstream FableCut documentation](https://github.com/ronak-create/FableCut).

The browser editor's optional AI background removal asks before downloading MediaPipe.
Its program, WASM and model files use a fixed version and must all pass integrity checks
before use. Consent lasts only in that page; export refuses clips whose required mask is
unavailable. See [package provenance and verification limits](licenses/mediapipe/README.md).

## License

MIT. See [LICENSE](LICENSE) and the third-party notices.

## Technical reference

See the [agent and API manual](CLAUDE.md) for media repair and background duration merging, and the [timestamp repair comparison](docs/testing/repair-timestamp-jump.md) for the reproducible test and its limits.
