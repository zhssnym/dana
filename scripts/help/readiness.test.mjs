import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { isCompletedHelpAudit, missingHelpSecrets } from './readiness.mjs'

test('missing credentials are reported by name, never by value', () => {
  assert.deepEqual(missingHelpSecrets({}), ['ANTHROPIC_API_KEY', 'HELP_BOT_TOKEN'])
  assert.deepEqual(missingHelpSecrets({ ANTHROPIC_API_KEY: 'configured', HELP_BOT_TOKEN: 'configured' }), [])
  assert.deepEqual(missingHelpSecrets({ ANTHROPIC_API_KEY: '  ', HELP_BOT_TOKEN: 'configured' }), ['ANTHROPIC_API_KEY'])
  assert.deepEqual(missingHelpSecrets({ HELP_WRITER_MODEL: 'gpt-4.1-mini', ANTHROPIC_API_KEY: 'configured', HELP_BOT_TOKEN: 'configured' }), ['OPENAI_API_KEY'])
})

test('previous secret-related audit errors are retryable after setup', () => {
  assert.equal(isCompletedHelpAudit({
    name: 'Dana Help Audit',
    status: 'completed',
    conclusion: 'action_required',
    output: { summary: 'To enable documentation drafting, set repository secrets OPENAI_API_KEY and HELP_BOT_TOKEN. No article was changed.' },
  }), false)
})

test('successful or review-required audits stay recorded to avoid duplicate PRs and issues', () => {
  assert.equal(isCompletedHelpAudit({
    name: 'Dana Help Audit', status: 'completed', conclusion: 'success',
    output: { summary: 'Verified documentation.' },
  }), true)
  assert.equal(isCompletedHelpAudit({
    name: 'Dana Help Audit', status: 'completed', conclusion: 'action_required',
    output: { summary: 'An unclear change needs review.' },
  }), true)
  assert.equal(isCompletedHelpAudit({ name: 'other', status: 'completed', conclusion: 'success' }), false)
  assert.equal(isCompletedHelpAudit({ name: 'Dana Help Audit', status: 'in_progress' }), false)
})
