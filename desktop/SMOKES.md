# 桌面 smoke 清单

除了 `package-smoke.cjs`，每个 smoke 都用全新的 profile 和隐藏的离屏窗口运行：

```
electron desktop/<文件> --montclip-smoke --user-data-dir=<新建的空目录>
```

成功时打印「成功标志」那一行。`test/smokes-current.test.js` 检查这份清单列出了 `desktop/` 里的每一个 smoke。

| 文件 | 成功标志 | 状态 |
|---|---|---|
| `agent-close-fault-smoke.cjs` | `MONTCLIP_SESSION_CLOSE_COMPLETE` | 在用 |
| `agent-errors-smoke.cjs` | `ERRORS_PASS` | 在用 |
| `agent-minimum-smoke.cjs` | `MONTCLIP_MINIMUM_COMPLETE` | 在用 |
| `agent-modes-smoke.cjs` | `MODES_PASS` | 在用 |
| `agent-narrow-smoke.cjs` | `NARROW_PASS` | 在用；`MONTCLIP_SHOTS_OUT` 存截图 |
| `agent-no-key-network-smoke.cjs` | `AGENT_NO_KEY_NETWORK_PASS` | 在用 |
| `agent-plan-smoke.cjs` | `PLAN_PASS` | 在用 |
| `agent-paste-smoke.cjs` | `MONTCLIP_PASTE_HARNESS_DISABLED (SKIPPED)`，退出码 0 | 已停用：会动系统剪贴板（138514e 起停用，没有开关能打开） |
| `asr-gaps-smoke.cjs` | `ASR_GAPS_PASS` | 在用 |
| `asr-smoke.cjs` | `ASR_SMOKE_PASS` | 在用 |
| `auto-slices-smoke.cjs` | `AUTO_SLICES_PASS` | 在用 |
| `av-sync-smoke.cjs` | `AV_SYNC_PASS` | 在用；需要 `MONTCLIP_AV_INPUT` 指向一段闪光加蜂鸣的测试视频 |
| `caption-quick-smoke.cjs` | `CAPTION_QUICK_PASS` | 在用 |
| `card-lyrics-smoke.cjs` | `CARD_LYRICS_PASS` | 在用；`MONTCLIP_SHOTS_OUT` 存截图 |
| `chinese-names-smoke.cjs` | `CN_NAMES_COMPLETE` | 在用 |
| `corrections-smoke.cjs` | `CORRECTIONS_PASS` | 在用 |
| `corrections-ui-smoke.cjs` | `CORRECTIONS_UI_PASS` | 在用；`MONTCLIP_SHOTS_OUT` 存截图 |
| `danmaku-keep-smoke.cjs` | `DANMAKU_KEEP_PASS` | 在用 |
| `danmaku-smoke.cjs` | `DANMAKU_COMPLETE` | 在用 |
| `dialogs-smoke.cjs` | `DIALOGS_PASS` | 在用；`MONTCLIP_SHOTS_OUT` 存截图 |
| `drop-reveal-smoke.cjs` | `REVEAL_COMPLETE` | 在用 |
| `events-smoke.cjs` | `EVENTS_PASS` | 在用 |
| `export-av-sync-smoke.cjs` | `AV_EXPORT_PASS` | 在用 |
| `export-close-smoke.cjs` | `CLOSE_PASS` | 在用 |
| `export-download-smoke.cjs` | `EXPORT_DOWNLOAD_COMPLETE` | 在用 |
| `flv-native-smoke.cjs` | `FLV_NATIVE_COMPLETE` | 在用 |
| `first-screen-smoke.cjs` | `FIRST_SCREEN_PASS` | 在用；`MONTCLIP_SHOTS_OUT` 存截图 |
| `highlights-smoke.cjs` | `HIGHLIGHTS_COMPLETE` | 在用 |
| `hidden-smoke.cjs` | `HIDDEN_PASS` | 在用；`MONTCLIP_SHOTS_OUT` 存截图 |
| `keep-ranges-smoke.cjs` | `KEEP_RANGES_PASS` | 在用 |
| `lyrics-smoke.cjs` | `LYRICS_PASS` | 在用 |
| `media-names-smoke.cjs` | `MEDIA_NAMES_PASS` | 在用 |
| `more-sessions-smoke.cjs` | `MORE_PASS` | 在用 |
| `narrow-630-smoke.cjs` | `NARROW630_COMPLETE` | 在用 |
| `narrow-layout-smoke.cjs` | `LAYOUT_MONITOR_MENU_PASS` | 在用 |
| `narrow-pane-smoke.cjs` | `NARROW_COMPLETE` | 在用 |
| `official-pane-smoke.cjs` | `OFFICIAL_COMPLETE` | 在用 |
| `package-smoke.cjs` | `PACKAGE_SMOKE_COMPLETE` | 在用；用 node 运行：`node desktop/package-smoke.cjs <打好的 zip>` |
| `remove-connection-smoke.cjs` | `REMOVE_COMPLETE` | 在用 |
| `review-body-smoke.cjs` | `REVIEW_PASS` | 在用 |
| `sentence-button-smoke.cjs` | `SENTENCE_BUTTON_COMPLETE` | 在用 |
| `sentence-dialog-smoke.cjs` | `SD_PASS` | 在用 |
| `simple-primary-smoke.cjs` | `MONTCLIP_TIMELINE_COMPLETE` | 在用 |
| `simple-shortcuts-smoke.cjs` | `SIMPLE_KEYS_COMPLETE` | 在用 |
| `slice-cards-smoke.cjs` | `SLICE_CARDS_PASS` | 在用；`MONTCLIP_SHOTS_OUT` 存截图 |
| `songs-smoke.cjs` | `SONGS_PASS` | 在用 |
| `source-follow-smoke.cjs` | `SOURCE_FOLLOW_PASS` | 在用；需要 `MONTCLIP_FFMPEG_DIR`，PATH 上不能有 ffmpeg；`MONTCLIP_SF_TIMING=1` 另量 30 / 60 帧导出耗时 |
| `three-track-smoke.cjs` | `MONTCLIP_TIMELINE_COMPLETE` | 在用 |
| `timeline-content-smoke.cjs` | `MONTCLIP_TIMELINE_COMPLETE` | 在用 |
| `timeline-drag-smoke.cjs` | `MONTCLIP_DRAG_COMPLETE` | 在用 |
| `toast-more-smoke.cjs` | `TOAST_MORE_PASS` | 在用；`MONTCLIP_SHOTS_OUT` 存截图 |
| `url-sentence-smoke.cjs` | `URL_SENTENCE_COMPLETE` | 在用 |
| `zh-batch3-smoke.cjs` | `ZH3_COMPLETE` | 在用 |
| `zh-batch4-smoke.cjs` | `ZH4_PASS` | 在用 |
| `zh-batch5-smoke.cjs` | `ZH5_PASS` | 在用 |
| `zh-terms-smoke.cjs` | `TERMS_COMPLETE` | 在用 |
| `zh-transcript-smoke.cjs` | `TR_PASS` | 在用 |
