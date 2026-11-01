# Archived release workflows — not executable Actions entries

These two files were moved byte-for-byte from `.github/workflows/` as preparation
for restoring CI on this fork. GitHub workflow discovery must retain only `ci.yml`
in `.github/workflows/`. Do not restore these paths as part of CI activation.
No publishing or announcement is authorized by this archive.

Source: main commit `579b08ec1a789baec5cbf06d7430373460508d09`.
Local file SHA256 before and after moving (identical):

| File | SHA256 |
| --- | --- |
| announce-release.yml | 67d80c0b3a9d6d0106405cb28344a9ee9978f565d7df74e8807e0a2640b3c18a |
| publish-npm.yml | 6e2cf3c7b655ac2327de146a818b73bae8452429c511ba14eeaeefbb159fcc67 |

Git rename detection and identical original/destination blob IDs also verify
preservation independently of checkout line-ending policy. `ci.yml` retains blob
`e71c656c999656efaa5097aedc66611a3eda743c`; tests and protection rules are unchanged.

## Activation handoff (not performed by this change)

1. QQ reviews the maintenance PR; Deja decides whether it may land on main.
2. After the reviewed change is on main, Cindy coordinates clearing GitHub's
   fork activation gate. This PR does not click bulk enable, activate workflows,
   modify repository permissions, or merge itself.
3. Verify only CI is registered/active and both release workflows are absent or
   disabled. If that cannot be established, do not trigger a test run yet.
4. Coordinate exactly one PR1 close/reopen, after verifying its head remains
   `b937d2b2eba6a1afdb94172dba5167bdb3ee140d` with its owner/reviewers.
5. Verify a run on that exact head and five jobs: Tests (Node 18, 20, 22),
   Syntax & sanity, Release readiness. No run/green result is claimed here.

The authenticated Actions UI reported the fork activation gate. Repository
`enabled=true` is a separate policy; selective CI enable returned 404 and an
organization-policy read returned 403. Neither proves an organization blocker.

## Other release surfaces observed

The archived publish workflow publishes to npm AND the MCP Registry via OIDC;
the archived announce workflow posts to Discord. Both had release.published and
manual workflow_dispatch triggers. The only remaining executable workflow is CI;
its `npm publish --dry-run --tag ci` step is unchanged and is not a real publish.
Package scripts contain no publish lifecycle hook. This source inspection does
not audit external webhooks, installed apps or npm account configuration; those
were not activated or changed. Restoring any real release path needs separate
review and authorization.
