# MontClip

A video editor for streamers who cut their own streams. Chinese first, English one click away.

Based on [ronak-create/FableCut](https://github.com/ronak-create/FableCut) (MIT).

[简体中文](docs/i18n/README.zh-CN.md)

<p align="center">
  <img src="docs/assets/demo/readme-demo-cover.png" width="720" alt="One frame from the MontClip demo: on the left, the original picture of a synthetic live room; on the right, the MontClip export after cropping, zooming in and hiding one area. The footage is synthetic, not a real recording.">
  <br><sub>Demo (22 seconds, synthetic footage, not a real recording). <a href="https://github.com/good-night-oppie/MontClip/releases/tag/readme-demo-2026-11-07">Watch the demo video</a></sub>
</p>

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

## License

MIT. See [LICENSE](LICENSE) and the third-party notices.

## Technical reference

### Diagrams (for developers)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/diagrams/symbolic-perception-arch-dark.svg">
  <img src="docs/assets/diagrams/symbolic-perception-arch-light.svg" width="880" alt="Diagram (for developers): an agent that controls MontClip through the MCP interface reads a text summary of the project first, and asks for a few frames only when it is unsure. Those frames are returned to that agent.">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/diagrams/flv-input-checks-dark.svg">
  <img src="docs/assets/diagrams/flv-input-checks-light.svg" width="880" alt="Diagram (current version): how an imported FLV recording is checked. MontClip looks at the streams, then scans the readable range; if a gap is longer than 5 ms it refuses and explains why; with no gap and compatible streams it remuxes, otherwise it transcodes only with your explicit consent; the output is then checked.">
</picture>

See the [agent and API manual](CLAUDE.md) for media repair and background duration merging, and the [timestamp repair comparison](docs/testing/repair-timestamp-jump.md) for the reproducible test and its limits.

JPEG ProRes exports use the selected range's frame count to preserve audio through
the project end. Direct REST callers can supply `frames` with `fps`; see the
[export boundary decision](docs/decisions/2026-11-05-prores-project-end.md) for scope and compatibility.
Bounded ProRes preserves filters selected by the output stream index, including
muted audio after explicit stream reordering. Unsupported mappings or filter
selectors are refused instead of silently replacing an existing audio filter.

A busy visible editor keeps its queued job. Silent hidden or disconnected editors release the queue after 20 seconds; the busy response includes cancellation instructions.

Agent speech/song/highlight tools support bounded waits and saved task results; retries with an idempotency key do not duplicate edits. Completed transcript paragraphs remain on disk after cancellation. See the [agent manual](CLAUDE.md) for the same-tool retrieval contract.

Incomplete transcription replies identify saved paragraphs with data-root-relative
paths such as `analysis/transcripts/name.json`. Direct and bounded tool calls use
the same incomplete-work notice; local absolute paths stay out of that notice and
the `saved` field. Local clients resolve these paths against their own data root.
Tool error text, including warnings inside normal replies, uses one redaction
boundary. Older terminal task receipts are scrubbed on disk before replay;
the operation itself is never repeated.
