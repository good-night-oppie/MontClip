# FLV clean core review scope

Base main5df54aec (PR2 squash). PR8 unchanged. This replaces the shared
preparation/REST/MCP part of old PR4 and the shared gap guard from later local
work, without their ancestors. Native IPC/close/harness is explicitly deferred.

Memory production-route tests exercise gap rejection, no encode before permission,
REST stored-original retention and MCP no-registration on refusal. Browser VM
tests use actual importFiles/projectJSONHere/normalizeMediaEntry, including late
metadata after project switch. Real tiny synthetic FFmpeg fixtures cover native
Node REST/MCP, source bytes and remux frame hashes; no Electron/profile/window.
Readable permission regression initially6pass/1fail: expected
FLV_READABLE_CONSENT_REQUIRED but got no rejection with allowTranscode:true.
Then10/10 gap/scanner passed,5/5 real fixtures,3/3 browser VM passed.
Not a full real browser save/reopen proof or historical diskrev1 root-cause fix.
No claim of Linux/macOS/package verification. Full candidate results appended below.
