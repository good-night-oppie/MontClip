# Chinese interface, batch 2: the Transcript panel (for JJ, 2026-11-02)

Deja set the scope:
- every visible string of the Transcript panel;
- the two mixed-language buttons (「按句选段 / Select sentences」, 「时间映射 / Mapping」), which now show one language;
- the top bar's connection status.

Batch 3: hover tooltips (`title`), dropdown options (model, language, caption style) and the shortcuts window. The project name is user content and is never translated.

Chinese transcripts carry sentence times only. No Chinese string here suggests cutting by individual words:
- the selection line in Chinese gives the length and the text, not a word count.

## SPEC terms reused (Rea, no change)
| key | English | 中文 |
|---|---|---|
| term.cancel | Cancel | 取消 |
| term.find-words | Find words | 查找词 |
| term.captions | Captions | 字幕 |
| term.add-captions | Add captions | 添加字幕 |
| term.import-2 | Import… | 导入… |
| term.cut | Cut | 剪切 |

Notes on these:
- `term.find-words` is the search box placeholder: 「查找词」, without the old ellipsis.
- `term.cut` is the button under a selection: 「剪切」.

## New own.* keys (not in the SPEC; please review)
| key | English | 中文 | where |
|---|---|---|---|
| own.transcribe | Transcribe | 转写 | main button, nothing to transcribe |
| own.transcribe-selected | Transcribe selected ({n}) | 转写所选（{n}） | main button, clips selected |
| own.transcribe-file | Transcribe {n} file | 转写 {n} 个文件 | main button, one file |
| own.transcribe-files | Transcribe {n} files | 转写 {n} 个文件 | main button, several files |
| own.found | {n} found | 找到 {n} 处 | matches of the search |
| own.cut-all | Cut all | 全部剪切 | cut every match (none yet) |
| own.cut-n | Cut {n} | 剪切 {n} 处 | cut every match |
| own.copy | Copy | 复制 | copy the transcript |
| own.select-sentences | Select sentences | 按句选段 | opens the sentence dialog |
| own.mapping | Mapping | 时间映射 | downloads the time map |
| own.caption-last | Caption last: a cut through a caption doesn't re-time its words, so add captions again after changing the edit. | 字幕最后再加：剪辑穿过字幕时，字幕的时间不会跟着重排，改完剪辑后请重新添加字幕。 | note under the caption row |
| own.tr-empty | Put clips with speech on the timeline, then transcribe them here. Speech becomes words in this browser; your audio never leaves it. | 先把有讲话的片段放到时间线上，再在这里转写。转写在本机完成，音频不会离开这台电脑。 | empty panel |
| own.tr-missing | No transcript yet: {names} | 还没有文稿：{names} | files without a transcript |
| own.tr-more |  +{n} more |  等 {n} 个 | after the first six names |
| own.loading | Loading… | 加载中… | while transcripts load |
| own.tr-no-words | No words in these clips. | 这些片段里没有转写出文字。 | transcripts without speech |
| own.tr-module-missing | Transcript module missing — reload the editor. | 文稿模块缺失，请重新加载编辑器。 | module failed to load |
| own.tr-downloading-model | Downloading the speech model (once)… {pct}% | 正在下载语音模型（只需一次）… {pct}% | progress, first time |
| own.tr-transcribing | Transcribing {name}… {pct}% | 正在转写 {name}… {pct}% | progress, one file |
| own.tr-transcribing-of | Transcribing {name} ({i} of {n})… {pct}% | 正在转写 {name}（第 {i} 个，共 {n} 个）… {pct}% | progress, several files |
| own.tr-selection | {n} words · {s} s · “{text}” | 已选 {s} 秒 · “{text}” | selection footer |
| own.tr-selection-one | 1 word · {s} s · “{text}” | 已选 {s} 秒 · “{text}” | selection footer, one item |
| own.connected | connected | 已连接 | top bar, server connected |
| own.local-session | local session | 本地会话 | top bar, no server |

Open questions for JJ:
1. 「全部剪切 / 剪切 N 处」 for Cut all / Cut N, following the SPEC's 剪切 for Cut. Fine?
2. In Chinese, the selection footer drops the word count: 「已选 3.2 秒 · “…”」. A count would be of words, which Chinese transcripts don't have. Fine?
3. 「字幕最后再加：…」 (caption-last) is rephrased so that it does not mention word timing.
4. The toasts and undo-step names these buttons raise ("No captions on the timeline yet…", "N words") are still English. Same batch, or later?
