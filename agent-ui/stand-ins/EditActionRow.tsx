// MontClip's own edit-step row, used by Cindy's WorkGroupBlock in the place of Cindy's AgentActionRow (see
// cindy-resolve.cjs STAND_INS; Deja, 2026-11-04). The design (助手面板 v7.2 §2): the first line, in the normal size, says
// what was changed (e.g. 「第 2 段结尾 1:18:42 → 1:18:44（往后 2 秒）」); the second line, in 12 px, gives the tool's name
// without the fablecut_ prefix and what it does in plain words.
// The step comes as a Cindy chat message: content = what was changed, toolName = the tool, toolInput.explain = the
// plain words. Where those come from is the host's job (the message stream, a later PR).
import { cn } from '@/lib/utils';
type Step = { content?: unknown; toolName?: string; toolInput?: unknown };
export function AgentActionRow({ message, status = 'done' }: { message: Step; status?: 'running' | 'done'; [key: string]: unknown }) {
  const tool = String(message.toolName ?? '').replace(/^fablecut_/, '');
  const explain = (message.toolInput as { explain?: unknown } | null)?.explain;
  return (
    <div data-montclip-edit-step data-status={status} className={cn('min-w-0 py-0.5')}>
      <div data-edit-change className="text-13 text-fg-primary break-words">{String(message.content ?? '')}</div>
      {(tool || explain) && (
        <div data-edit-tool className="text-12 text-fg-tertiary break-words">
          {[tool, typeof explain === 'string' ? explain : ''].filter(Boolean).join(' · ')}
        </div>
      )}
    </div>
  );
}
