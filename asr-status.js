/* Why transcription cannot run here, as one code (P8 — europa, 2026-11-05: the Cindy plugin's package had no
   desktop/asr-manifest.json, no engine and no VAD, and the agent only heard "the editor stopped reporting progress").
     code(status)    → "ASR_MANIFEST_MISSING" (no status at all: the engine's manifest is not in this copy of MontClip)
                     · "ASR_ENGINE_MISSING" (sherpa-onnx-node, its native part for this system, or the VAD)
                     · "ASR_MODEL_MISSING" · null when transcription can run
     userText(code)  → {zh, en}: JJ's final sentences for the user (2026-11-05). 「剪辑、导出照常能用」 is there because
                     import, cut and export were run on a computer without the transcription program (#165). The
                     model's size comes from desktop/asr-manifest.json.
     agentCode(code) → {code, missing: "manifest" | "engine" | "model", ids}: for the agent only, never shown to the user
     SAY[code]       → what fablecut_transcribe answers: all of the above.
     hidePaths(text) → the text with every absolute path cut to "…/<its last part>": an error that leaves this
                     computer's server for a page or an agent says which file, never where it is (QQ on #165).
   Zero dependencies; required by the server and the MCP server. Reading the manifest may fail (that is the first
   code), so it is read lazily and never throws here. */
"use strict";
const fs = require("fs");
const path = require("path");

function code(st) {
  if (!st) return "ASR_MANIFEST_MISSING";
  if (!(st.engine && st.engine.ready) || !(st.vad && st.vad.ready)) return "ASR_ENGINE_MISSING";
  if (!(st.asr && st.asr.ready)) return "ASR_MODEL_MISSING";
  return null;
}

function manifest() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, "desktop", "asr-manifest.json"), "utf8")); } catch { return null; }
}
/** A size as MontClip says it (JJ, 2026-11-05): MB of 1,000,000 bytes, rounded to 10 (243,371,218 → 240). The one
 *  function for it: these sentences, and the Cindy plugin's status card (its worker requires this file). */
function aboutMb(bytes) { return Math.round((+bytes || 0) / 1e6 / 10) * 10; }
/** The speech model's size from the manifest's bytes (约 240 MB for the pinned Paraformer files). */
function modelMb(m = manifest()) {
  const files = m && m.models && m.models.asr && m.models.asr.files;
  return files ? aboutMb(Object.values(files).reduce((n, f) => n + f.size, 0)) : null;
}
const nativePackage = (platform = process.platform, arch = process.arch) => "sherpa-onnx-" + (platform === "win32" ? "win" : platform) + "-" + arch;

function userText(c) {
  if (c === "ASR_MODEL_MISSING") {
    const mb = modelMb();
    return {
      zh: `还没装听写模型（约 ${mb} MB），现在还不能把说的话转成文字。装好以后再试一次。`,
      en: `The speech model isn't installed yet (about ${mb} MB), so speech can't be turned into text right now. Try again after it's installed.`,
    };
  }
  return {
    zh: "这台电脑上的 MontClip 还没有听写程序，现在还不能把说的话转成文字。剪辑、导出照常能用。",
    en: "MontClip on this computer doesn't have the transcription program yet, so speech can't be turned into text right now. Editing and exporting still work.",
  };
}

function agentCode(c) {
  const m = manifest();
  if (c === "ASR_MODEL_MISSING") return { code: c, missing: "model", ids: [m ? m.models.asr.id : "asr"] };
  if (c === "ASR_ENGINE_MISSING") {
    const v = m ? m.engine.packages.find((p) => p.name === "sherpa-onnx-node").version : "?";
    return { code: c, missing: "engine", ids: ["sherpa-onnx-node@" + v, nativePackage() + "@" + v, m ? m.engine.vad.file : "silero_vad.onnx"] };
  }
  return { code: c, missing: "manifest", ids: ["desktop/asr-manifest.json"] };
}

function say(c) {
  const u = userText(c);
  return "Transcription is not available on this computer (" + c + "): nothing was transcribed, and nothing was sent anywhere. " +
    "MontClip never fetches what is missing by itself, so do not try to.\n" +
    "Tell the user exactly this, in her language:\n  zh: 「" + u.zh + "」\n  en: \"" + u.en + "\"\n" +
    "For you only — never show this to the user: " + JSON.stringify(agentCode(c));
}
const CODES = ["ASR_MANIFEST_MISSING", "ASR_ENGINE_MISSING", "ASR_MODEL_MISSING"];
const SAY = {};
for (const c of CODES) Object.defineProperty(SAY, c, { enumerable: true, get: () => say(c) });

/* Recognize local roots, including file URLs and both UNC spellings, but not web URLs, relative paths or our
   own …/ replacement. Directory components can contain internal spaces (e.g. "Some One"). A component cannot
   end in whitespace: that separates the path from prose before another path. Keep the final filename and
   surrounding quotes/punctuation so errors remain useful, and a second pass produces exactly the same text. */
const PATH_ROOT = String.raw`(?<![\w.:/\\…])(?:file:[\\/]+(?:[a-z]:[\\/])?|[\\/]{2}\?[\\/](?:UNC[\\/]|[a-z]:[\\/])|[a-z]:[\\/]|[\\/]{2}|~[\\/]|/)`;
const PATH_COMPONENT = String.raw`[^\\/'"\x60\s,;:()<>\[\]{}。！？：](?:[^\\/'"\x60\r\n,;:()<>\[\]{}。！？：]*[^\\/'"\x60\s,;:()<>\[\]{}。！？：])?[\\/]`;
const PATH_END = String.raw`[^\\/'"\x60\s,;:()<>\[\]{}。！？：]*`;
const PATHS = new RegExp(PATH_ROOT + '(?:' + PATH_COMPONENT + ')*' + PATH_END, 'gi');
function hidePaths(text) {
  return String(text == null ? "" : text).replace(PATHS, (p) => {
    const last = p.split(/[\\/]+/).filter(Boolean).pop();
    return last && !/^[A-Za-z]:$/.test(last) && last !== "~" ? "…/" + last : "…";
  });
}

/** saved contains data-root-relative transcript paths, never local absolute paths. */
function incompleteText(error, saved) {
  const files = Array.isArray(saved) ? saved : saved ? [saved] : [];
  return '没听完。' + (files.length ? '已完成段落已保存到 ' + files.join(', ') + '。'
    : '尚无已完成段落。完成段落保存位置：analysis/transcripts/。') + hidePaths(String(error?.message || error || ''));
}
module.exports = { code, userText, agentCode, SAY, modelMb, aboutMb, hidePaths, incompleteText };

