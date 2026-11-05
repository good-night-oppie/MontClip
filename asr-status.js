/* Why transcription cannot run here, as one code (P8 — europa, 2026-11-05: the Cindy plugin's package had no
   desktop/asr-manifest.json, no engine and no VAD, and the agent only heard "the editor stopped reporting progress").
     code(status)  → "ASR_MANIFEST_MISSING" (no status at all: the engine's manifest is not in this copy of MontClip)
                   · "ASR_ENGINE_MISSING" (sherpa-onnx-node, its native part for this system, or the VAD)
                   · "ASR_MODEL_MISSING" · null when transcription can run
     SAY[code]     → what fablecut_transcribe answers: the code, that nothing was transcribed or sent, never to fetch
                     anything, and a sentence for the user in 「」 (drafts for JJ).
   Zero dependencies; required by the server and the MCP server. */
"use strict";

function code(st) {
  if (!st) return "ASR_MANIFEST_MISSING";
  if (!(st.engine && st.engine.ready) || !(st.vad && st.vad.ready)) return "ASR_ENGINE_MISSING";
  if (!(st.asr && st.asr.ready)) return "ASR_MODEL_MISSING";
  return null;
}

const NOTHING = "nothing was transcribed, and nothing was sent anywhere. MontClip never fetches it by itself, so do not try to. ";
const SAY = {
  ASR_MANIFEST_MISSING: "This copy of MontClip lacks the speech engine's manifest (desktop/asr-manifest.json; ASR_MANIFEST_MISSING): " + NOTHING +
    "Tell the user (draft, JJ to finalise): 「这份 MontClip 少了听写要用的文件，所以还不能把说的话转成文字。更新或重新安装 MontClip 可以补上。」",
  ASR_ENGINE_MISSING: "No speech engine on this computer (ASR_ENGINE_MISSING): " + NOTHING +
    "Tell the user (draft, JJ to finalise): 「这台电脑上的 MontClip 还没有听写程序，所以还不能把说的话转成文字。」 — then where it comes from: the 完整版 package of the desktop app has it; in Cindy, montclip_status says whether it is installed here.",
  ASR_MODEL_MISSING: "No speech model yet (ASR_MODEL_MISSING): " + NOTHING +
    "It is about 230 MB; the user downloads it after seeing where it comes from, its licence and agreeing, or imports her own copy. " +
    "Tell the user (draft, JJ to finalise): 「还没装听写模型（约 230 MB），所以还不能把说的话转成文字。装好以后再试一次。」",
};

module.exports = { code, SAY };
