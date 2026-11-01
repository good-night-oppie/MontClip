# Third-party code in the official Cindy integration

MontClip host code retains the repository's MIT LICENSE. Imported components retain their own terms.

- Cindy: https://github.com/makecindy/cindy/tree/021923684f54129effbba6b72a8218526418fa45 — Apache-2.0; [LICENSE](agent-ui/upstream/LICENSE), [NOTICE](agent-ui/upstream/NOTICE), Copyright2026 XD Inc. Exact unchanged files/hashes: [SOURCES.json](agent-ui/SOURCES.json).
- React19.2.0 and ReactDOM19.2.0: MIT. lucide-react0.468.0: ISC. Full bundled license notices: [THIRD-PARTY-NOTICES.txt](agent-ui/THIRD-PARTY-NOTICES.txt).
- esbuild0.25.12: MIT build tool, not shipped as a runtime dependency. Lockfile fixes build versions.

The generated cindy-official.js has been adapted through bundling/minification and MontClip host interfaces. It has an explicit modification notice; the copied upstream source files have not been edited. No private Cindy configuration, API key, packaged extraction or Rea source is included. See the [reuse/change inventory](docs/decisions/2026-11-01-official-cindy-port.md).
