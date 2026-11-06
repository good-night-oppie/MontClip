# PR 190 public evidence path sanitization

Base archive: `b2ad3fc65a1b5109f6aaa064c3ccf754c384b63a`. Author response to QQ privacy review 5797801296. Only Windows user-directory prefixes in 14 logs (58 occurrences; 9 qq-*.log files) are replaced with `%USERPROFILE%`. The remaining path separators, suffixes, failure records, test counts and all other bytes are unchanged. No product source, tests, images or media are changed; no product tests or rendering rerun.

The five existing SHA256.json manifests now describe the sanitized files in their top-level bytes/sha256 fields. Each changed row retains originalArchive: the base commit, SHA256/size of the actual Git archive bytes, and the previously registered SHA256/size verbatim. This explicitly preserves historical hash attribution even if a historical registered value used different newline bytes. Sanitized logs are derived text, not original run bytes. Unchanged rows retain their original hashes.

This is an appended commit, not history rewriting. Earlier commits still contain the old paths. No claim is made that the paths were removed from Git history.

| File under docs/validation | Replacements |
| --- | ---: |
| 2026-11-05-prores-project-end/prores-filter-red.log | 1 |
| 2026-11-05-prores-project-end/prores-full-final.log | 1 |
| 2026-11-05-prores-project-end/prores-rate-red.log | 1 |
| 2026-11-05-prores-project-end/prores-red-expanded.log | 10 |
| 2026-11-05-prores-project-end/prores-red.log | 1 |
| 2026-11-06-prores-filter-review/qq-filter-red.log | 11 |
| 2026-11-06-prores-filter-review/qq-full-final.log | 1 |
| 2026-11-06-prores-sample-edge/qq-edge-full.log | 7 |
| 2026-11-06-prores-sample-edge/qq-sample-edge.log | 6 |
| 2026-11-06-prores-shortest-value/qq-shortest-full.log | 1 |
| 2026-11-06-prores-shortest-value/qq-shortest-pcm-pair.log | 2 |
| 2026-11-06-prores-shortest-value/qq-shortest-red.log | 7 |
| 2026-11-06-prores-ui-refusal/qq-ui-full.log | 1 |
| 2026-11-06-prores-ui-refusal/qq-ui-red.log | 8 |

Verification: compare every changed log byte-for-byte with the base Git blob after the single prefix replacement; verify all changed manifest rows against both base and sanitized bytes; verify unchanged manifest rows identical; scan tracked validation text and staged evidence for Windows user-directory prefixes in normal, escaped and forward-slash forms. Product/test/media files must be absent from the staged diff. Before future evidence submissions, sanitize local user paths before hashing and committing.

Author verification result: 14 logs / 58 replacements; 14 changed manifest rows verified against original and sanitized bytes; 69 unchanged manifest rows identical; 20 staged evidence files, zero Windows user-directory-prefix matches. No product tests were run for this text-only privacy correction.
