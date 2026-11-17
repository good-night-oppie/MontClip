/* Fast export's JPEG encoders (createJpegWorkers in app.js). A file of the app's own, not a blob: address: the desktop window's
   policy starts workers only from the app's files (QQ, #369) */
"use strict";
self.onmessage = async (e) => {
  const { id, bmp, quality } = e.data;
  try {
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext("2d", { alpha: false });
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    const blob = await c.convertToBlob({ type: "image/jpeg", quality: quality || 0.92 });
    const buf = await blob.arrayBuffer();
    self.postMessage({ id, buf }, [buf]);
  } catch (err) {
    try { bmp.close(); } catch {}
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
