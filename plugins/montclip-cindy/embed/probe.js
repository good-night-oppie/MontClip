/* Spike probe, framed by the MontClip main view inside Cindy: can a <video> in this sandbox play a
   large local recording from the engine and seek in it? Each measurement goes to /__cindy/log. */
(async function () {
  const q = new URLSearchParams(location.search);
  const src = q.get('src') || '';
  const log = (kind, data) => fetch('/__cindy/log', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ kind, src }, data)) }).catch(() => {});
  await log('probe-start', { href: location.href, where: q.get('where'), ancestorOrigins: Array.from(location.ancestorOrigins || []), ua: navigator.userAgent });
  const v = document.getElementById('v');
  const once = (ev, ms) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(ev + ' timed out after ' + ms + ' ms')), ms);
    v.addEventListener(ev, () => { clearTimeout(t); res(); }, { once: true });
    v.addEventListener('error', () => { clearTimeout(t); rej(new Error('video error ' + (v.error && v.error.code) + ' ' + (v.error && v.error.message))); }, { once: true });
  });
  try {
    // 1. a byte range straight from the engine (what <video> asks for when it seeks)
    const r = await fetch(src, { headers: { Range: 'bytes=1000000-1000999' } });
    await log('range', { status: r.status, contentRange: r.headers.get('content-range'), bytes: (await r.arrayBuffer()).byteLength });
    // 2. SSE from the engine (how the editor hears about agent edits)
    const sse = await new Promise((res) => {
      const es = new EventSource('/api/events');
      const t = setTimeout(() => { es.close(); res('timeout'); }, 4000);
      es.onmessage = () => { clearTimeout(t); es.close(); res('open'); };
      es.onerror = () => { clearTimeout(t); es.close(); res('error'); };
    });
    await log('sse', { state: sse });
    // 3. metadata, playback, seeks
    let t0 = performance.now();
    v.src = src;
    await once('loadedmetadata', 20000);
    await log('metadata', { ms: Math.round(performance.now() - t0), duration: v.duration, w: v.videoWidth, h: v.videoHeight });
    t0 = performance.now();
    await v.play();
    await new Promise((res) => setTimeout(res, 2000));
    const played = v.currentTime;
    v.pause();
    let frames = null;
    try { const pq = v.getVideoPlaybackQuality(); frames = { total: pq.totalVideoFrames, dropped: pq.droppedVideoFrames }; } catch (e) { }
    await log('play', { advancedSeconds: +played.toFixed(3), wallMs: Math.round(performance.now() - t0), frames });
    const marks = [0.5, 0.1, 0.9, 0.33, 0.75].map((f) => +(v.duration * f).toFixed(2));
    const seeks = [];
    for (const t of marks) {
      t0 = performance.now();
      v.currentTime = t;
      await once('seeked', 20000);
      seeks.push({ to: t, ms: Math.round(performance.now() - t0), readyState: v.readyState, at: +v.currentTime.toFixed(3) });
    }
    await log('seeks', { seeks });
    await log('probe-done', { ok: true });
  } catch (e) {
    await log('probe-done', { ok: false, error: String(e && e.message || e) });
  }
})();
