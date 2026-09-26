import { t, type StringKey } from '../i18n';

// Supabase Auth error codes, and the codes our RPCs raise as the exception message
// (supabase/migrations/*_rpcs.sql).
const keys: Record<string, StringKey> = {
  invalid_credentials: 'errors.invalidCredentials',
  user_already_exists: 'errors.emailTaken',
  email_exists: 'errors.emailTaken',
  weak_password: 'errors.weakPassword',
  email_address_invalid: 'errors.invalidEmail',
  invalid_email: 'errors.invalidEmail',
  over_request_rate_limit: 'errors.rateLimited',
  already_paired: 'errors.alreadyPaired',
  partner_already_paired: 'errors.partnerAlreadyPaired',
  couple_full: 'errors.partnerAlreadyPaired',
  code_not_found: 'errors.codeNotFound',
  code_used: 'errors.codeUsed',
  code_expired: 'errors.codeExpired',
  own_code: 'errors.ownCode',
  own_email: 'errors.ownEmail',
  invite_not_found: 'errors.inviteGone',
  invite_not_pending: 'errors.inviteGone',
  not_paired: 'errors.notPaired',
  nothing_to_undo: 'errors.nothingToUndo',
  plan_not_found: 'errors.planGone',
  plan_wrong_stage: 'errors.planStage',
  plan_bad_date: 'errors.planDate',
  plan_bad_cells: 'errors.planCells',
  plan_past_day: 'errors.planPastDay',
  plan_slot_locked: 'errors.planLocked',
  plan_not_a_match: 'errors.planNotMatch',
  plan_rejected: 'errors.planRejected',
  plan_not_in_selection: 'errors.planRejected',
  plan_no_slots: 'errors.planNoSlots',
  plan_bad_picks: 'errors.unknown',
  plan_bad_leftovers: 'errors.unknown',
};

interface ErrorLike {
  code?: string;
  message?: string;
  name?: string;
}

/** User-facing text for an error from Supabase Auth, an RPC, or the network. */
export function errorText(error: unknown): string {
  const e = (error ?? {}) as ErrorLike;
  const key = (e.code && keys[e.code]) || (e.message && keys[e.message]);
  if (key) return t(key);
  if (e.name === 'AuthRetryableFetchError' || /network request failed|fetch failed/i.test(e.message ?? '')) {
    return t('errors.network');
  }
  return t('errors.unknown');
}
