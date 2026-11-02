'use strict';
// Retired: this harness touched the shared system clipboard. Existing evidence is retained.
// No flag enables it. Future browser tests must use an isolated clipboard environment.
console.error('MONTCLIP_PASTE_HARNESS_DISABLED: shared system clipboard access is prohibited. Use controller/event tests or an isolated clipboard environment.');
process.exitCode = 1;
