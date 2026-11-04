// MontClip stand-in for Cindy's chat/ChatSessionFileContext (see cindy-resolve.cjs STAND_INS). A MontClip chat has no
// session files: every part sees Cindy's own "outside a chat" value (no session, no working folder, local origin).
import type { ReactNode } from 'react';
const VALUE = Object.freeze({ sessionId: undefined as string | undefined, workingDir: '', origin: Object.freeze({ kind: 'local' as const }), localConfirmed: false });
export function useChatSessionFile() { return VALUE; }
export function useSessionFileOrigin() { return VALUE.origin; }
export function useChatSessionFileValue(sessionId?: string, _workingDir?: string, _remoteHostId?: string | null) { return sessionId === VALUE.sessionId ? VALUE : { ...VALUE, sessionId }; }
export function ChatSessionFileProvider({ children }: { value?: unknown; children?: ReactNode }) { return <>{children}</>; }
