// MontClip stand-in for Cindy's hooks/useAgentCapabilities (see cindy-resolve.cjs STAND_INS). In Cindy,
// PermissionSelector asks the main process (window.electronAPI.maker) which permission modes an agent has. MontClip's
// AI has four modes, fixed by the host (#83): 计划, 手动, 自动, Yolo. They are given here under the ids Cindy's selector
// already draws: plan (clipboard), ask (hand), auto (sparkles, its own tone), bypassPermissions (warning icon and
// colour — Yolo). montclipModeOf / cindyModeOf translate between the two.
// The labels and descriptions shown are MontClip's (agent-ui/montclip-strings.json), not Cindy's.
const MODES = [
  { id: 'plan', montclip: 'plan' },
  { id: 'ask', montclip: 'manual' },
  { id: 'auto', montclip: 'auto' },
  { id: 'bypassPermissions', montclip: 'yolo' },
] as const;
const capabilities = { permissionModes: MODES.map(({ id }) => ({ id, displayName: id, description: '' })) };
export function useAgentCapabilities(_agentKind?: unknown, _deviceId?: string) {
  return { capabilities: capabilities as any, loading: false, error: null as string | null };
}
export function montclipModeOf(id: string): string | undefined { return MODES.find((m) => m.id === id)?.montclip; }
export function cindyModeOf(mode: string): string | undefined { return MODES.find((m) => m.montclip === mode)?.id; }
