# Meta Omnilingual ASR as a second speech model — checks, 2026-11-04

The owner: "其他那些 SenseVoice / Paraformer 不用动，加入 Meta 对应的开源模型，如果能找得到匹配的模型".

**The match.** Meta's open speech model that MontClip's engine can read is Omnilingual ASR (facebookresearch/omnilingual-asr,
Apache-2.0, 1600+ languages). k2-fsa/sherpa-onnx publishes an int8 ONNX export of its 300M CTC model, and
sherpa-onnx-node 2.0.1, the engine MontClip already ships, reads it (`modelConfig.omnilingual`; its types.js has
`OfflineOmnilingualAsrCtcModelConfig`). No new engine or package is needed.

| File | Size | SHA-256 |
|---|---|---|
| sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-int8-2025-11-12.tar.bz2 (github.com/k2-fsa/sherpa-onnx releases, asr-models) | 292571207 | cdcd0559c7c73efed54209a926e321afc914d046c5fdbf3665f00dc78180e5ed |
| model.int8.onnx | 365352120 | e7c4e54ee4c4c47829cc6667d5d00ed8ea7bef1dcfeef0fce766f77752a2726c |
| tokens.txt | 86423 | a7a044c52cb29cbe8b0dc1953e92cefd4ca16b0ed968177b6beab21f9a7d0b31 |
| LICENSE (Apache-2.0, "Copyright 2025 (c) Meta Platforms, Inc. and affiliates.") | 581 | a70a523bafbb595c2844104feb313d204904dac91c3d186c05f22a10a71c7a94 |

Downloaded and hashed on europa, 2026-11-04.

**Real runs on europa** (Linux, sherpa-onnx-node 2.0.1 from the package, 4 threads), through `asr-local.js` `transcribe`
(ffmpeg → silero VAD → recognizer → words), on the archive's own test sentences and Paraformer's public test sentence:

| Sound | Meta Omnilingual | Paraformer (unchanged) |
|---|---|---|
| en.wav (3.9 s) | "ask not what your country can do for you ask what you can do for your country" | the same |
| de.wav (2.8 s) | "les hat ein ende nur die wurst hat zwei" ("Alles hat ein Ende…": the first word clipped) | — |
| fr.wav (5.0 s) | "ne vous demandez pas ce que votre pays peut faire pour vous demandez-vous plutôt ce que vous pouvez faire pour lui" | — |
| en.wav + 1 s + 0.wav (Mandarin, 10.5 s) | the English, then "对我做了介绍啊什么我想说的是呢大家如果对我的研究感兴去呢" | "…感兴趣呢" (correct) |

Found on the way: a VAD segment that starts right on a word comes back empty, or in the wrong script (the English
sentence cut at 0.5 s gave ""; uncut it read correctly; cut and padded with 0.25 s of silence it read correctly again).
So each segment gets 0.25 s of silence on both sides, and the words' times are taken back to the file's.

Speed: 3.9 s of English in 3.3 s (the model already loaded), slower than Paraformer; loading the model takes a few
seconds the first time. For Mandarin, Paraformer stays the better and faster choice; Meta's model is for other
languages and for mixed ones.

**The app's own download path** (asr-models `download("asrMeta")` with asr-download `fetchFile` and the hosts written in
desktop/main.js), europa, 2026-11-04: from github.com (redirected to GitHub's file servers), 292 MB in 133 s, the archive's
SHA-256 checked, its two model files unpacked and checked, status `asrMeta: ready, where: user`; Paraformer's entry left
as it was. Not run: the consent box itself (a dialog; the desktop smokes answer it), and a transcription from the
Transcript tab in the desktop window.
