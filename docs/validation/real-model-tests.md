# Real-model tests (owner's split, 2026-11-02)

- **Unit** (`node --test`, also in CI): no network, substitutes only. `test/agent-format.test.js`.
- **Integration**: an OpenRouter free vision model through the product's own request path
  (`desktop/agent-service.js`, fixed endpoint `https://openrouter.ai/api/v1/chat/completions`).
  `MONTCLIP_REAL_MODELS=1 npm run test:integration`, on europa only. Key only from `~/.openrouter-montclip`
  (mode 600), or the file `MONTCLIP_OPENROUTER_KEY_FILE` names; a file with wider permissions is refused and the tests
  are skipped with the reason (`real-tests/key-file.cjs`). There is no fallback file.
- **e2e**: DeepSeek Flash (`deepseek-flash`, from `api.deepseek.com/models`) in the real desktop
  app, visible window, fresh profile. `MONTCLIP_REAL_MODELS=1 npm run test:e2e`. Key only from
  `~/.deepseek-serena-api-key`, typed into the password field by the test.
- Off unless `MONTCLIP_REAL_MODELS=1`; not in CI; CI holds neither key. 429 / upstream / timeout /
  network are reported as **skipped (reason)**, never as passed. Keys never appear in output
  (checked after each run).

Runs on 2026-11-02 (Windows 11):

| Level | Model | Passed | Skipped | Failed | Evidence |
|---|---|---|---|---|---|
| Integration | `nvidia/nemotron-3.5-super-vl:free` | 3 | 0 | 0 | `real-model-integration.json` |
| Integration | `google/gemma-4-31b-it:free` | 1 | 2 (429 upstream) | 0 | `real-model-integration-gemma-429.json` |
| e2e | `deepseek-flash` | 1 | 0 | 0 | `real-model-e2e/` (review, reply, applied screenshots) |

What passed: the plain request "只保留这两句" (no format instructions typed by the user) came back
as a usable proposal from both models, thanks to the format note the product now sends; an
ordinary question got an ordinary answer; a wrong key is reported as AUTH; in the e2e run the
review showed the format note and api.deepseek.com, the reply showed the proposal button, the
proposal applied through the existing sentence dialog and undo restored the clips.
Only synthetic subtitles were sent.
