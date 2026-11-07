# Render geometry re-check (europa trial P4 / P4b / P5), 2026-11-05

All pictures here are synthetic. No frame of the live recording leaves europa.

## Synthetic source

`synthetic-source.jpg`: a stand-in for `part1.mp4`. It is 1920×1080, and the
picture fills only the top-left 1536×864 (80 %), with flat grey around it.
`part1.mp4` has the same layout: its luma is a flat 126 for x ≥ 1536 and y ≥ 864
at 1, 60, 120, 200 and 300 s. Coloured blocks stand where the trial aimed:

| block | the trial aimed at |
|---|---|
| yellow | the guest in the PK split ("guest" mask) |
| cyan | the viewer nicknames ("names" mask) |
| magenta | the top label ("top" mask) |
| green | the player's progress bar (sh_scrub crop) |
| orange | the top toolbar (sh_auto crop) |

## Stills

Each image is a `fablecut_frame {time}` still, rendered headless by the branch
engine from a copy of the trial project with the synthetic source in place of
`part1.mp4`. The left half uses the trial's own numbers. The right half uses the
same numbers converted to fractions of the whole frame (×0.8, because the
picture is 80 % of the frame). To make the masks visible, the masked overlay
copies use `invert: 100` here instead of `blur: 28`.

| file | time | left (trial numbers) | right (frame fractions) |
|---|---|---|---|
| `cmp-masks-t12.6.jpg` | 12.6 | masks miss the blocks (zoomed clip, scale 2) | each mask covers its block exactly and follows the zoom |
| `cmp-masks-t2.49.jpg` | 2.49 | first frame of sh_scrub: grey around the top-left picture is the file's own padding (P5) | the same |
| `cmp-crops-t3.8.jpg` | 3.8 | crop keeps the band under the progress bar | crop keeps the progress bar |
| `cmp-crops-t12.9.jpg` | 12.9 | toolbar strip, centred (fit: contain) | toolbar strip, centred |

The real stills of the project copy, at the same four times, are only on europa:
`~/mc-verify-geom-shots/v-{masks,crops}{Before,After}-t*.jpg`.
