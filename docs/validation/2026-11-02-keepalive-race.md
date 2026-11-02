# Flaky export / frame tests: a keep-alive race in the tests (2026-11-02)

QQ saw `rest-api.test.js` "Fast JPEG image2pipe does not duplicate unique frames"
fail once in a full run while passing on its own (23/23). It is the same
problem as the `frame.test.js` contact-sheet failure in our own 10 saved runs
on main bc771db (1 of 10: `fetch failed` after 8.95 s; the same test took
0.9 s in most runs and up to 6 s under load).

## Timing

1. The test makes a request (`boot()`'s readiness check, or
   `/api/export/ffmpeg`). fetch keeps the connection open for reuse.
2. The test then runs ffmpeg **synchronously** (`execFileSync`): twelve JPEGs
   in the rest-api test, the fixture clip and `dominantRgb` in the frame
   test. The test process is frozen for that time. Under load it took up to
   8 s.
3. After 5 s idle the server (Node's default `keepAliveTimeout`) closes the
   connection. The test process cannot see the close while it is frozen.
   Normally fetch drops an idle connection itself before the server's
   timeout, but its timer cannot run either.
4. As soon as the process resumes, the next request is written to the
   closed connection and the server's side answers with a reset:
   `ECONNRESET`, which fetch reports as `fetch failed`.

So it fails only when the synchronous work outlasts 5 s, which happens under
load. It is not a server bug: the editor never blocks like this between
requests. Product code is unchanged.

## Reproduction (`2026-11-02-keepalive-race.cjs`, Windows, Node 22.15.1)

A real `server.js`; twelve child processes of 600 ms each (a gap of about
7.8 s); a fresh process per run. Raw output is in
`2026-11-02-keepalive-race.txt`.

| order | result |
|---|---|
| request, then synchronous children (the old tests) | 10 of 10 `ECONNRESET` |
| request, then the same children awaited | 0 of 10 |
| children first, then the server and the requests | 0 of 10 |

With twelve children of 450 ms each (a gap of about 6 s) it failed 0 of 4.
With 500 ms each it failed 2 of 4, so the race only opens once the gap is well
past 5 s.

## Fix (tests only, no timeout changed)

- `rest-api.test.js`: make the twelve JPEGs before the server starts. Check
  for ffmpeg the way the server does (`ffmpeg -version`).
- `frame.test.js`: `fixture()` and `dominantRgb()` run ffmpeg without blocking
  (spawn plus await). Every call site awaits them.

## After the fix

- `node --test test/frame.test.js test/rest-api.test.js`: 41/41.
- Full suite, Windows, 10 runs in a row with TAP output kept: 10 of 10 at
  562/562. Before the fix: 1 failure in 10, and QQ saw 1 more.
- Full suite on Linux (WSL, Node 20.19.3): 562/562.
- A clean run proves little against a race this rare. The evidence is the
  reproduction above: the old order fails every time, both fixed orders never.
