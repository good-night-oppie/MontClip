// MontClip's own: a card the host draws in the assistant's message stream (助手面板 v7.2 §2 「要你点头的卡」; Deja, step 3).
// The frame is Cindy's InteractionPromptCardShell (the shell of its AskUserQuestionPrompt) and the buttons Cindy's Button, both
// copied unchanged at 43001ea. What it says and what its buttons do are the host's: a card is made only from the host's own
// state (for an approval, a ticket the main process issued), never from the words of a reply, which the stream shows as plain
// text. The outgoing confirm card and the Yolo countdown card are to use this same card (later steps).
import React, { useLayoutEffect, useRef, useId } from 'react';
import { InteractionPromptCardShell } from './cindy-43001ea/apps/desktop/src/renderer/components/interaction-portal';
import { Button } from './cindy-43001ea/apps/desktop/src/renderer/components/ui/button';

export type HostCardAction = { id: string; label: string; kind: 'primary' | 'secondary' | 'plain' };
export type HostCardView = {
  id: string;
  kind: string;          // what the card is for, e.g. 'approval' (data-host-card)
  title: string;
  first: string;         // the first line, 15 px: what this step changes
  second?: string;       // under it, small: what kind of step it is
  more?: string[];       // further small lines
  content?: string | null; contentLabel?: string;  // what is sent, for a step that sends something
  actions: HostCardAction[];
  answered?: string | null;  // once answered, the card is this one line
};

const KIND: Record<HostCardAction['kind'], { variant: 'cta' | 'secondary'; tone?: 'quiet' }> = {
  primary: { variant: 'cta' }, secondary: { variant: 'secondary' }, plain: { variant: 'secondary', tone: 'quiet' },
};

/** One card. While it waits it is brought into view and the card itself takes the focus (once per card) — never an
 *  approve button: one stray Space would settle the step (QQ/DD on #120). Focus stays put while the user is typing
 *  in an editor or input; Esc on the card is 〔不同意〕. A screen reader hears its title and first line when the
 *  focus arrives (a group named by them, outside the conversation's live log). */
export function HostCard({ card, onAction }: { card: HostCardView; onAction: (id: string) => void }) {
  const root = useRef<HTMLDivElement>(null), shown = useRef(''), ids = useId();
  const waiting = !card.answered;
  useLayoutEffect(() => {
    if (!waiting || shown.current === card.id) return;
    shown.current = card.id;
    root.current?.scrollIntoView({ block: 'nearest' });
    const el = document.activeElement as HTMLElement | null;
    const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    if (!typing) root.current?.focus({ preventScroll: true });
  }, [card.id, waiting]);
  if (!waiting) return <p className="host-card-done" data-host-card-done={card.kind}>{card.answered}</p>;
  return (
    <div ref={root} tabIndex={-1} data-cindy-parts="" data-host-card={card.kind} className="host-card" role="group" aria-labelledby={ids + 't'} aria-describedby={ids + 'f'}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onAction('deny'); } }}>
      <InteractionPromptCardShell
        viewerState="expanded" onViewerStateChange={() => {}} collapsible={false}
        minimizedTitle={card.title} restoreAriaLabel={card.title} minimizeAriaLabel={card.title}
        headerLeading={<h3 id={ids + 't'} className="text-14 font-semibold text-[var(--text-primary)]">{card.title}</h3>}
        footer={<div className="flex flex-wrap items-center gap-1" data-host-card-actions>{card.actions.map((a) => (
          <Button key={a.id} variant={KIND[a.kind].variant} tone={KIND[a.kind].tone} size="sm" compact className="px-2" data-host-choice={a.id} onClick={() => onAction(a.id)}>{a.label}</Button>
        ))}</div>}>
        <p id={ids + 'f'} className="text-[15px] leading-[1.45] text-[var(--text-primary)]" data-host-card-first>{card.first}</p>
        {card.second && <p className="mt-1 text-12 text-[var(--text-secondary)]" data-host-card-second>{card.second}</p>}
        {(card.more || []).filter(Boolean).map((line, i) => <p key={i} className="mt-1 text-12 text-[var(--text-secondary)]" data-host-card-more>{line}</p>)}
        {card.content != null && <details className="mt-2 text-12 text-[var(--text-secondary)]" data-host-card-content><summary>{card.contentLabel}</summary><pre className="whitespace-pre-wrap">{card.content}</pre></details>}
      </InteractionPromptCardShell>
    </div>
  );
}
