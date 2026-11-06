# #186 review fixes: owned runtime and one toolchain

2026-11-05, follow-up to QQ's review of `6b746827`.
Old evidence in `docs/validation/2026-11-05-privacy-cover/` is preserved byte
for byte. It remains historical rendering evidence, not proof that its original
harness had safe service ownership. No engine, privacy recipe, README or other
person's branch was changed in this follow-up.

## P1: service and browser ownership

The old harness reserved and released TCP ports, then spawned children. It
accepted HTTP 200 and a discovered browser target without proving ownership.
That could write a different editor's project following a bind race.

The first appended commit (`0342c671`) extracts that HTTP-200 and bare-tool-name
behaviour into a test boundary. Its five acceptance checks fail: external 200,
wrong readiness message and child exit each permit one PUT to a task-owned fake
service; both absolute-tool override checks select the wrong executable name.
These are synthetic boundary regressions, not new rendering measurements.

The fix uses the existing `test/desktop-server.test.js` protocol:

- `fork(server.js)` with `PORT=0`, explicit `HOST=127.0.0.1`, private data,
  desktop mode and a fresh 256-bit session token. The child's IPC
  `montclip-ready` message supplies the bound address; no released port is reused.
- Before opening an editor, read a random proof file present only in this run's
  workspace. Wrong message, wrong proof, startup error, exit or timeout aborts.
  The child lifetime remains checked before every CDP command and HTTP release.
- Chrome has a new exclusive profile and `--remote-debugging-pipe`. CDP uses only
  that child's fd 3/4; no HTTP `/json`, TCP debugging port or WebSocket endpoint
  can be adopted. Browser command-line arguments must contain the exact profile
  and pipe option. Targets use a fresh context and their own checked session ID.
- Requests to other HTTP origins are blocked. The owned origin receives the
  desktop session header. Child failure closes the CDP channel; cleanup only
  stops recorded children started by this run.

Eleven dedicated tests cover foreign 200, wrong handshake, premature exit,
occupied port, spawn error, a real IPC proof plus post-start exit, wrong browser
profile/TCP endpoint, wrong CDP session, empty PATH, competing PATH executables,
and invalid overrides. Foreign fixtures receive zero write requests and are
not stopped by the harness. Competing tools are disposable copies of Node,
so the test can observe which executable actually ran without installing tools.

## P2: one resolved FFmpeg/FFprobe pair

`resolveMediaTools` calls the repository's `ffmpeg-path.resolveTool` for both
programs. Source generation, decoding, version probes and the editor child all
use the same resolved absolute paths. Missing/invalid explicit overrides fail
instead of falling back to PATH. Actual paths and versions are recorded in
`out/privacy-owned-run1/results.json` and `out/privacy-toolchain-private.json`.
The public archive redacts personal directory prefixes by replacing tool paths,
retains versions/binary hashes, and records the original results hash. No public
path is presented as an actual executable location.

## CI diagnosis, not an environment assumption

[Original run 42139116725](https://github.com/good-night-oppie/MontClip/actions/runs/42139116725)
failed the existing `test/ffmpeg-path.test.js:142` scan:
`real-tests/privacy-cover.cjs: execFileSync('ffmpeg`.
Linux Node 18/20/22 each had 1732 tests: 1710 passed, 1 failed, 21 skipped.
Windows Node 22 had 1732: 1726 passed, 1 failed, 5 skipped. Syntax and release
readiness passed. [Base d51b27a run 42074023117](https://github.com/good-night-oppie/MontClip/actions/runs/42074023117)
was green; its scanner is identical and it has no new privacy harness.

The first local suite missed this because the scanner uses `git ls-files` and
the new harness had not been staged. This follow-up stages all new sources
before the full suite. No scanner exemption or blind workflow rerun was used.
Downloaded original CI logs remain at `out/ci186/run42139116725.zip`, SHA-256
`2993693b2d36cdf49a63033ad2a81d5bb5b94e5695ba689202d55a0d7bfe174a`.

## New validation and reproduction

```powershell
node --test test/privacy-runtime.test.js test/ffmpeg-path.test.js
$env:MONTCLIP_FFMPEG=(Get-Command ffmpeg).Source
$env:MONTCLIP_FFPROBE=(Get-Command ffprobe).Source
node real-tests/privacy-cover.cjs out/privacy-owned-new
node real-tests/privacy-cover-check.cjs out/privacy-owned-new/results.json blur
node real-tests/privacy-cover-check.cjs out/privacy-owned-new/results.json cover
npm test
node .github/scripts/release-check.js
```

Safety tests ran before the new real browser/export run. Focused suite: 18
tests, 17 passed, one missing-bundled-FFmpeg test skipped, zero failures.
Full suite after staging: 1743 tests, 1736 passed, 7 skipped, zero failures.
The seven skips remain missing models/bundled or pinned FFmpeg/POSIX checks.
Release check and `git diff --check` pass.

New rendering: Windows, Chrome 156.0.8078.80, Node 22.15.1, FFmpeg/FFprobe
9.0.1 gyan.dev full build. Runtime source at `5dc577a1` (subsequent test-fixture
copy and report changes do not change the harness). Five scenarios, 12 frames
per route: blur differs in 60/60 preview and 60/60 decoded export frames;
opaque cover differs in 0/60 preview and 0/60 export frames. Checker exit codes
are 1 and 0 respectively. All 240 PNGs and 20 real exports are newly generated.

New archive: `docs/validation/2026-11-05-privacy-owned/evidence.zip`, containing
per-frame images, exports, projects, results, first-failure and fixed safety
logs, and its own hash manifest. SHA-256:

- Archive: `43c2b3c04f26833880563b17bb3cf4011c781adfd90557452508386a86810b8a`
- Public results: `ba198e072090ec2f0c586e09251b9fe0986a5b9ca9fd9218a370ba59e1a620b8`
- Original local results: `9e6771ba0ce166e60ad509c57351fee093e8d6e2a1d651c5b5bdcb6548be8e7f`

Independent read-only review found no further concrete P1/P2; it did not run
the browser and is not QQ's approval. Linux rendering, Cindy visible-window
acceptance and real footage remain untested. Existing evidence-checker checks
are not relabelled as new rendering. Draft remains pending QQ and the named
team's review; no merge, installation or deployment.
