// MontClip stand-in for Cindy's chat/MarkdownRenderer (see cindy-resolve.cjs STAND_INS). AskUserQuestionPrompt shows its
// question through QuestionReferenceText; Markdown is left out for now (Deja, 2026-11-04), so the question is plain text.
export function QuestionReferenceText({ text }: { text: string; onPreviewOpenChange?: (open: boolean) => void }) { return <>{text}</>; }
