"""The demo's redaction shot, shared by montclip-materials.py (which renders it for the video) and
verify-cover.py (which checks it), so the check covers exactly what the demo shows.

Crop to the stage (drop the top bar and the chat panel), zoom in with a scale keyframe, and hide the gift
bar under an opaque, hard-edged cover: a shape layer on the track above with one black rectangle, normal
blend, opacity 1, no feather, no corner radius and no stroke. The cover has the same x/y/scale and the same
scale keyframes as the video, so it follows the picture as it zooms, and it is on screen for the whole shot.

This replaces the earlier "blurred copy on the track above (+ a hole in the sharp clip)" recipe, which can
let the sharp original show through (see README.md). The cover is checked for this synthetic shot only
(verify-cover.py); it is not a guarantee for other footage, motion or settings.
"""

SOURCE_W, SOURCE_H = 1280, 720          # make-synthetic-source.py
GIFT = (20, 640, 840, 700)              # gift bar in source pixels (make-synthetic-source.py GIFT)
CROP = dict(fit="contain", cropL=0, cropR=33, cropT=8, cropB=0)
ZOOM = {"scale": [{"t": 0, "v": 0.6}, {"t": 4.5, "v": 1.0, "ease": "easeInOut"}]}
START_SCALE = 0.6
IN, DURATION = 2.6, 6                   # source seconds the shot starts at, and its length
CANVAS = (1280, 720, 60)                # width, height, fps
MARGIN = 12                             # px at scale 1, added on every side of the gift bar


def cover_rect():
    """The gift bar, plus MARGIN, as a rectangle in shape-layer px (centre x, centre y, w, h) at scale 1.

    The cropped picture (cropL/R/T/B are % of the source) is fitted ("contain") into the canvas and centred
    on it; the shape layer's origin is the canvas centre and it scales about that point, like the video."""
    W, H, _ = CANVAS
    x0, x1 = SOURCE_W * CROP["cropL"] / 100, SOURCE_W * (1 - CROP["cropR"] / 100)
    y0, y1 = SOURCE_H * CROP["cropT"] / 100, SOURCE_H * (1 - CROP["cropB"] / 100)
    k = min(W / (x1 - x0), H / (y1 - y0))                     # contain
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2                       # source point drawn at the canvas centre
    gx0, gy0, gx1, gy1 = GIFT
    return (round(((gx0 + gx1) / 2 - cx) * k, 2), round(((gy0 + gy1) / 2 - cy) * k, 2),
            round((gx1 - gx0) * k + 2 * MARGIN, 2), round((gy1 - gy0) * k + 2 * MARGIN, 2))


def ops(media_id, cover=True, name="redact-zoom shot"):
    """fablecut_patch_project ops for the shot. cover=False is the verifier's positive control only."""
    W, H, FPS = CANVAS
    x, y, w, h = cover_rect()
    out = [{"op": "setProject", "set": {"name": name, "width": W, "height": H, "fps": FPS, "background": "#090D16"}},
           {"op": "addClip", "clip": {"id": "rz", "kind": "video", "track": "V1", "start": 0, "in": IN, "duration": DURATION,
            "mediaId": media_id, "props": {**CROP, "scale": START_SCALE}, "keyframes": ZOOM}}]
    if cover:
        out.append({"op": "addClip", "clip": {"id": "rz_cover", "kind": "shape", "mediaId": None, "track": "V2", "start": 0,
                    "duration": DURATION, "keyframes": ZOOM,
                    "props": {"x": 0, "y": 0, "scale": START_SCALE, "opacity": 1, "blend": "normal",
                              "shapes": [{"type": "rect", "name": "gift bar cover", "x": x, "y": y, "w": w, "h": h,
                                          "radius": 0, "fill": "#000000", "stroke": "none", "opacity": 1}]}}})
    return out
