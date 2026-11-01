# Official Cindy source port: first runnable vertical slice

2026-11-01. Implements the user's request to port Cindy Agent Chat Pane/configuration; supersedes the earlier assumption that Cindy is closed-source. Existing work is preserved.

## Provenance and actual reuse
Official repository: https://github.com/makecindy/cindy . Pinned commit: 021923684f54129effbba6b72a8218526418fa45. Apache-2.0 LICENSE and upstream NOTICE are preserved byte-for-byte in agent-ui/upstream. SOURCES.json records original paths, Git blob identities and SHA-256 for every reused file. No Rea implementation, packaged app extraction, private Cindy data or credentials were used.

Actual unmodified runtime components: ComposerCard, SendButton, ListComposerTextarea, ThinkingText, SettingsTextInput and Input; their list-editing/text helpers are also retained. React19.2.0, ReactDOM19.2.0, lucide-react0.468.0 (MIT/ISC) are bundled by esbuild0.25.12; lockfile and third-party notices are included. This scoped prebuilt React island is an explicit exception to the upstream no-framework preference, justified by directly reusing the requested official React source. Running the editor needs no npm install/CDN. Rebuilding this island uses npm ci --prefix agent-ui then npm run build --prefix agent-ui.

Full CCAgentSessionView/MessageStream/ChatInput are NOT claimed as transplanted. Their Cindy session/provider/attachment/agent-event/store hooks and Tiptap editor depend on the surrounding desktop application. A direct esbuild attempt for official ChatInput fails with 152 unresolved imports (agent-ui/DIRECT-IMPORT-BLOCKERS.json); these include Cindy host hooks and rich-editor packages. This increment reuses the real composer, text-stream and configuration primitives, replacing host orchestration only. Tool-rich message stream and full session container port remain follow-up work, not completed capability. The tooltip boundary is a small native title host adapter; original files remain unchanged.

## Host contract and consent
MontClip retains its project, range plan, preview compositor and undo engine. Agent references are explicit project/caption/timeline-range chips. A displayed local project target is not automatically sent. Review lists the exact HTTP JSON body: selected model, all history and current text/references, stream=false, max_tokens=2048. New sessions start with no history. Removing a current chip does not delete older history. No implicit system message, media, screenshot, account or filesystem path is appended.

Main-process IPC is restricted to the existing exact window/mainFrame/origin. Only fixed OpenAI/DeepSeek HTTPS endpoints are supported; no arbitrary URL/shell/MCP tool. User-entered key is transient write-only form state, cleared after save; persisted ciphertext uses Electron safeStorage in the MontClip profile, and get() returns metadata only. This does not read existing Cindy credentials. Configuration/startup are offline. The main process sends only after explicit payload confirmation; redirects are refused. Response text/requests are bounded, timeout60s, one request at a time; 2000 IDs per process is a conservative bounded dedup limit, after which requests fail explicitly rather than evicting replay protection.

Plain text replies are untrusted, never executed or rendered as HTML. A separate button parses only strict keep_sentences JSON against explicitly quoted whole subtitles and current project/sequence/revision/generation. Preview is read-only; explicit Apply uses existing range-plan and one undo transaction. Stale/locked/unsupported plans refuse. No direct agent editing tools are enabled. Cancellation suppresses later text; it cannot recall already sent requests or provider charges. Unknown cancellation is not success. Active requests block ordinary close; the existing main-project wait/explicit-force mechanism remains.

## Limits
Non-streaming transport is implemented but no live service credentials were supplied for acceptance. Injected test responses are test-only, never product fake output. Full official session/message/tool rendering, live-provider acceptance, complete Chinese UI, physical input/accessibility and portable packaging remain open. Hidden Electron verification is not VV visible-window approval. No system clipboard test is permitted or performed.

## Apache-2.0 reuse and change inventory

The Rea behavior SPEC §0 statement "closed-source / license unconfirmed" was an outdated erroneous premise, corrected by the user. It is not evidence about the official repository's license and does not restrict this official-source port.

Unmodified copied files (exact identities in SOURCES.json):
- `agent-ui/upstream/ComposerCard.tsx` ← `apps/desktop/src/renderer/components/new-chat/ComposerCard.tsx`
- `agent-ui/upstream/composerListContinuation.ts` ← `apps/desktop/src/renderer/lib/composerListContinuation.ts`
- `agent-ui/upstream/composerListTextarea.ts` ← `apps/desktop/src/renderer/lib/composerListTextarea.ts`
- `agent-ui/upstream/LICENSE` ← `LICENSE`
- `agent-ui/upstream/ListComposerTextarea.tsx` ← `apps/desktop/src/renderer/components/new-chat/ListComposerTextarea.tsx`
- `agent-ui/upstream/NOTICE` ← `NOTICE`
- `agent-ui/upstream/SendButton.tsx` ← `apps/desktop/src/renderer/components/new-chat/SendButton.tsx`
- `agent-ui/upstream/thinkingText.ts` ← `packages/maker-shared/src/thinkingText.ts`
- `agent-ui/upstream/ThinkingText.tsx` ← `apps/desktop/src/renderer/components/chat/ThinkingText.tsx`
- `agent-ui/upstream/SettingsTextInput.tsx` ← `apps/desktop/src/renderer/components/settings/SettingsTextInput.tsx`
- `agent-ui/upstream/input.tsx` ← `apps/desktop/src/renderer/components/ui/input.tsx`

Modified upstream source files: **none**. Original source bytes remain unchanged. Generated derivative `cindy-official.js` is a bundled/minified combination with MontClip host imports; it now carries a prominent modification/provenance notice in its generated banner, retained on rebuild. `agent-ui/pane.tsx`, `host.tsx`, `tooltip-host.tsx`, `build.cjs`, the service/conversation/proposal modules are MontClip adapters, not files claimed to be original Cindy containers. MontClip app/main/preload/locale/CSS are existing host integration changes. No copied file comes from packaged products, private source or Rea materials.

`LICENSES.md` indexes the unchanged Apache LICENSE/NOTICE and bundled dependencies; `agent-ui/THIRD-PARTY-NOTICES.txt` links the exact source/version and retains React/ReactDOM/lucide notices. Root MIT licensing does not replace upstream Apache/third-party licenses. Package files include LICENSES.md plus original LICENSE/NOTICE and attribution manifest.
