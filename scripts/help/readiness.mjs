/** No secrets are logged: only the missing repository secret names. */
export function missingHelpSecrets(env) {
  return ['ANTHROPIC_API_KEY', 'HELP_BOT_TOKEN'].filter((name) => (
    typeof env[name] !== 'string' || env[name].trim().length === 0
  ))
}

/** Old setup-only failures must be retried once credentials are configured.
 * Other completed audits already have an article PR or a review issue and are
 * only repeated with the explicitly requested manual Force option. */
export function isCompletedHelpAudit(run) {
  if (!run || run.name !== 'Dana Help Audit' || run.status !== 'completed') return false
  if (run.conclusion === 'action_required' &&
      String(run.output?.summary ?? '').includes('To enable documentation drafting')) {
    return false
  }
  return true
}
