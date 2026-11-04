'use strict';
// How the Cindy parts copied at 43001ea resolve their imports (Deja, 2026-11-04: the assistant pane's parts are taken
// from makecindy/cindy, not rewritten). Shared by build.cjs (root = agent-ui/cindy-43001ea, the unchanged copies) and
// vendor-cindy.cjs (root = a Cindy checkout), so the copy is exactly what the build reads.
//  - '@/x' is apps/desktop/src/renderer/x, '@cindy/<package>/<sub>' goes through that package's exports, as in Cindy;
//  - a few Cindy files are not copied: their place is taken by a MontClip stand-in (STAND_INS, with the reason);
//  - npm packages come from agent-ui/node_modules, at the versions in package-lock.json.
const fs = require('node:fs'), path = require('node:path');

const COMMIT = '43001eaaa31ef322de9ae148c4051087277d6198';
const ENTRIES = [
  'apps/desktop/src/renderer/components/new-chat/PermissionSelector.tsx',
  'apps/desktop/src/renderer/components/chat/JumpToBottomChip.tsx',
  'apps/desktop/src/renderer/components/chat/InlineReferenceChip.tsx',
  'apps/desktop/src/renderer/components/chat/TodoListCard.tsx',
  'apps/desktop/src/renderer/components/chat/ErrorMessageCard.tsx',
  'apps/desktop/src/renderer/components/chat/WorkGroupBlock.tsx',
  'apps/desktop/src/renderer/components/chat/ThinkingCard.tsx',
  'apps/desktop/src/renderer/components/chat/ToolCallCard.tsx',
  'apps/desktop/src/renderer/components/new-chat/AskUserQuestionPrompt.tsx',
];
// Run at build time by styles.cjs (never in the page): Cindy's Tailwind config, and its theme code that turns the cindy-dark
// theme into CSS variables; and the CSS files it reads as they are
const STYLE_ENTRIES = [
  'apps/desktop/tailwind.config.ts',
  'apps/desktop/src/renderer/themes/colors.ts',
  'apps/desktop/src/renderer/themes/theme-service.ts',
  'apps/desktop/src/renderer/themes/builtin/cindy-dark.ts',
];
const STYLE_FILES = ['apps/desktop/src/renderer/styles/generated/tokens.css'];
// Cindy file (without extension) → the MontClip stand-in used in its place, and why
const STAND_INS = {
  'apps/desktop/src/renderer/lib/makerChatStore': ['makerChatStore.ts', "ErrorMessageCard reads two remote-error helpers from Cindy's chat store; the store itself pulls in 113 files"],
  'apps/desktop/src/shared/providerShareBudget': ['providerShareBudget.ts', 'ErrorMessageCard uses one 3-line check from it; the file imports all of @cindy/model-providers (2.3 MB of model catalogs)'],
  'apps/desktop/src/renderer/components/chat/AgentActionRow': ['EditActionRow.tsx', "WorkGroupBlock's step rows: MontClip's own edit-step row (Deja); Cindy's row brings file cards, media and device links (326 files)"],
  'apps/desktop/src/renderer/hooks/useAgentCapabilities': ['useAgentCapabilities.ts', "PermissionSelector asks Cindy's main process (window.electronAPI.maker) for the modes; MontClip has no such API, so its four modes come from here"],
  'apps/desktop/src/renderer/lib/filePreview': ['toolCallShell.ts', 'ToolCallCard: only the folding shell is taken; file previews are not used in MontClip'],
  'apps/desktop/src/renderer/lib/localPathResolver': ['toolCallShell.ts', 'ToolCallCard: file previews are not used in MontClip'],
  'apps/desktop/src/renderer/components/chat/DiffView': ['toolCallShell.ts', 'ToolCallCard: file previews are not used in MontClip'],
  'apps/desktop/src/renderer/components/chat/TextLightbox': ['toolCallShell.ts', 'ToolCallCard: file previews are not used in MontClip'],
  'apps/desktop/src/renderer/components/chat/ChatSessionFileContext': ['ChatSessionFileContext.tsx', 'ToolCallCard and AskUserQuestionPrompt: no session files in MontClip'],
  'apps/desktop/src/renderer/components/chat/MarkdownRenderer': ['MarkdownRenderer.tsx', 'AskUserQuestionPrompt: Markdown is left out for now (Deja); the question is shown as plain text'],
  'apps/desktop/src/renderer/hooks/useVoiceInputSettings': ['voiceInputOff.ts', 'AskUserQuestionPrompt: voice input is left out for now (Deja)'],
  'apps/desktop/src/renderer/voice-input/startGuards': ['voiceInputOff.ts', 'voice input is left out for now'],
  'apps/desktop/src/renderer/voice-input/shortcut': ['voiceInputOff.ts', 'voice input is left out for now'],
  'apps/desktop/src/renderer/voice-input/composerLongPressGesture': ['voiceInputOff.ts', 'voice input is left out for now'],
  'apps/desktop/src/renderer/components/new-chat/askUserVoiceShortcutOwner': ['voiceInputOff.ts', 'voice input is left out for now'],
  'apps/desktop/src/renderer/components/new-chat/useAskUserDictation': ['voiceInputOff.ts', 'voice input is left out for now'],
  'apps/desktop/src/renderer/components/new-chat/voiceQuestionSelection': ['voiceInputOff.ts', 'voice input is left out for now'],
};
const EXTS = ['', '.tsx', '.ts', '/index.tsx', '/index.ts', '.js', '.mjs', '.json'];
const fileAt = (base) => { for (const e of EXTS) { const f = base + e; if (fs.existsSync(f) && fs.statSync(f).isFile()) return f; } return null; };
const rel = (root, f) => path.relative(root, f).split(path.sep).join('/');
const noExt = (p) => p.replace(/(\/index)?\.(tsx|ts|js|mjs)$/, '');

function plugin({ root, standIns = path.join(__dirname, 'stand-ins') }) {
  const inside = (f) => !!f && !path.relative(root, f).startsWith('..') && !path.isAbsolute(path.relative(root, f));
  const resolveIn = (base) => {
    const logical = noExt(rel(root, base));
    if (STAND_INS[logical]) return { path: path.join(standIns, STAND_INS[logical][0]) };
    const f = fileAt(base);
    return f ? { path: f } : undefined;
  };
  return { name: 'cindy-43001ea', setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      const s = args.path, from = args.importer;
      // the stand-ins import the Cindy parts they sit beside the same way the Cindy files do
      if (!inside(from) && !(from && from.startsWith(standIns))) return undefined;
      if (s.startsWith('@/')) return resolveIn(path.join(root, 'apps/desktop/src/renderer', s.slice(2)));
      if (s.startsWith('.') && inside(from)) return resolveIn(path.resolve(path.dirname(from), s));
      const m = /^@cindy\/([^/]+)(\/.*)?$/.exec(s);
      if (m) {
        const dir = path.join(root, 'packages', m[1]), manifest = path.join(dir, 'package.json');
        if (!fs.existsSync(manifest)) return undefined;
        const target = (JSON.parse(fs.readFileSync(manifest, 'utf8')).exports || {})['.' + (m[2] || '')];
        const file = typeof target === 'string' ? target : target && (target.import || target.default);
        return file ? resolveIn(path.join(dir, file)) : undefined;
      }
      return undefined;
    });
  } };
}
module.exports = { COMMIT, ENTRIES, STYLE_ENTRIES, STYLE_FILES, STAND_INS, plugin, rel };
