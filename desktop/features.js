'use strict';
// Features the main process turns on or off; the page can only read them (view-preload.js).
// On-device Chinese transcription is not in this release (Deja/JJ, 2026-11-02): a packaged build hides it
// and starts no transcription or model download, unless the main process is started with
// --montclip-dev-transcribe or MONTCLIP_DEV_TRANSCRIBE=1. A development build keeps it.
const transcribeEnabled = ({ isPackaged, argv = [], env = {} }) =>
  !isPackaged || argv.includes('--montclip-dev-transcribe') || env.MONTCLIP_DEV_TRANSCRIBE === '1';
module.exports = { transcribeEnabled };
