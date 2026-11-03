'use strict';
// Features the main process turns on or off; the page can only read them (view-preload.js).
// On-device transcription is in this release (#70, Deja 2026-11-03: sherpa-onnx with the Paraformer zh model, run by
// the local server). It is on in the package and in development; --montclip-no-transcribe or MONTCLIP_NO_TRANSCRIBE=1
// turns it off (a test, or a machine where it must not run).
const transcribeEnabled = ({ argv = [], env = {} }) =>
  !argv.includes('--montclip-no-transcribe') && env.MONTCLIP_NO_TRANSCRIBE !== '1';
module.exports = { transcribeEnabled };
