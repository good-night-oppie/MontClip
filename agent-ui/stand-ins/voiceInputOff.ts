// MontClip stand-in for the voice-input pieces AskUserQuestionPrompt uses (see cindy-resolve.cjs STAND_INS). Voice input
// is left out for now (Deja, 2026-11-04): nothing here records, asks for the microphone or listens for a shortcut.
// The card's own voice button is hidden by MontClip's style (style.css, [data-testid="ask-user-voice"]).
export function getVoiceInputSettings() { return { composerLongPressEnabled: false, shortcut: null }; }
export async function requestRendererMicrophonePermission() { return { ok: false as const, error: 'voice input is not available in MontClip' }; }
export function formatVoiceInputShortcut(_shortcut: unknown): string { return ''; }
export function isVoiceInputShortcutMatch(..._args: unknown[]): boolean { return false; }
export function isComposerLongPressVoiceReady(): boolean { return false; }
export function createComposerLongPressVoiceGesture(_options: unknown) {
  return { press(_p: unknown) {}, move(_p: unknown) {}, release() {}, isHolding: () => false, dispose() {} };
}
export function nextAskUserVoiceShortcutOrder(): number { return 0; }
export function registerAskUserVoiceShortcutCard(..._args: unknown[]) { return { owns: (_target: unknown) => false, dispose() {} }; }
export function parseVoiceQuestionSelection(_text: string, _labels: readonly string[]) { return { kind: 'unknown' as const, indices: [] as number[] }; }
export function useAskUserDictation(..._args: unknown[]) {
  return { state: 'idle' as const, captureReady: false, isBusy: false, liveText: null as string | null, lastError: null as string | null,
    speakerFiltered: false, start: () => false, stop: async () => false, cancel: async () => {} };
}
