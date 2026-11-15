/* Fixed MediaPipe bytes, checked before any third-party code runs. No fetch on module load.
   Package metadata and license provenance: licenses/mediapipe/README.md. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipBgAssets = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const VERSION = "0.1.1675465747";
  const BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@" + VERSION + "/";
  // SHA-256/base64 and exact sizes, cross-checked against two metadata inventories.
  const FILES = Object.freeze(Object.fromEntries([
    ["selfie_segmentation.js", 44542, "pHINLSN07J3zUQRh/xhqSvQn+1vUAjdeE1h1qZFGfaM="],
    ["selfie_segmentation.binarypb", 362, "AAe+QsdU8REGPAEhu6cQSIC3xWJ306loHNyxdwkjau4="],
    ["selfie_segmentation.tflite", 249024, "jRO3+udK9iXGQSJoE2FqIRe9a8oZ6zt1V0Yh/AhVfyc="],
    ["selfie_segmentation_landscape.tflite", 249792, "Sq/mIju42sb6yMqO1WhShwozBR7z9iOIItKCoQmWKJQ="],
    ["selfie_segmentation_solution_simd_wasm_bin.data", 0, "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="],
    ["selfie_segmentation_solution_simd_wasm_bin.js", 276493, "lAbn4whDvcoYlonUvqQT8+Ro9x44FWDlg+8SeS0m1Go="],
    ["selfie_segmentation_solution_simd_wasm_bin.wasm", 5694839, "2T5zZ37x/nkf9UBwg8D5ztbWBQpwW9bCCCP8BZGdjcQ="],
    ["selfie_segmentation_solution_wasm_bin.js", 276488, "7VmFjBTJ2ybTSrvwr6kBflxlg6atY9rmPS/kLhmr/qU="],
    ["selfie_segmentation_solution_wasm_bin.wasm", 5587523, "N2ZSdv2OOFiaKLB93sgFJm77G3oaUv02Zn7xHf9DqEc="],
  ].map(([name, size, sha256]) => [name, Object.freeze({ size, sha256 })])));
  const error = (code) => Object.assign(new Error(code), { code });
  const mime = (name) => name.endsWith(".js") ? "text/javascript" : name.endsWith(".wasm") ? "application/wasm" : "application/octet-stream";
  function source(name) {
    if (!Object.hasOwn(FILES, name)) throw error("BG_REMOVE_ASSET_NOT_ALLOWED");
    return BASE + name;
  }
  async function verify(name, bytes, crypto = globalThis.crypto) {
    const spec = FILES[name];
    if (!Object.hasOwn(FILES, name)) throw error("BG_REMOVE_ASSET_NOT_ALLOWED");
    if (!crypto?.subtle) throw error("BG_REMOVE_ASSET_CRYPTO_UNAVAILABLE");
    if (bytes.byteLength !== spec.size) throw error("BG_REMOVE_ASSET_INTEGRITY");
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const base64 = btoa(String.fromCharCode(...digest));
    if (base64 !== spec.sha256) throw error("BG_REMOVE_ASSET_INTEGRITY");
  }
  async function readBounded(response, size) {
    if (!response.body?.getReader) throw error("BG_REMOVE_ASSET_STREAM_UNAVAILABLE");
    const reader = response.body.getReader(), chunks = [];
    let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > size) throw error("BG_REMOVE_ASSET_INTEGRITY");
        chunks.push(value);
      }
    } catch (e) { try { await reader.cancel(); } catch {} throw e; }
    finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  }
  /* Dependency injection only supplies browser primitives for synthetic tests. The file allowlist,
     version, byte counts and expected hashes cannot be overridden by a project or a caller. */
  async function load(consent, platform = globalThis) {
    if (consent !== true) throw error("BG_REMOVE_CONSENT_REQUIRED");
    if (!platform.crypto?.subtle) throw error("BG_REMOVE_ASSET_CRYPTO_UNAVAILABLE");
    const verified = new Map();
    // Complete verification before constructing any executable URL (including entry JS).
    for (const [name, spec] of Object.entries(FILES)) {
      const url = source(name);
      const response = await platform.fetch(url, {
        integrity: "sha256-" + spec.sha256, credentials: "omit", redirect: "error",
        referrerPolicy: "no-referrer", cache: "no-store",
      });
      if (!response.ok || response.redirected || response.url !== url) throw error("BG_REMOVE_ASSET_RESPONSE");
      const bytes = await readBounded(response, spec.size);
      await verify(name, bytes, platform.crypto);
      verified.set(name, bytes);
    }
    const urls = new Map();
    const dispose = () => { for (const url of urls.values()) platform.URL.revokeObjectURL(url); urls.clear(); };
    try {
      for (const [name, bytes] of verified) urls.set(name, platform.URL.createObjectURL(new platform.Blob([bytes], { type: mime(name) })));
    } catch (e) { dispose(); throw e; }
    return Object.freeze({
      locateFile(name) {
        if (!Object.hasOwn(FILES, name) || !urls.has(name)) throw error("BG_REMOVE_ASSET_NOT_ALLOWED");
        return urls.get(name);
      },
      dispose,
    });
  }
  return Object.freeze({ VERSION, BASE, FILES, source, verify, load });
});
