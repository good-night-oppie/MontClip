# First actual dual-view increment — partial implementation

Basis: VV's current v2.2 direction in the v2 interface document. Prototype counts
(113/113, 444 layouts, 297 bilingual keys) are not product test results.

Implemented: Simple/Advanced buttons and Chinese-default/English preference,
persisted independently of project data; mode changes only body dataset and CSS
grid placement of the same existing panel nodes. Added Undo/Redo buttons call
the native shared history. Assistant is available from both modes but explicitly
disconnected, has no chat input/mock response/network send. This does not complete
the connected chat or its consent/proposal lifecycle. Top branding is MontClip.

The language setting currently covers only the newly introduced controls and
assistant status; the rest of the upstream UI remains untranslated. The modes
currently reorder existing panels; full simple controls/transcript placement,
advanced-only shortcut gating, focus/IME/scroll validation, 840 px More menu,
small-preview repair and maximize/escape behavior are still pending. No controls
are hidden by this increment, so no new hidden-shortcut path is introduced.
No project document or undo data is reconstructed during switching.

Verification: 2 targeted preference tests, full npm test 563/563, release-check,
and real hidden Electron smoke passed. The smoke drives mode buttons and language
change events; project serialization, playhead, selection and undo/redo arrays
match before/after, and transcript DOM identity is unchanged (viewPreserved=true).
The run used a fresh profile and the existing development runtime; it is not a
visible-window acceptance, populated chat-draft/IME test or portable package.
No downloads, repeated runtime copies or model changes were involved.

Next implementation must preserve the new selected mode when mode switching exits
maximized preview. Escape/Back to editing preserve the prior mode instead; Escape
first closes the topmost overlay. Payload confirmation must describe the actual
outgoing history/references, and removing history must remove its old references.
Missing-model and model-runtime failures require distinct messages. None of those
future behaviors is marked passed by this increment.
