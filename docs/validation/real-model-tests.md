# Real-model tests (owner's split, 2026-11-02)

- **Unit** (`node --test`, also in CI): no network, substitutes only. `test/agent-format.test.js`.
- **Integration**: an OpenRouter free vision model through the product's own request path
  (`desktop/agent-service.js`, fixed endpoint `https://openrouter.ai/api/v1/chat/completions`).
  `MONTCLIP_REAL_MODELS=1 npm run test:integration`. Key only from `~/.openrouter-token`.
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

## Meta (Muse Spark), 2026-11-04

- **Unit** (`node --test`, CI): `test/agent-meta-provider.test.js` — a local HTTP server stands in for
  `api.meta.ai`. Configured as Meta, the product posts to `/v1/chat/completions` with `model: muse-spark-1.1`,
  `Authorization: Bearer <key>` and the format note first; the reply (a keep_ranges edit for 「把 3 到 5 秒删掉」)
  is applied by the editor's own `commitRangePlan` as one undo step and undone. 401 → AUTH (「密钥不对或没有权限…」),
  a wrong model name (400/404 "model … does not exist") → MODEL_INVALID (「模型名称不对…」). Made-up keys only.
  `test/meta-key-file.test.js` — the key-file rules below.
- **e2e**: `MONTCLIP_REAL_MODELS=1 xvfb-run -a npm run test:e2e:meta` on europa (`real-tests/run-meta-e2e.cjs`).
  Key only from `~/.meta-montclip`, mode 600, the owner's own file (`real-tests/meta-key-file.cjs`, the rules of
  #124: wider than 600, another user's, or Windows → not read, skipped with the reason). First two checks through
  the product's request path (a made-up key must read AUTH; a made-up model MODEL_INVALID), then the real app:
  new project with a synthetic 10 s recording, Meta chosen in the settings, 「把 3 到 5 秒删掉」, review (names
  api.meta.ai), approval in 手动, the timeline cut, Undo. Evidence: `real-model-e2e-meta/` (no key in it; checked).
