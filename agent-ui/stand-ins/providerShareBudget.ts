// MontClip stand-in for Cindy's shared/providerShareBudget (see cindy-resolve.cjs STAND_INS): the one check
// ErrorMessageCard uses, copied as it is in makecindy/cindy@43001ea (Apache-2.0, Copyright 2026 XD Inc.), without the
// rest of the file, which imports all of @cindy/model-providers.
export function isMemberBudgetPaused(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return message.includes('[REMOTE_AGENT_MEMBER_BUDGET_PAUSED]');
}
