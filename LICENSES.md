# Third-party code in the official Cindy integration

MontClip host code retains the repository's MIT LICENSE. Imported components retain their own terms.

- Cindy: https://github.com/makecindy/cindy/tree/021923684f54129effbba6b72a8218526418fa45 — Apache-2.0; [LICENSE](agent-ui/upstream/LICENSE), [NOTICE](agent-ui/upstream/NOTICE), Copyright2026 XD Inc. Exact unchanged files/hashes: [SOURCES.json](agent-ui/SOURCES.json).
- React19.2.0 and ReactDOM19.2.0: MIT. lucide-react0.468.0: ISC. Full bundled license notices: [THIRD-PARTY-NOTICES.txt](agent-ui/THIRD-PARTY-NOTICES.txt).
- esbuild0.25.12: MIT build tool, not shipped as a runtime dependency. Lockfile fixes build versions.

The generated cindy-official.js has been adapted through bundling/minification and MontClip host interfaces. It has an explicit modification notice; the copied upstream source files have not been edited. No private Cindy configuration, API key, packaged extraction or Rea source is included. See the [reuse/change inventory](docs/decisions/2026-11-01-official-cindy-port.md).

The complete original282-byte Cindy NOTICE is also embedded verbatim in THIRD-PARTY-NOTICES.txt; upstream/NOTICE remains unchanged. Behavior SPEC v2 reference/hash is recorded in the ADR; it is not a source-code license substitute.

The official pane bundle also includes scheduler 0.27.0 (MIT, Meta Platforms, Inc. and affiliates). Its full license is retained in agent-ui/THIRD-PARTY-NOTICES.txt. BUNDLED-LICENSES.json pins each bundled dependency version and full notice hash.
