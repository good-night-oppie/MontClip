"use strict";
// AP.2 (MontClip #281 prep PR): the check script lists all tracked .js with
// `git ls-files`; an empty list, or one below the explicit baseline, must fail.
// These tests feed the pure `checkSource` the worst cases and assert it refuses.
const { test } = require("node:test");
const assert = require("node:assert");

const { checkSource, BASELINE_JS } = require("../.github/scripts/ci-check.js");

test("ci-check: an empty .js list is refused (0 files must fail)", () => {
  assert.throws(() => checkSource([], BASELINE_JS), /listed 0 \.js/);
});

test("ci-check: a list below the baseline is refused (shrink must fail)", () => {
  const reduced = ["server.js", "app.js", "cli.js"];
  assert.throws(() => checkSource(reduced, BASELINE_JS), /below the baseline/);
});

test("ci-check: a list at or above the baseline is accepted", () => {
  // A single real file, with a baseline of 1, exercises the happy path
  // (node --check actually runs) without spawning the whole 494-file walk.
  assert.strictEqual(checkSource(["cli.js"], 1), 1);
});
