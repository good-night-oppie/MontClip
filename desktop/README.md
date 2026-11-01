# MontClip desktop development shell

This hosts the existing FableCut UI and compositor. It is **not a release or M0
acceptance build**. No Python or renderer Node integration is introduced. Electron
is a development/packaging dependency; the core editor remains standard-library only.

```powershell
cd desktop
npm ci
node node_modules/electron/install.js
npm start
node smoke.js
```

The shell runs its own utility process on an OS-assigned loopback port. A fresh
256-bit session token is injected into requests by the main process, never placed
in a URL. Desktop server requests require exact Host/Origin and that token.
No preload or renderer IPC methods are exposed. Sandbox, context isolation and
web security are enabled; navigation, new windows, webviews and permissions are
denied. Downloads are limited to this editor's export files and blob outputs.
The main-frame CSP forbids remote scripts and eval; inline styles remain necessary
for the upstream compositor/UI. Font/model CDN requests and Node URL imports are
blocked in desktop mode. ASR remains unavailable until local assets are supplied.

Data lives in Electron userData/workspace. Closing asks the existing `flushSave`
to finish; a failed or unknown save keeps the window open. Cleanup sends shutdown
only to this instance's utility process. Single-instance locking prevents two
windows sharing the same data directory. Full FFmpeg descendant cleanup,
packaging fuses, language coverage and save-failure UI acceptance
are still pending. Development smoke runs in a new Chinese/space-containing temp
directory, without showing a window or manipulating the mouse. It is not VV's
real-window test and does not measure A/V sync.

Runtime selection: Electron 45.2.1, resolved from npm on 2026-11-01, pinned by
`package-lock.json`; binary fetched by the official Electron installer, which uses
the version's checksums. Initial cached 42.11.12 was rejected: [GHSA-jr5w-w6x2-84p9](https://github.com/electron/electron/security/advisories/GHSA-jr5w-w6x2-84p9)
lists <42.11.16, 43 prereleases before 43.8.1, 44 prereleases before 44.9.1 and
45 prereleases before 45.0.0-beta.6 as affected by compromised certificate
mitigation. Audit on the installed 45.2.1 lock reported zero vulnerabilities;
that is not a complete security review. Electron's MIT and Chromium third-party
licenses must accompany a future package.

Security implementation follows [Electron's security checklist](https://www.electronjs.org/docs/latest/tutorial/security).
