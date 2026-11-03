# Chinese engine × model × download source comparison (evaluation only)

These scripts produced the numbers in the selection comparison on PR #70. They are not product code and
nothing here runs in MontClip. The test audio stays on the machine that runs them; it is not in the repository.

## Test data

Google FLEURS `cmn_hans_cn`, test split, CC BY 4.0, dataset revision `70bb2e84b976b7e960aa89f1c648e09c59f894dd`:

- `data/cmn_hans_cn/test.tsv` (sha256 `5734461648f816181d7dab5fc79204b18c4b9bc2cd5138225b25c72d18385d2`, 945 rows)
- `data/cmn_hans_cn/audio/test.tar.gz` (unpacked into `test/`)

1. `node pick-100.cjs <dir>` → `pick100.json`: 100 sentences (one audio file each), 3992 characters.
2. `node fleurs-build.cjs <dir> <ffmpeg>` →
   - `set100.wav`: the 100 files with 1 s of silence after each, 16 kHz mono, 20:28.18;
   - `ten.wav`: its first 10:00;
   - `ref100.txt`: the reference text. The comparison counts only letters, digits and CJK characters, which leaves 3990.

## Runs

- **sherpa-onnx** (`npm i sherpa-onnx-node@2.0.1` in a scratch directory, with `silero_vad.onnx`, 4 threads):
  `node bench-sherpa.cjs --kind paraformer|sensevoice --model <model.int8.onnx> --tokens <tokens.txt> --vad <silero_vad.onnx> --wav set100.wav --ref ref100.txt`.
  Add `ELECTRON_RUN_AS_NODE=1 electron` in front to run it inside Electron 45's Node.
- **Whisper** (the app itself, #70 head):
  `MONTCLIP_ASR_AUDIO=set100.wav MONTCLIP_ASR_TEXT=ref100.txt MONTCLIP_ASR_MODEL=base|small MONTCLIP_ASR_LANG=zh MONTCLIP_ASR_OUT=<json> electron desktop/offline-transcribe-smoke.cjs --montclip-smoke --user-data-dir=<fresh>`.
  Then `node t2s-cer.cjs <json> ref100.txt` gives the error rate twice:
  - as transcribed;
  - after converting traditional characters to simplified (opencc-js, used for evaluation only). Whisper mixes the two.

`cer.cjs`: NFKC, lower case, letters / digits / CJK only, Levenshtein distance ÷ reference length.
