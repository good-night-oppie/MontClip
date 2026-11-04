// MontClip stand-in for Cindy's lib/makerChatStore (see cindy-resolve.cjs STAND_INS). ErrorMessageCard asks it to
// decode Cindy's remote-agent error codes; MontClip's errors never carry those codes, so the message stays as it is.
export function remoteErrorI18nKey(_msg: string): string | undefined { return undefined; }
export function decodeRemoteErrorMessage(msg: string): string { return msg; }
