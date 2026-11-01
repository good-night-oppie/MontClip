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

## Follow-up: first advanced-only shortcut group

Simple mode now hides the existing mark-in/out, source insert/replace,
find/close-gap, lift/extract, snap and marker controls via a separate CSS class.
Their matching shortcuts are blocked in the main global editor handler after
the typing guard. Switching back only removes that class, preserving the
original conditional visibility and DOM nodes. Other advanced tool panels and
shortcuts still require the remaining UI mapping; this is not blanket coverage.

Transport, navigation, split, undo/redo and existing Delete semantics are not
repurposed. In particular, Delete has not become ripple delete. Main editor
shortcuts ignore composition events and open native HTML dialogs. Keyup shuttle
cleanup is unchanged. Help explains the restricted group in Chinese and English.

Unit tests exercise the key/modifier groups. Hidden Electron sends real DOM
KeyboardEvents: N does not toggle the hidden snap button in simple, does toggle
it in advanced, and does not toggle it from a focused test textarea, an IME
composition event or Ctrl+N. Mode-switch project/playhead/selection/history
preservation continues to pass. This is synthetic event testing, not physical
keyboard/IME, an implemented chat draft, all tools' local key handlers or VV
visible-window acceptance. The unit test initially failed before the classifier
was implemented. Broader Chinese coverage and the remaining mode controls are
still pending.
