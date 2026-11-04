// MontClip stand-in for the file-preview pieces of Cindy's ToolCallCard (lib/filePreview, lib/localPathResolver,
// chat/DiffView, chat/TextLightbox; see cindy-resolve.cjs STAND_INS). Only the card's folding shell is used in MontClip:
// a step never opens a file, so there is nothing to preview.
export function shouldOpenTextLightboxForOrigin(..._args: unknown[]): boolean { return false; }
export function resolveToolFilePath(..._args: unknown[]): string | null { return null; }
export function DiffView(_props: unknown) { return null; }
export function TextLightbox(_props: unknown) { return null; }
