# FLV effective presentation clock

Decision relayed by Deja and VV on 2026-11-01; this records a requirement, not
completed implementation or acceptance.

- Use the earliest effective presentation time as a common zero after accounting
  for edit lists, priming and preroll. Preserve relative audio/video offsets;
  never zero the streams independently to force frame-number alignment.
- Frame stepping and explicitly selected-frame cuts use actual video PTS.
  A cursor at an arbitrary time displays the frame covering that instant. These
  are different operations; seconds multiplied by nominal FPS is not a universal
  frame oracle. Preview/export share half-open ranges and boundary quantization.
- Report source PTS, normalized PTS and actual cut boundaries in acceptance.
  The current fixture's audio starts before video; frame 809 at 27 seconds is
  compatible with that offset, not by itself proof of an off-by-one defect.
- Keep PR5's timestamp-gap refusal. Holding video across a gap and matching the
  12/18-second pulses before it does not establish silence or synchronization
  after the gap. New post-gap audio/video evidence is required before relaxing it.

This lifecycle branch does not contain or replace PR5 and must not be used as a
reason to drop its guard during integration. It does not change the compositor.
