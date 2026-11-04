'use strict';
// Retired (138514e): this harness touched the shared system clipboard. Existing evidence is retained.
// No flag enables it. Future browser tests must use an isolated clipboard environment.
// Deja (2026-11-03): a retired smoke says so and exits 0, so it is never mistaken for a broken one (desktop/SMOKES.md).
process.stdout.write('MONTCLIP_PASTE_HARNESS_DISABLED (SKIPPED): retired, it used the shared system clipboard. Use controller/event tests or an isolated clipboard environment.\n');
