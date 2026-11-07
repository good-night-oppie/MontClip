# PR #189 证据摘要（原始数据已移出仓库）

#189 原先在 `docs/validation/` 下提交了 135 个原始证据文件（15,691,196 字节；其中文本 73 个、149,149 行）。为免撑大仓库，原件已从分支删除，完整复制到：

europa 审查机上的 `montclip-review/raw/pr189/` 目录

目录结构与原 `docs/validation/` 相同。同目录 `SHA256SUMS`（sha256 `bf2bb9ff70af7dfd987f937c1cecf7ddcfdc54ce3f235c9d1db1fce566e457ec`）列出全部 135 个文件；2026-11-07 在 europa 上 `sha256sum -c SHA256SUMS` 读回 135/135 OK。删除前的原件在提交 `7da4463406fbbfaf0b56d0dab9d82d6bc9438221` 的 git 历史中也仍可取回。

## 各组用途与关键结论

| 组 | 文件数 | 用途 | 关键数字 |
|---|---:|---|---|
| `2026-11-05-draft-existing-loop/` | 56 | run06：缺口卡加入、替换、撤销/重做、保存重开、删除、版本恢复的 simulated 闭环（程序生成素材） | runner 14/14 检查通过，cleanup 两进程均退出；4 份 ProRes 导出各 360 帧；卡/替换只改帧 240–299（[8,10)）；版本恢复 360/360 帧与基线一致；解码检查 12/13（唯一失败为尾音：源 576000 样本/声道，导出 573440，短 53.333ms） |
| `2026-11-05-draft-existing-loop-v2/` | 65 | v2-03：在 run06 基础上加卡重开、重开后删除/撤销、新页面上下文、持久化插入撤销 | runner 21/21 检查通过，cleanup 双 true，runner sha256 `7242ef7e…f44fc`；解码检查同为 12/13，失败项同上 |
| `2026-11-05-audio-tail-diagnostic/` | 12 | ProRes 结尾丢声音的诊断原始记录（ffmpeg 参数、输入帧、PTS、两份 stderr 调试日志、带/不带 `-shortest` 的探测） | **已由 #190 修复**，本分支已删除对应诊断脚本（`real-tests/audio-tail-*.cjs`）、runner 的 `--audio-tail-diagnostic` 模式和诊断文档 |
| `2026-11-05-cut-frame-regression.txt` | 1 | 切点定向回归完整日志 | 58/58 通过 |
| `2026-11-05-draft-interaction-tests.txt` | 1 | 草稿交互现状测试日志 | 59/59 通过 |

## #190 合并后的复跑（2026-11-07，Windows 本机）

在合并 `origin/main` 后的本分支上重跑留下的验收脚本：`node real-tests/draft-existing-loop.cjs <新目录>` 后 `node real-tests/draft-existing-check.cjs <同目录>`。Node 22.15.1，HeadlessChrome 156.0.8078.80，系统 FFmpeg 9.0.1 gyan.dev full（经 MONTCLIP_FFMPEG / MONTCLIP_FFPROBE 指定，非 bundled）。

- runner：completed=true，21/21 检查通过，cleanup 两进程均退出。
- 解码检查：13/13 通过。源与导出均为 576000 样本/声道，缺失 0ms；零偏移相关 0.99999997，增益比 0.99978。原来唯一的尾音失败项不再失败。
- 本次复跑的输出只留在本机，没有提交，也没有上传 europa。

## 文件清单

行数为 `wc -l`；PNG/MP4 为二进制，不计行数。路径相对于 `docs/validation/`（europa 上相对于 `raw/pr189/`）。

| 文件 | 用途 | 行数 | 字节 | sha256 |
|---|---|---:|---:|---|
| `2026-11-05-audio-tail-diagnostic/audio-tail-pair-report.json` | ProRes 尾音诊断原始记录（已由 #190 修复） | 213 | 7787 | `7275e51348e56dda0938e659a73a1606986fd09cab152c40b7ddcf3ed53b5a87` |
| `2026-11-05-audio-tail-diagnostic/audio-tail-pair-trace-report.json` | ProRes 尾音诊断原始记录（已由 #190 修复） | 219 | 7933 | `617332fa41410a604dad7caee64db9eb497820c3fd4b7f0c8e8192bc3f2576c6` |
| `2026-11-05-audio-tail-diagnostic/capture-transport.json` | ProRes 尾音诊断原始记录（已由 #190 修复） | 6 | 136 | `7a004e0ab58228f0d010ae1efed48faab3e47a641f4c2a126a5062032c247528` |
| `2026-11-05-audio-tail-diagnostic/input-frames.json` | ProRes 尾音诊断原始记录（已由 #190 修复） | 13374 | 333621 | `6519cab3446085df9b41c98a505ca77914a6b913ed5ff80637d6ae5e1348feaf` |
| `2026-11-05-audio-tail-diagnostic/local-media-manifest.json` | ProRes 尾音诊断原始记录（已由 #190 修复） | 56 | 1854 | `a16ebe0c3fb0db2c745af972a043883fbee5131cd7e84e2cfa8282ba8ff593c0` |
| `2026-11-05-audio-tail-diagnostic/receipt.json` | ProRes 尾音诊断原始记录（已由 #190 修复） | 201 | 6178 | `7c898dd1f9b0600ccaa6f22630148fb8f02cc31633b7399e9842127eb6ded237` |
| `2026-11-05-audio-tail-diagnostic/SHA256.json` | ProRes 尾音诊断原始记录（已由 #190 修复） | 57 | 1660 | `f7e18f4e569025758dff0feb49d89bb7731854acf98a168b04be0ed54b215093` |
| `2026-11-05-audio-tail-diagnostic/source-video-pts.json` | ProRes 尾音诊断原始记录（已由 #190 修复） | 10514 | 333272 | `211ae8a0a920a9cfdd654838c2f3d632daba48f7ca7a0e44474a2f15430dd5e5` |
| `2026-11-05-audio-tail-diagnostic/without-shortest-probe.json` | ProRes 尾音诊断原始记录（已由 #190 修复） | 36182 | 908911 | `bf63c752cdd006035f484fe4d3a339ac2a382a0259045f52abcb108df25301a2` |
| `2026-11-05-audio-tail-diagnostic/without-shortest-trace-stderr.txt` | ProRes 尾音诊断原始记录（已由 #190 修复） | 4310 | 727670 | `d68d34ef65bd0b1acc7770761863dfedd0f709084a1b213c9677b30c220ed5bb` |
| `2026-11-05-audio-tail-diagnostic/with-shortest-probe.json` | ProRes 尾音诊断原始记录（已由 #190 修复） | 36080 | 906349 | `2fd537c056919d607372cebde8c84aba432a51b122c36e3ca08dd60bcfc022bf` |
| `2026-11-05-audio-tail-diagnostic/with-shortest-trace-stderr.txt` | ProRes 尾音诊断原始记录（已由 #190 修复） | 4306 | 728593 | `1909c699eb83caa8020f45e90f98f24c426aff0c3b41e0e83c3241525df4760f` |
| `2026-11-05-cut-frame-regression.txt` | 切点定向回归完整日志 | 360 | 12638 | `6b5200cf14677737212b2cdb9131d58afc2f4e78396547772ad28d11064bae0e` |
| `2026-11-05-draft-existing-loop/00-original.json` | 该步工程快照 | 796 | 20382 | `c90de2d3851617b4bc6fc636079f05e5eb7135a93ae7b3ee3c394e07ac835e7c` |
| `2026-11-05-draft-existing-loop/00-original-decoded.framemd5` | 导出逐帧 framemd5 | 370 | 29014 | `130feec76a4eb3704a6d4be55815c69e6ad9a7bb1ed029fc664b349725ca928f` |
| `2026-11-05-draft-existing-loop/00-original-export.json` | 导出元数据与 MOV 哈希 | 145 | 3929 | `3b77289deee57824acf96fdfa6cb944b66c6351bc5968f9af1ff13d87077a4e4` |
| `2026-11-05-draft-existing-loop/00-original-export.png` | 导出抽帧 | 二进制 | 171875 | `de7db32541a59d7d564fac760feeb5b454cb29557b5e8babe76d6303986c8cbf` |
| `2026-11-05-draft-existing-loop/00-original-preview.png` | 该步预览画面 | 二进制 | 74092 | `11e7fae6f081e04576085d4fba69fdf13312ee28903600b4dcf7770c65fa6d34` |
| `2026-11-05-draft-existing-loop/00-original-pts.json` | 导出解码 PTS | 1510 | 24296 | `f7b55731f72708936c4efd3122b082b9abcbe5178ce61f0155db5b61262cb6c6` |
| `2026-11-05-draft-existing-loop/00-original-viewing-copy.mp4` | MOV 的 H.264 观看副本（非 MontClip 直接输出） | 二进制 | 1325181 | `482228791e5f5660db2a0166f9750113c933b6bc99fc7ed7bbbe5ca24f55af11` |
| `2026-11-05-draft-existing-loop/00-original-window.png` | 该步浏览器窗口截图 | 二进制 | 188357 | `41cb8ed19c151efa745f67fc25f7241b6b47accbf2aeb58f9a58f624b265bc3a` |
| `2026-11-05-draft-existing-loop/01-card.json` | 该步工程快照 | 886 | 22497 | `ef33a7db945d732c492eb5ebee2b6b201a6266d45b5c9bde0dbc00504aae3a49` |
| `2026-11-05-draft-existing-loop/01-card-decoded.framemd5` | 导出逐帧 framemd5 | 370 | 29014 | `c3932e86a7870ff7d2000883a8ce8db89d89fbd7d2bcfd32d9fbb62801816c36` |
| `2026-11-05-draft-existing-loop/01-card-export.json` | 导出元数据与 MOV 哈希 | 145 | 3930 | `416a3995f1751a4d64c35f233ecfd456c89e2ebab0898ceb6104722cbf0a4ca1` |
| `2026-11-05-draft-existing-loop/01-card-export.png` | 导出抽帧 | 二进制 | 69650 | `3f73b73dbe32907e6f737c3aa2fdcdc491629e1108bd8f8d76f8403921988863` |
| `2026-11-05-draft-existing-loop/01-card-preview.png` | 该步预览画面 | 二进制 | 28560 | `79c2e16dd7f7be4d2c68500f7a8e05ac0e12b378191e54cb4657055d9751428d` |
| `2026-11-05-draft-existing-loop/01-card-pts.json` | 导出解码 PTS | 1510 | 24296 | `76afc43abb6067da03f4f724fd73472249ae74e734a681efc5780859bbdc526d` |
| `2026-11-05-draft-existing-loop/01-card-viewing-copy.mp4` | MOV 的 H.264 观看副本（非 MontClip 直接输出） | 二进制 | 1158793 | `f79eca40789d9314dae179c3b1999e6a0704c5af9786d1af155e92cdbf163948` |
| `2026-11-05-draft-existing-loop/01-card-window.png` | 该步浏览器窗口截图 | 二进制 | 165339 | `2a779b79dd9e203c3f094f72a25f4add13a36b7e0d5653bb9f4deb6d6d8d5d11` |
| `2026-11-05-draft-existing-loop/02-replaced.json` | 该步工程快照 | 975 | 24600 | `9bffade8a0db4a319828274d6e2958aa7e5db8a2f9386e370b71a35f6f831e72` |
| `2026-11-05-draft-existing-loop/02-replaced-decoded.framemd5` | 导出逐帧 framemd5 | 370 | 29014 | `44b04fc1986ea648660afdd20768d5bf55418f11ac1c8a6e264c0467f96ccd4b` |
| `2026-11-05-draft-existing-loop/02-replaced-export.json` | 导出元数据与 MOV 哈希 | 145 | 3932 | `af7872c74ddb80373abdd4aa0e55d2b04986ec23d1a72bd3a0698b79560b935c` |
| `2026-11-05-draft-existing-loop/02-replaced-export.png` | 导出抽帧 | 二进制 | 2308 | `2e1f186ba4b7fc2b0fe9d30a261fd94d5377d7c0f3fd02a6fbe0200b372c3b2f` |
| `2026-11-05-draft-existing-loop/02-replaced-preview.png` | 该步预览画面 | 二进制 | 8956 | `7c00a2d6f3c0175d7523de8e85d72b9391937eaa776a733f08aa704807048c2e` |
| `2026-11-05-draft-existing-loop/02-replaced-pts.json` | 导出解码 PTS | 1510 | 24296 | `42446e8c7089651a1018ecb8cfc1d7f329a7c5070acb16f78ef4d9db4d790488` |
| `2026-11-05-draft-existing-loop/02-replaced-viewing-copy.mp4` | MOV 的 H.264 观看副本（非 MontClip 直接输出） | 二进制 | 1146639 | `4f6301cf18c81803ab1f681fc73fc088232939bf19937e367ad6f75a956e70d7` |
| `2026-11-05-draft-existing-loop/02-replaced-window.png` | 该步浏览器窗口截图 | 二进制 | 142915 | `4fa394eb8eaf04baffff1f989bcc30917ff1b28941cc77fbfc2975233266f2cf` |
| `2026-11-05-draft-existing-loop/03-undo-replace.json` | 该步工程快照 | 886 | 22497 | `35ca223e333eb6d2017ce63365e6239e2a9ccd229fa8e993ac69b5e98fa36c66` |
| `2026-11-05-draft-existing-loop/03-undo-replace-preview.png` | 该步预览画面 | 二进制 | 25960 | `2269597285ebd1a1ac09e57af638365504fc27f840dea083e8d8504d9c621008` |
| `2026-11-05-draft-existing-loop/03-undo-replace-window.png` | 该步浏览器窗口截图 | 二进制 | 144612 | `4416ea08c295946dc74aa7ccdbdb04fcd67b8354fa1539a5ed8fb8ec34be3906` |
| `2026-11-05-draft-existing-loop/04-undo-add.json` | 该步工程快照 | 796 | 20382 | `97acff5686e345fa0c766b6665492cfd9d6e7b2c3aa70597cad063c50c8c37eb` |
| `2026-11-05-draft-existing-loop/04-undo-add-preview.png` | 该步预览画面 | 二进制 | 74092 | `11e7fae6f081e04576085d4fba69fdf13312ee28903600b4dcf7770c65fa6d34` |
| `2026-11-05-draft-existing-loop/04-undo-add-window.png` | 该步浏览器窗口截图 | 二进制 | 188656 | `f0dc42f0e0c28375dc2502371023ce29cf1132676c8553d9fabd896262fc3540` |
| `2026-11-05-draft-existing-loop/05-redo-card.json` | 该步工程快照 | 886 | 22497 | `0cb4f2e1ac4d3e34827509c6f4688156628ed2407a00c76741e2ba6ed97c8866` |
| `2026-11-05-draft-existing-loop/05-redo-card-preview.png` | 该步预览画面 | 二进制 | 25960 | `2269597285ebd1a1ac09e57af638365504fc27f840dea083e8d8504d9c621008` |
| `2026-11-05-draft-existing-loop/05-redo-card-window.png` | 该步浏览器窗口截图 | 二进制 | 144665 | `cde72eaa1e4c28be49a42e8e359443a365014e54e0cc69313b0783ca127d2da3` |
| `2026-11-05-draft-existing-loop/06-redo-replace.json` | 该步工程快照 | 975 | 24600 | `a7d71e9f5242c5d3a1ceb4c7b1daeb724c8e8cf2a1107326081eea965a8ef263` |
| `2026-11-05-draft-existing-loop/06-redo-replace-preview.png` | 该步预览画面 | 二进制 | 6013 | `f93750ae52e75e88b892b281d658ee6441af5616cfe53479eb0d4ea1551b7fb1` |
| `2026-11-05-draft-existing-loop/06-redo-replace-window.png` | 该步浏览器窗口截图 | 二进制 | 123979 | `bd917b51ec13bea6d10ace6232247e0beda3654afaa31c4ea66a9a5b5a97ab8e` |
| `2026-11-05-draft-existing-loop/07-reopened.json` | 该步工程快照 | 974 | 24567 | `ad984a2821243fef2cba0e12d73bfcd26fb90dde4858434f593e825d657b216b` |
| `2026-11-05-draft-existing-loop/07-reopened-preview.png` | 该步预览画面 | 二进制 | 6013 | `f93750ae52e75e88b892b281d658ee6441af5616cfe53479eb0d4ea1551b7fb1` |
| `2026-11-05-draft-existing-loop/07-reopened-window.png` | 该步浏览器窗口截图 | 二进制 | 123544 | `f02d8620a954ac767a24d4dde9d8b6e631568fac89097f91d17309b67eb4de7c` |
| `2026-11-05-draft-existing-loop/08-deleted.json` | 该步工程快照 | 885 | 22472 | `ae3a68928b4376bfd84efc12543ec081b8db07c1a7ee96d884b2dcebaa6c97f3` |
| `2026-11-05-draft-existing-loop/08-deleted-preview.png` | 该步预览画面 | 二进制 | 6012 | `f5a6f05b7180cf1dbf72d342d1ce4da540f21bc72e73117b8df5482fc87a33d6` |
| `2026-11-05-draft-existing-loop/08-deleted-window.png` | 该步浏览器窗口截图 | 二进制 | 120158 | `e89aae6dc05b671320e9580e47525d3ba62ad86bcf4d3ea0f3a362b7e2051f28` |
| `2026-11-05-draft-existing-loop/09-version-restored.json` | 该步工程快照 | 796 | 20383 | `d8a60387480d6dc33442485869127ee114970165604dbeb69946702326f96460` |
| `2026-11-05-draft-existing-loop/09-version-restored-decoded.framemd5` | 导出逐帧 framemd5 | 370 | 29014 | `130feec76a4eb3704a6d4be55815c69e6ad9a7bb1ed029fc664b349725ca928f` |
| `2026-11-05-draft-existing-loop/09-version-restored-export.json` | 导出元数据与 MOV 哈希 | 145 | 3942 | `f5a3107f08b925ab369c8899e60b308786ae5d1e42f20b4d1d2c44f3e4b6d789` |
| `2026-11-05-draft-existing-loop/09-version-restored-export.png` | 导出抽帧 | 二进制 | 171875 | `de7db32541a59d7d564fac760feeb5b454cb29557b5e8babe76d6303986c8cbf` |
| `2026-11-05-draft-existing-loop/09-version-restored-preview.png` | 该步预览画面 | 二进制 | 74092 | `11e7fae6f081e04576085d4fba69fdf13312ee28903600b4dcf7770c65fa6d34` |
| `2026-11-05-draft-existing-loop/09-version-restored-pts.json` | 导出解码 PTS | 1510 | 24296 | `f7b55731f72708936c4efd3122b082b9abcbe5178ce61f0155db5b61262cb6c6` |
| `2026-11-05-draft-existing-loop/09-version-restored-viewing-copy.mp4` | MOV 的 H.264 观看副本（非 MontClip 直接输出） | 二进制 | 1325181 | `482228791e5f5660db2a0166f9750113c933b6bc99fc7ed7bbbe5ca24f55af11` |
| `2026-11-05-draft-existing-loop/09-version-restored-window.png` | 该步浏览器窗口截图 | 二进制 | 188162 | `8840d200d77cd08c325a7abe20e905076e4662b38f3cacce3fc3e190f2c68247` |
| `2026-11-05-draft-existing-loop/baseline-version.json` | 基线版本保存结果 | 14 | 253 | `284400d39ed92f7e64caa61ce64ce1480a5cf1c3150b2d1ece324db0fbe48094` |
| `2026-11-05-draft-existing-loop/decoded-checks.json` | 解码检查结果 | 224 | 4389 | `f21ad73328da022d815a32329a44862e0f9bda6f687820652465496a5548830a` |
| `2026-11-05-draft-existing-loop/original.mp4.source-pts.json` | 导出解码 PTS | 1486 | 30884 | `5f4e2c5af5a9e3c2ceb4a887608b2cb0e20b9bea18099e5af5e3f6fd24489ac0` |
| `2026-11-05-draft-existing-loop/receipt.json` | runner 回执（步骤、PID、cleanup） | 898 | 24820 | `0cbd719c7b8a91e6f238760c504ee9d4756ec687cac6800b7d1837392feb1a25` |
| `2026-11-05-draft-existing-loop/replacement.mp4.source-pts.json` | 导出解码 PTS | 286 | 6060 | `6c457ceb413a59bfd9969627e0670b8bd9cf4784f37d1fc70e398d6a524a700a` |
| `2026-11-05-draft-existing-loop/SHA256.json` | 原制品哈希清单 | 277 | 8201 | `4accceaffca74ccb7c92a0ed5c7b0b5be03622840632fbd43650c0145181a2b2` |
| `2026-11-05-draft-existing-loop-v2/00-original.json` | 该步工程快照 | 796 | 20382 | `7ca54b7a861806327544672b58f8714b8bf08dfc6c3dcc6bf9ea9b9c4fa79031` |
| `2026-11-05-draft-existing-loop-v2/00-original-decoded.framemd5` | 导出逐帧 framemd5 | 370 | 29014 | `130feec76a4eb3704a6d4be55815c69e6ad9a7bb1ed029fc664b349725ca928f` |
| `2026-11-05-draft-existing-loop-v2/00-original-export.json` | 导出元数据与 MOV 哈希 | 145 | 3929 | `b58e631fda554f7986239cd4a12d9906ef5e2ad7d05f746dc63d529f23632246` |
| `2026-11-05-draft-existing-loop-v2/00-original-export.png` | 导出抽帧 | 二进制 | 171875 | `de7db32541a59d7d564fac760feeb5b454cb29557b5e8babe76d6303986c8cbf` |
| `2026-11-05-draft-existing-loop-v2/00-original-preview.png` | 该步预览画面 | 二进制 | 74092 | `11e7fae6f081e04576085d4fba69fdf13312ee28903600b4dcf7770c65fa6d34` |
| `2026-11-05-draft-existing-loop-v2/00-original-pts.json` | 导出解码 PTS | 1510 | 24296 | `f7b55731f72708936c4efd3122b082b9abcbe5178ce61f0155db5b61262cb6c6` |
| `2026-11-05-draft-existing-loop-v2/00-original-window.png` | 该步浏览器窗口截图 | 二进制 | 188162 | `8840d200d77cd08c325a7abe20e905076e4662b38f3cacce3fc3e190f2c68247` |
| `2026-11-05-draft-existing-loop-v2/01-card.json` | 该步工程快照 | 886 | 22497 | `10dd87fe91e189ae282e3468fe6910eb7f21906a79d5fe70ad9642ee5b5de35f` |
| `2026-11-05-draft-existing-loop-v2/01-card-decoded.framemd5` | 导出逐帧 framemd5 | 370 | 29014 | `c3932e86a7870ff7d2000883a8ce8db89d89fbd7d2bcfd32d9fbb62801816c36` |
| `2026-11-05-draft-existing-loop-v2/01-card-export.json` | 导出元数据与 MOV 哈希 | 145 | 3930 | `fc713b8d809cfe1ace3ced58b6066175f9fc94612b39a1c8805edfb4a48784f2` |
| `2026-11-05-draft-existing-loop-v2/01-card-export.png` | 导出抽帧 | 二进制 | 69650 | `3f73b73dbe32907e6f737c3aa2fdcdc491629e1108bd8f8d76f8403921988863` |
| `2026-11-05-draft-existing-loop-v2/01-card-preview.png` | 该步预览画面 | 二进制 | 28560 | `79c2e16dd7f7be4d2c68500f7a8e05ac0e12b378191e54cb4657055d9751428d` |
| `2026-11-05-draft-existing-loop-v2/01-card-pts.json` | 导出解码 PTS | 1510 | 24296 | `76afc43abb6067da03f4f724fd73472249ae74e734a681efc5780859bbdc526d` |
| `2026-11-05-draft-existing-loop-v2/01-card-window.png` | 该步浏览器窗口截图 | 二进制 | 165339 | `2a779b79dd9e203c3f094f72a25f4add13a36b7e0d5653bb9f4deb6d6d8d5d11` |
| `2026-11-05-draft-existing-loop-v2/02-replaced.json` | 该步工程快照 | 975 | 24600 | `530a3588b48d81b5aea4a09da977fa3c1b1447695a51d2d27efdb4f4ef24d595` |
| `2026-11-05-draft-existing-loop-v2/02-replaced-decoded.framemd5` | 导出逐帧 framemd5 | 370 | 29014 | `44b04fc1986ea648660afdd20768d5bf55418f11ac1c8a6e264c0467f96ccd4b` |
| `2026-11-05-draft-existing-loop-v2/02-replaced-export.json` | 导出元数据与 MOV 哈希 | 145 | 3934 | `5404ee321f074cda7303df5c24934141837ccd8f56a507c7265b1060f063bd03` |
| `2026-11-05-draft-existing-loop-v2/02-replaced-export.png` | 导出抽帧 | 二进制 | 2308 | `2e1f186ba4b7fc2b0fe9d30a261fd94d5377d7c0f3fd02a6fbe0200b372c3b2f` |
| `2026-11-05-draft-existing-loop-v2/02-replaced-preview.png` | 该步预览画面 | 二进制 | 8956 | `7c00a2d6f3c0175d7523de8e85d72b9391937eaa776a733f08aa704807048c2e` |
| `2026-11-05-draft-existing-loop-v2/02-replaced-pts.json` | 导出解码 PTS | 1510 | 24296 | `42446e8c7089651a1018ecb8cfc1d7f329a7c5070acb16f78ef4d9db4d790488` |
| `2026-11-05-draft-existing-loop-v2/02-replaced-window.png` | 该步浏览器窗口截图 | 二进制 | 142867 | `6c11ff0f3b4cc4498066885ba33a4f293a0f4bfb39f84efe3d2281f960b9434f` |
| `2026-11-05-draft-existing-loop-v2/03-undo-replace.json` | 该步工程快照 | 886 | 22497 | `b197942597c3340a4801f04a1af28e7f6f0d2529d88c027ce093a58820d62a2d` |
| `2026-11-05-draft-existing-loop-v2/03-undo-replace-preview.png` | 该步预览画面 | 二进制 | 25960 | `2269597285ebd1a1ac09e57af638365504fc27f840dea083e8d8504d9c621008` |
| `2026-11-05-draft-existing-loop-v2/03-undo-replace-window.png` | 该步浏览器窗口截图 | 二进制 | 144581 | `9dc40c91bf8a8dd9053437e1d36a5da3980393bc68d0fccebff41b8885739bca` |
| `2026-11-05-draft-existing-loop-v2/04-undo-add.json` | 该步工程快照 | 796 | 20382 | `97acff5686e345fa0c766b6665492cfd9d6e7b2c3aa70597cad063c50c8c37eb` |
| `2026-11-05-draft-existing-loop-v2/04-undo-add-preview.png` | 该步预览画面 | 二进制 | 74092 | `11e7fae6f081e04576085d4fba69fdf13312ee28903600b4dcf7770c65fa6d34` |
| `2026-11-05-draft-existing-loop-v2/04-undo-add-window.png` | 该步浏览器窗口截图 | 二进制 | 188621 | `e4fe2ad37e4ea9708e61fa369e586b23a9fb4034d6a7607d6a71a89f89fd775b` |
| `2026-11-05-draft-existing-loop-v2/05-redo-card.json` | 该步工程快照 | 886 | 22497 | `277b786e9b9497aa09d0f40dff3048a3474b8d5d52a61d6bfda858a35e95a771` |
| `2026-11-05-draft-existing-loop-v2/05-redo-card-preview.png` | 该步预览画面 | 二进制 | 25960 | `2269597285ebd1a1ac09e57af638365504fc27f840dea083e8d8504d9c621008` |
| `2026-11-05-draft-existing-loop-v2/05-redo-card-window.png` | 该步浏览器窗口截图 | 二进制 | 144565 | `5fb287c4ee644bff5bae31b3fd2772cf5323583618be3cbab81fd2a25cdcdeb3` |
| `2026-11-05-draft-existing-loop-v2/06-redo-replace.json` | 该步工程快照 | 975 | 24600 | `a953319dfb6049b087d39507e3c21a234505f27c74fc33dbf3bd8f7d67e8aba1` |
| `2026-11-05-draft-existing-loop-v2/06-redo-replace-preview.png` | 该步预览画面 | 二进制 | 6013 | `f93750ae52e75e88b892b281d658ee6441af5616cfe53479eb0d4ea1551b7fb1` |
| `2026-11-05-draft-existing-loop-v2/06-redo-replace-window.png` | 该步浏览器窗口截图 | 二进制 | 123888 | `36807c00438b57f85c361af7803acefb1ef85fa09c3d43312df101b29df16ca2` |
| `2026-11-05-draft-existing-loop-v2/07-reopened.json` | 该步工程快照 | 974 | 24567 | `c002aced2380fe7f48840cbc9b8d42d1e1db9ab0ede9356eaf06218003207754` |
| `2026-11-05-draft-existing-loop-v2/07-reopened-preview.png` | 该步预览画面 | 二进制 | 6013 | `f93750ae52e75e88b892b281d658ee6441af5616cfe53479eb0d4ea1551b7fb1` |
| `2026-11-05-draft-existing-loop-v2/07-reopened-window.png` | 该步浏览器窗口截图 | 二进制 | 123544 | `f02d8620a954ac767a24d4dde9d8b6e631568fac89097f91d17309b67eb4de7c` |
| `2026-11-05-draft-existing-loop-v2/08-deleted.json` | 该步工程快照 | 885 | 22472 | `b64062545602ccbd875570bb22a17b35133f6632e4a7c78560006fc9aa5899b0` |
| `2026-11-05-draft-existing-loop-v2/08-deleted-preview.png` | 该步预览画面 | 二进制 | 6012 | `f5a6f05b7180cf1dbf72d342d1ce4da540f21bc72e73117b8df5482fc87a33d6` |
| `2026-11-05-draft-existing-loop-v2/08-deleted-window.png` | 该步浏览器窗口截图 | 二进制 | 120158 | `e89aae6dc05b671320e9580e47525d3ba62ad86bcf4d3ea0f3a362b7e2051f28` |
| `2026-11-05-draft-existing-loop-v2/09-version-restored.json` | 该步工程快照 | 796 | 20383 | `d8a60387480d6dc33442485869127ee114970165604dbeb69946702326f96460` |
| `2026-11-05-draft-existing-loop-v2/09-version-restored-decoded.framemd5` | 导出逐帧 framemd5 | 370 | 29014 | `130feec76a4eb3704a6d4be55815c69e6ad9a7bb1ed029fc664b349725ca928f` |
| `2026-11-05-draft-existing-loop-v2/09-version-restored-export.json` | 导出元数据与 MOV 哈希 | 145 | 3942 | `eb579b74faff2ae50dce13ea6e6ab6711fcc658d0c267ba1eafc18aa5c20a29c` |
| `2026-11-05-draft-existing-loop-v2/09-version-restored-export.png` | 导出抽帧 | 二进制 | 171875 | `de7db32541a59d7d564fac760feeb5b454cb29557b5e8babe76d6303986c8cbf` |
| `2026-11-05-draft-existing-loop-v2/09-version-restored-preview.png` | 该步预览画面 | 二进制 | 74092 | `11e7fae6f081e04576085d4fba69fdf13312ee28903600b4dcf7770c65fa6d34` |
| `2026-11-05-draft-existing-loop-v2/09-version-restored-pts.json` | 导出解码 PTS | 1510 | 24296 | `f7b55731f72708936c4efd3122b082b9abcbe5178ce61f0155db5b61262cb6c6` |
| `2026-11-05-draft-existing-loop-v2/09-version-restored-window.png` | 该步浏览器窗口截图 | 二进制 | 188162 | `8840d200d77cd08c325a7abe20e905076e4662b38f3cacce3fc3e190f2c68247` |
| `2026-11-05-draft-existing-loop-v2/10-card-before-reopen.json` | 该步工程快照 | 886 | 22498 | `90fcc7de2ae13b8d40e5116b2f75523c307e60eeb6037168fdeb78b1aabefece` |
| `2026-11-05-draft-existing-loop-v2/10-card-before-reopen-preview.png` | 该步预览画面 | 二进制 | 28560 | `79c2e16dd7f7be4d2c68500f7a8e05ac0e12b378191e54cb4657055d9751428d` |
| `2026-11-05-draft-existing-loop-v2/10-card-before-reopen-window.png` | 该步浏览器窗口截图 | 二进制 | 165301 | `6625168205cc983d474d07e49220ddea297abd4cf124ad6916075167b6949fb0` |
| `2026-11-05-draft-existing-loop-v2/11-card-reopened.json` | 该步工程快照 | 886 | 22498 | `90fcc7de2ae13b8d40e5116b2f75523c307e60eeb6037168fdeb78b1aabefece` |
| `2026-11-05-draft-existing-loop-v2/11-card-reopened-preview.png` | 该步预览画面 | 二进制 | 25960 | `2269597285ebd1a1ac09e57af638365504fc27f840dea083e8d8504d9c621008` |
| `2026-11-05-draft-existing-loop-v2/11-card-reopened-window.png` | 该步浏览器窗口截图 | 二进制 | 144316 | `8b7d4f0a9f84828d205efe674378947fe0f6edca0b552c40aea749a6f0473e68` |
| `2026-11-05-draft-existing-loop-v2/12-reopened-card-deleted.json` | 该步工程快照 | 796 | 20383 | `9401941b1b6091f67854527e274929cea7fd12e3bebc23d274c862e664353de7` |
| `2026-11-05-draft-existing-loop-v2/12-reopened-card-deleted-preview.png` | 该步预览画面 | 二进制 | 74092 | `11e7fae6f081e04576085d4fba69fdf13312ee28903600b4dcf7770c65fa6d34` |
| `2026-11-05-draft-existing-loop-v2/12-reopened-card-deleted-window.png` | 该步浏览器窗口截图 | 二进制 | 188774 | `0665cd17d4d82227b080965218808cc59a8603b2888941520223846bad617793` |
| `2026-11-05-draft-existing-loop-v2/13-reopened-card-edit-undo.json` | 该步工程快照 | 886 | 22498 | `45254cf92194ee816602eedb5648ee35e8b0cc86c091980eb9f18d08c457190f` |
| `2026-11-05-draft-existing-loop-v2/13-reopened-card-edit-undo-preview.png` | 该步预览画面 | 二进制 | 25960 | `2269597285ebd1a1ac09e57af638365504fc27f840dea083e8d8504d9c621008` |
| `2026-11-05-draft-existing-loop-v2/13-reopened-card-edit-undo-window.png` | 该步浏览器窗口截图 | 二进制 | 144731 | `7f756635837b8523d46b737c379078ed48bd15315dfd2e0a32cca1dedcb432a1` |
| `2026-11-05-draft-existing-loop-v2/14-persisted-insertion-undo.json` | 该步工程快照 | 796 | 20383 | `439a4868938ce763996309d1a5a478580da74086534f9fe6e32663611900510b` |
| `2026-11-05-draft-existing-loop-v2/14-persisted-insertion-undo-preview.png` | 该步预览画面 | 二进制 | 74092 | `11e7fae6f081e04576085d4fba69fdf13312ee28903600b4dcf7770c65fa6d34` |
| `2026-11-05-draft-existing-loop-v2/14-persisted-insertion-undo-window.png` | 该步浏览器窗口截图 | 二进制 | 188721 | `3cdc7d5ea751d9029350d148a8582d253a0104b69e6f96c9395ea39ecf0ea493` |
| `2026-11-05-draft-existing-loop-v2/baseline-version.json` | 基线版本保存结果 | 14 | 253 | `42b720786206274bef6a4e4c5be48c6a5221acd32d89b7503ff1d1c8d88b06fe` |
| `2026-11-05-draft-existing-loop-v2/decoded-checks.json` | 解码检查结果 | 224 | 4389 | `f21ad73328da022d815a32329a44862e0f9bda6f687820652465496a5548830a` |
| `2026-11-05-draft-existing-loop-v2/receipt.json` | runner 回执（步骤、PID、cleanup） | 1002 | 27100 | `fd9834a1650c5045ea8e9de424986d1fb187247b791d507026781da260fb34ad` |
| `2026-11-05-draft-existing-loop-v2/SHA256.json` | 原制品哈希清单 | 322 | 9640 | `c1a44e24ff260a476a0f68d85f600b80da79a8a5d3879b0e74384c1086424a45` |
| `2026-11-05-draft-interaction-tests.txt` | 草稿交互现状测试日志 | 364 | 15152 | `63b7aecab631ef3477320b06fc2b6192003e9d3dbff8f85a8e2b98c0d0cb0c48` |
