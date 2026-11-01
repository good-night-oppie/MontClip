# PR6 hidden-operation follow-up

VV's visible-window report covers old a5ede3a. Its synthetic CDP keyboard/IME
events are not physical keyboard or operating-system IME acceptance. The c824096
wording revision remains in this branch; this follow-up keeps its approved short
modeHelp and adds the missing operation guards in one review-head update.

## This batch

- Simple blocks T/Shift+T and Shift+Delete/Shift+Backspace, before focused-transition
  deletion can consume the event. Input fields, composition and modal dialogs
  keep their existing guards. Shift+Delete is not downgraded to ordinary Delete.
- Hide btnTrimIO and btnRippleDelete in simple mode. The ripple button handler
  and rippleDeleteSelected also refuse simple mode. No affected-track preview or
  confirmation exists yet, so cross-track closing is not offered in simple mode.
- Existing advanced behavior and edit-ops.js are unchanged. Ordinary Delete still
  removes the linked selection without moving later clips. Locked groups remain
  atomic; no automatic unlock and no video-only workaround.
- Existing shortcut help marks these three additional rows advanced-only. This
  does not mean all advanced shortcuts/UI are implemented or verified.

## Actual lock fields and copy for JJ

Before removal, deletionLocks expands selectedClips through EDIT.withLinked,
filters EDIT.isClipLocked, and records actual locked track IDs plus explicitly
locked clip names (fallback ID) and IDs. The removal engine's blocked/removed
result chooses whether to display the reason and the partial-success suffix.

ZH example: `锁住的轨道：A1。这些片段及其关联片段都未删除，请先解锁。`
EN example: `locked tracks：A1. These clips and their linked partners were not deleted. Unlock them first.`
Explicit clip locks use `锁住的片段：声音 (a1)` / `locked clips：声音 (a1)`;
user-authored names retain their original language. If another independent unlocked
selection was actually removed, append `其它未锁定的选中片段已删除。` /
`Other unlocked selections were deleted.` No failed-operation undo entry is added.

## Additional mapping decision and verification

The subsequent Deja/VV decision supersedes the static pending table below:
simple mode now also stops Alt+T, Shift+E, Shift+D, Ctrl/Cmd+L, brackets,
unmodified B/R/Y/U, and Alt+Z. Modifier conditions follow the actual dispatcher:
Alt+T/Alt+Z include Shift variants, and brackets have no modifier restriction.
L/Shift+L, Ctrl+Y, Ctrl+Z/Shift+Ctrl+Z, Z/Shift+Z and Ctrl+arrows remain distinct.
Tool buttons B/R/Y/U are hidden and setEditTool refuses their activation in simple
mode. Switching from any of those tools intentionally sets V; switching back
does not restore the old tool. Project, selection, links and history stay intact.

Node tests execute the production keyboard listener with operation spies, and
the actual mode-update/setEditTool functions with a DOM stub. They check each
restricted combination against advanced mode, input/composition/dialog guards,
retained transport/navigation/save/open/undo/zoom/timecode dispatch and all four
tool transitions. These are dispatch/state tests, not real drag or IME tests.
The hidden Electron test is extended for combinations/buttons/tool transitions;
its new version has not run because new profiles are paused for low disk space.
Previous Electron results apply only to the previous head.

New short-mode controls do not remove existing clip context-menu/inspector
operations. This batch limits the specified shortcuts and edit-tool selector;
it does not claim all advanced UI entry points are hidden.

## Historical static mapping before the additional decision

| Key | Production path | Visible entry / current simple status | Follow-up |
|---|---|---|---|
| [ / ] | keydown → trimToPlayhead(in/out) | Existing shortcut help; currently allowed | Not tested in this batch; retain as unverified |
| Shift+E | keydown → toggleClipsDisabled | Clip context menu and inspector Enabled flag; currently allowed | Not tested in this batch |
| Shift+D | keydown → crossfadeSelected | Audio clip context-menu Crossfade with neighbours; currently allowed | Advanced mapping remains inconsistent/pending; not fixed or tested here |
| Alt+T | keydown → addTransitionAtPlayhead | Existing shortcut help/transition controls; currently allowed | Advanced mapping remains pending; not fixed or tested here |

Locate by these function names and the frozen commit when reviewing; do not use
an earlier working-tree line number as an immutable reference. No all-keys pass
is claimed. The remaining shortcuts above were read, not exercised by this test.

## Verification

Predicate regression first failed on the omitted T guard (local
montclip-pr6-hidden-red.log). After the fix it passes. Hidden Electron uses a
synthetic linked V1/A1 timeline (no media-decoding or AV quality claim), production
keydown handlers and buttons. It checks blocked operations leave project/history
unchanged, text events are not claimed, synthetic composition/modal protection,
ordinary Delete with later clips unmoved and one undo, A1 and explicit clip locks
in both locales, and preserved advanced split/trim/ripple results.

The first fixture incorrectly used color clips for an AV link; the production
relinker correctly removed that invalid group. That failed log is retained. The
fixed fixture uses video/audio with matching media IDs. This correction is not a
product lock regression or evidence of real IME, small-window or real-media tests.
