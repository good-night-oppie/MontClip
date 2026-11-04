# A transcription with parts the engine could not read (evidence)

Windows, fresh profile, hidden offscreen window, synthetic sound only. The speech engine is not run: the transcribe
request is answered as the server answers a partial transcription (one gap, 5–12 s of the file), so this is what the
page does with it. The picture is `capturePage` of the smoke's own window, no desktop capture.

    MONTCLIP_SHOTS_OUT=<this folder> electron desktop/asr-gaps-smoke.cjs --montclip-smoke --user-data-dir=<fresh>

- `smoke-output.txt` — ASR_GAPS_PASS and what it read.
- `asr-gaps-tab.png` — the toast (only part was transcribed: 1 part, 7 s, no subtitles there) and the Transcript tab
  listing the gap where it is on the timeline (the clip starts at 10 s: 0:15–0:22); the playhead is on it after a click.
  The tab also says the engine is missing: this smoke runs without one.

The engine side (a segment that throws, its halves, the gaps, partial / failed) is tested in `test/asr-gaps.test.js`
with a stand-in engine that throws basic_string::_S_create on chosen segments.
