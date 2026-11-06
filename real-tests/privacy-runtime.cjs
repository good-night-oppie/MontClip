'use strict';
// Testable runtime boundary for the synthetic privacy harness.
const { once } = require('node:events');
async function serverLease(child, options) {
  const [msg] = await once(child, 'message');
  const origin = msg.origin;
  if (!(await fetch(origin + '/api/project')).ok) throw Error('not ready');
  return { origin, assertAlive() {}, headers: {} };
}
function resolveMediaTools() { return { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' }; }
module.exports = { serverLease, resolveMediaTools };
