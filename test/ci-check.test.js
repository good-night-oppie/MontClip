"use strict";
// AP.2 (MontClip #281 prep PR): the check script lists all tracked .js with
// `git ls-files`; an empty list, or one below the explicit baseline, must fail.
// These tests feed the pure `checkSource` the worst cases and assert it refuses.
const { test } = require("node:test");
const assert = require("node:assert");

const { checkSource, identityProblems, BASELINE_JS } = require("../.github/scripts/ci-check.js");

test("ci-check: an empty .js list is refused (0 files must fail)", () => {
  assert.throws(() => checkSource([], BASELINE_JS), /listed 0 \.js/);
});

test("ci-check: a list below the baseline is refused (shrink must fail)", () => {
  const reduced = ["server/server.js", "app.js", "server/cli.js"];
  assert.throws(() => checkSource(reduced, BASELINE_JS), /below the baseline/);
});

test("ci-check: a list at or above the baseline is accepted", () => {
  // A single real file, with a baseline of 1, exercises the happy path
  // (node --check actually runs) without spawning the whole 494-file walk.
  assert.strictEqual(checkSource(["server/cli.js"], 1), 1);
});

test("ci-check: a bare handle@users.noreply.github.com is refused (binds a real person)", () => {
  assert.deepStrictEqual(identityProblems(["bb@users.noreply.github.com"]), ["bb@users.noreply.github.com (bare handle binds a real person)"]);
});

test("ci-check: a [bot] address with the wrong numeric id is refused (App ID pasted as user ID)", () => {
  assert.deepStrictEqual(identityProblems(["5665927+bboppiexyz[bot]@users.noreply.github.com"]), ["5665927+bboppiexyz[bot]@users.noreply.github.com (unknown bot id 5665927)"]);
});

test("ci-check: team bot ids pass", () => {
  assert.deepStrictEqual(identityProblems([
    "354007710+bboppiexyz[bot]@users.noreply.github.com",
    "354633415+reviewinboxoppiexyz[bot]@users.noreply.github.com",
  ]), []);
});

test("ci-check: fake local addresses are refused", () => {
  assert.deepStrictEqual(identityProblems(["dev@localhost", "bot@machine.local"]), ["dev@localhost (fake local address)", "bot@machine.local (fake local address)"]);
});

test("ci-check: ordinary real addresses are not flagged", () => {
  assert.deepStrictEqual(identityProblems(["alice@example.com", "123456+alice@users.noreply.github.com"]), []);
});
