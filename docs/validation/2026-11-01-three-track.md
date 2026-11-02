# Three populated lanes: preserve visible video and audio

Independent branch based on public PR25 head460fd6ab6cf5a11224add33ce89797d5c4212ec5, not the PR26 agent port. VV reported V3 subtitles above V1 video/A1 audio left audio outside short viewport on that base.

Production change only changes initial content focus: prefer the closest actual video/audio row pair over the first occupied subtitle row. No track hidden-policy change, no project/undo mutation, no CSS/timeline-height change. Existing focus key prevents ordinary renders stealing scroll; existing gesture guard defers changes through completion/cancel. Additional nonselected lanes remain reachable by timeline scrolling. This does not guarantee arbitrary distant pairs/tall custom tracks all fit.

Red node --test test/timeline-content-view.test.js:7pass/1fail (A1 must be entirely visible). Green8/8 covers simple+advanced V3(text)/V1(video)/A1(audio), project/undo unchanged, manual scroll preserved, gesture deferral; previous drag/cancel regressions retained.

Real Windows Electron45.2.1 offscreen execution: node desktop/run-three-track.cjs <existing-electron.exe> <task-owned-synthetic.mp4>. Runner enforces input SHA2561c4e4a41621932a3a0af00edd23a93575ff95abcb52f9d243621e17f2fc30789,11GiB reserve,60s owned-process timeout. Existing320x180/30fps MP4412568bytes reused from task fixture, no newly generated media/runtime copy. First attempted imported optimized copy was rejected before launch by hash check; original fixture located and verified. Own profile suffixWORVS7, port23234. Original synthetic input imported normally; synthetic caption created with existing parser/clip constructor onV3 as fixture setup. Saved disk confirms V1 video/A1 audio/V3 text. No user media.

8 exact viewport cases804x535/630x452 ×simple/advanced ×assistant off/on. V1 row58/58 and clip51/51; A1 row42/42 and clip35/35 visible in every case. Preview at804316x178, at630161x91; bodyoverflow0; core/chat controls hit. Each case selects/splits/undos both content clips via CDP coordinates (16 split/undo operations). Advanced manual scroll not stolen on rerender. Exit0/COMPLETE/savedtrue. Log three-track-native. Windows executable reuses existing installation via explicit NODE_PATH, not packaged runtime. Approximate profile budget<64MiB, free before40,258,400,256bytes. Task profile retained, no deletion.

Visible VV/physical input/readscreen/Linux/macOS/release package not tested. This public-base validation is independent of PR26; eventual combined-tree test still required. No new strings/JJ copy. No merge/release.

Final Windows Node22.15.1 npm test603/603,0fail/skip/cancel; node .github/scripts/release-check.js exit0/24tools. Logs three-track-test/release.
