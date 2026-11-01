# Build-tool dependency, not a release package

Pinned @electron/packager20.3.0 as a desktop devDependency with npm lock integrity.
Official sources: https://registry.npmjs.org/@electron%2fpackager/20.3.0 and
https://github.com/electron/packager . License BSD-2-Clause; official LICENSE
bytes are unchanged in the installed package; SHA256 and exact dependency
versions/licenses are recorded in the adjacent JSON. A license field/inventory
is not a blanket approval of all dependencies or the final distribution.

Acquisition actually executed on Windows/Node22.15.1:
npm install --prefix desktop --save-dev --save-exact @electron/packager@20.3.0 --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org
All lockfile download hosts are registry.npmjs.org. Installation scripts disabled;
no Electron archive/model download, existing runtime copy or packaging invocation.
18.4.4 was tried for old CommonJS compatibility but NOT committed/selected: audit
reported2high+5moderate.20.3.0 reduced high to0, retains5moderate including minimatch
transitive advisories. Audit nonzero is recorded; no claim of a clean security audit.
Do not apply blind npm audit fix/overrides. Build dependency approval remains open.

The old cumulative entry resolves @electron/packager/package.json and uses sync
require. Actual installed20.3.0 produces ERR_PACKAGE_PATH_NOT_EXPORTED for that
old resolution. desktop/build-tool.js now resolves the exported entry, reads the
pinned official metadata/license, and asynchronously imports the ESM packager
function; missing/version/API failures are explicit with no install fallback.
Requires Node>=22.12 for build tooling; application server remains standard library.
The future clean package-build entry must await dependency.load(); this PR does
not publish or invoke the unreviewed cumulative packaging entry.

Reproduce: npm run --prefix desktop package:tool-check.
Actual result:20.3.0/BSD-2-Clause/interfaceLoaded:true/packagingExecuted:false/
releaseApproved:false. Three Node injected loader tests pass; actual module import
is separately executed. No archive extraction, output staging, runtime or model
inference was run. This check does not validate application resource closure.

Remaining executable acquisition plan: obtain official Electron45.2.1 win32-x64
archive and its official checksum/Chromium notices into a dedicated reviewed build
input only after archive budget/hash review; do not reconstruct it by copying the
installed runtime. Select a Windows FFmpeg/ffprobe build with published configuration,
matching corresponding source and license notices, record executable hashes in
release manifest; existing GPLv3 system tools remain development-only and cannot
be labelled LGPL. If an LGPL build cannot support required encoders, decide the
actual GPL distribution obligations rather than mislabel the binary. ASR JS/WASM/
model/config and licenses are separate: research weights stay selectedForRelease
false until Chinese quality/word timing/license approval. No model selection or
resource gate changed. Existing missing manifest+21 resources and real Windows
package/fuses/offline acceptance remain blockers.
