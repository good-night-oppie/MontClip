# PR SOP 文件分类（待Deja核读）

分类是保守的路径门禁，不判断说明或实测是否真实。重命名前后路径分别核对；docs/demo/** 原样副本两类均排除，原路径是实际代码时仍触发。

## 本轮main实存核对

```json
{
  "repo": "good-night-oppie/MontClip",
  "head": "aba1d4c8b3329c756d425f6737a981621ebfa0be",
  "verified": [
    {
      "pattern": "app.js",
      "files": [
        "app.js"
      ]
    },
    {
      "pattern": "flv*.js",
      "files": [
        "flv-readable-range.js"
      ]
    },
    {
      "pattern": "proxy*.js",
      "files": [
        "proxy.js"
      ]
    },
    {
      "pattern": "denoise*.js",
      "files": [
        "denoise.js"
      ]
    },
    {
      "pattern": "repair*.js",
      "files": []
    },
    {
      "pattern": "faststart*.js",
      "files": []
    },
    {
      "pattern": "mcp-server.js",
      "files": [
        "mcp-server.js"
      ]
    }
  ],
  "excluded": [
    "docs/demo/**"
  ]
}
```

repair*.js、faststart*.js 在本次main根目录没有实存文件，不加入；已有desktop/repair*分类保留。

## good-night-oppie/MontClip

### 音画同步

- `export*.js`
- `render*.js`
- `compositor*.js`
- `clip*.js`
- `timeline*.js`
- `trim*.js`
- `segment-edits.js`
- `sequences.js`
- `reframe.js`
- `ffmpeg*.js`
- `media*.js`
- `desktop/ffmpeg*.js`
- `desktop/repair*.js`
- `desktop/desktop-export*.js`
- `server.js`
- `audio*.js`
- `auto-slices.js`
- `range-plan.js`
- `retime.js`
- `silence.js`
- `desktop/*export*`
- `desktop/*ffmpeg*`
- `desktop/*repair*`
- `desktop/*flv*`
- `plugins/montclip-cindy/node/**`
- `plugins/montclip-cindy/embed/*.js`
- `plugins/montclip-cindy/main*.js`
- `plugins/montclip-cindy/frame*.js`
- `plugins/montclip-cindy/build.cjs`
- `app.js`
- `flv*.js`
- `proxy*.js`
- `denoise*.js`
- `mcp-server.js`

### 外发三项

- `agent*.js`
- `external-limits.js`
- `import-url*.js`
- `transcribe.js`
- `desktop/agent*.js`
- `desktop/asr*.js`
- `desktop/asr*.json`
- `desktop/*download*.js`
- `desktop/*fetch*.cjs`
- `desktop/main.js`
- `.github/workflows/pr-sop.yml`
- `server.js`
- `desktop/*consent*`
- `plugins/montclip-cindy/node/**`
- `plugins/montclip-cindy/main.js`
- `plugins/montclip-cindy/build.cjs`
- `app.js`
- `bgremove-assets.js`
- `desktop/agent-off-smoke.cjs`
- `desktop/asr-gaps-smoke.cjs`
- `desktop/auto-slices-smoke.cjs`
- `desktop/av-sync-smoke.cjs`
- `desktop/card-lyrics-smoke.cjs`
- `desktop/chinese-names-smoke.cjs`
- `desktop/corrections-ui-smoke.cjs`
- `desktop/danmaku-keep-smoke.cjs`
- `desktop/danmaku-smoke.cjs`
- `desktop/events-smoke.cjs`
- `desktop/export-av-sync-smoke.cjs`
- `desktop/export-close-smoke.cjs`
- `desktop/export-download-smoke.cjs`
- `desktop/first-screen-smoke.cjs`
- `desktop/highlights-menu-smoke.cjs`
- `desktop/highlights-perf.cjs`
- `desktop/highlights-smoke.cjs`
- `desktop/lyrics-smoke.cjs`
- `desktop/m0-smoke.js`
- `desktop/media-names-smoke.cjs`
- `desktop/package-smoke.cjs`
- `desktop/slice-cards-smoke.cjs`
- `desktop/songs-smoke.cjs`
- `desktop/toast-more-smoke.cjs`
- `desktop/url-sentence-smoke.cjs`
- `docs/main.js`
- `docs/validation/2026-11-02-h264/sync-mf.cjs`
- `docs/validation/2026-11-02-keepalive-race.cjs`
- `docs/validation/2026-11-03-server-memory/mem-repro.cjs`
- `docs/validation/2026-11-03-server-memory/mem-upload.cjs`
- `mcp-server.js`
- `real-tests/bgremove-assets-byte-audit.cjs`
- `real-tests/bgremove-consent-browser-smoke.cjs`
- `real-tests/font-consent-browser-smoke.cjs`
- `real-tests/openrouter.integration.cjs`
- `real-tests/run-deepseek-e2e.cjs`
- `test/agent-meta-provider.test.js`
- `test/asr-offline.test.js`
- `test/asr-unavailable.test.js`
- `test/audio-r4.test.js`
- `test/backfill-merge.test.js`
- `test/bgremove-assets.test.js`
- `test/captions-api.test.js`
- `test/cindy-engine-split.test.js`
- `test/color.test.js`
- `test/delivery.test.js`
- `test/desktop-server.test.js`
- `test/error-codes-i18n.test.js`
- `test/export-audio-window.test.js`
- `test/export-claim.test.js`
- `test/export-close.test.js`
- `test/export-jobs.test.js`
- `test/export-p11.test.js`
- `test/fetch-ffmpeg.test.js`
- `test/ffmpeg-path.test.js`
- `test/file-names.test.js`
- `test/flv-browser-registration.test.js`
- `test/flv-import.test.js`
- `test/frame.test.js`
- `test/h264-encoder.test.js`
- `test/helpers.js`
- `test/history.test.js`
- `test/mask.test.js`
- `test/media-file-names.test.js`
- `test/projects.test.js`
- `test/prores-export-api.test.js`
- `test/proxy.test.js`
- `test/render-geometry.test.js`
- `test/repair-media.test.js`
- `test/rest-api.test.js`
- `test/server-memory.test.js`
- `test/signals.test.js`
- `test/song-scan.test.js`
- `test/transcribe-api.test.js`
- `test/transcribe-long.test.js`
- `scripts/pr-sop/*.mjs`
- `test/body-limit.test.js`
- `test/first-use-import.test.js`

### 排除

- `docs/demo/**`

## good-night-oppie/MontClip-Cindy

### 音画同步

- `node/lib.cjs`
- `node/worker.cjs`
- `embed/panel*.js`
- `main.js`
- `frame.js`
- `build.cjs`
- `engine`

### 外发三项

- `node/lib.cjs`
- `node/worker.cjs`
- `main.js`
- `build.cjs`
- `ffmpeg-banner.js`
- `.github/workflows/pr-sop.yml`
- `engine`
- `scripts/pr-sop/*.mjs`
- `embed/panel.js`
- `frame.js`
- `main-view.js`
- `test-tools/panel-e2e.cjs`
- `test-tools/panel-play-e2e.cjs`
- `test/packed.test.cjs`

### 排除



## main源码覆盖回归

network-coverage.test.mjs 只读main的JS/CJS/MJS blob，不导入或执行它们。CI读取当前origin/main固定SHA，打印SHA、总数、排除数及漏项；本地用已fetch的origin/main。fetch、https.request/get、http.request/get（明确本机且无覆盖选项除外）、net.connect/createConnection、new WebSocket 及常见Node导入别名均检查。出现接口但未命中外发路径表就失败并列文件/API/行号。注释跳过；浏览器执行字符串、模板、未知目的地保守计入。

测试、smoke和验证脚本的潜在接口也显式列入，不笼统放行test/**或全部文件。命中不表示该文件向云端发送主播数据：本机动态URL、测试替身也可能命中。维护者应在外发说明里如实写“仅本机/替身，无外传”；新文件需分类后才能通过。该静态扫描是接口回归，不证明发现任意混淆、计算属性或动态加载的联网行为。禁止的逆向路径不读源码；当前main被排除的JS均为docs/demo副本。

检查器及此扫描只执行固定检查代码；sop-pr-lint工作流仍然只读PR元数据，没有checkout或执行PR代码。源码扫描在既有测试流程运行，未给元数据工作流增加checkout、执行权限或依赖。
