import { expect, test } from 'vitest'

import {
  createApplicationLogger,
  resolveAxiomConfiguration,
} from './logger.js'

test('Axiom logging is disabled when neither private setting exists', () => {
  const setup = createApplicationLogger({})

  expect(setup.axiom).toEqual({ state: 'disabled' })
})

test('an incomplete Axiom configuration names only the missing setting', () => {
  const secret = 'xaat-secret-that-must-not-appear'
  const setup = createApplicationLogger({ AXIOM_TOKEN: secret })

  expect(setup.axiom).toEqual({
    state: 'incomplete',
    missing: 'AXIOM_DATASET',
  })
  expect(JSON.stringify(setup.axiom)).not.toContain(secret)
})

test('a dataset without a token stays local and names only the missing token', () => {
  const setup = createApplicationLogger({ AXIOM_DATASET: 'dana-production-logs' })

  expect(setup.axiom).toEqual({
    state: 'incomplete',
    missing: 'AXIOM_TOKEN',
  })
})

test('a complete pair resolves to the scoped Axiom destination', () => {
  const secret = 'xaat-ingest-only-token'

  expect(
    resolveAxiomConfiguration({
      AXIOM_DATASET: ' dana-production-logs ',
      AXIOM_TOKEN: ` ${secret} `,
    }),
  ).toEqual({
    dataset: 'dana-production-logs',
    token: secret,
  })
})

test('blank Axiom settings are treated as absent', () => {
  const setup = createApplicationLogger({
    AXIOM_DATASET: '  ',
    AXIOM_TOKEN: '\t',
  })

  expect(setup.axiom).toEqual({ state: 'disabled' })
})
