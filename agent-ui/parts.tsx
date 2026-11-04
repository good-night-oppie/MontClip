// The assistant pane's parts taken from makecindy/cindy@43001ea (Deja, 2026-11-04), unchanged, with MontClip's
// stand-ins (cindy-resolve.cjs). This only makes them available to the page as window.MontClipCindyParts; the pane
// starts using them in the next changes (the message stream and its steps, the mode switch and the approval card, …).
// render() is how the smoke shows one in a test page.
import { createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import i18n, { missingKeys, setPartsLanguage } from './cindy-i18n';
import { PermissionSelector } from './cindy-43001ea/apps/desktop/src/renderer/components/new-chat/PermissionSelector';
import { JumpToBottomChip } from './cindy-43001ea/apps/desktop/src/renderer/components/chat/JumpToBottomChip';
import { InlineReferenceChip } from './cindy-43001ea/apps/desktop/src/renderer/components/chat/InlineReferenceChip';
import { TodoListCard } from './cindy-43001ea/apps/desktop/src/renderer/components/chat/TodoListCard';
import { ErrorMessageCard } from './cindy-43001ea/apps/desktop/src/renderer/components/chat/ErrorMessageCard';
import { WorkGroupBlock } from './cindy-43001ea/apps/desktop/src/renderer/components/chat/WorkGroupBlock';
import { ThinkingCard } from './cindy-43001ea/apps/desktop/src/renderer/components/chat/ThinkingCard';
import { ToolCallCard } from './cindy-43001ea/apps/desktop/src/renderer/components/chat/ToolCallCard';
import { AskUserQuestionPrompt } from './cindy-43001ea/apps/desktop/src/renderer/components/new-chat/AskUserQuestionPrompt';
import { cindyModeOf, montclipModeOf } from './stand-ins/useAgentCapabilities';

const components: Record<string, ComponentType<any>> = {
  PermissionSelector, JumpToBottomChip, InlineReferenceChip, TodoListCard, ErrorMessageCard, WorkGroupBlock, ThinkingCard, ToolCallCard, AskUserQuestionPrompt,
};
const roots = new WeakMap<Element, Root>();
function render(el: Element, name: string, props: Record<string, unknown> = {}, language = 'zh-CN') {
  const C = components[name];
  if (!C) throw Error('no such part: ' + name);
  setPartsLanguage(language);
  let root = roots.get(el);
  if (!root) { root = createRoot(el); roots.set(el, root); }
  root.render(createElement(I18nextProvider, { i18n }, createElement(C, props)));
  return { unmount: () => { root!.unmount(); roots.delete(el); } };
}
(window as any).MontClipCindyParts = { commit: '43001eaaa31ef322de9ae148c4051087277d6198', names: Object.keys(components), components, render, missingKeys, cindyModeOf, montclipModeOf };
