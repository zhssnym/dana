import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { checkArticles, currentArticles, parseHelp } from './check.mjs'
import { impactedHelp } from './topics.mjs'

const sample = (body = 'This is a clear and direct explanation of an existing behavior in Dana, with enough detail to be useful.') =>
  '---\ntitle: Example help article\nsummary: Understand a current behavior in Dana.\nsection: Getting started\nrelated:\n---\n' + body + '\n'

test('existing articles have stable valid links and metadata', () => {
  assert.ok(checkArticles(currentArticles()).size > 0)
})

test('rejects broken links and untrusted HTML without publishing', () => {
  assert.throws(() => checkArticles(new Map([['example', sample('[Another](/help/missing)')]])), /broken help link/)
  assert.throws(() => parseHelp('example', sample('<script>alert(1)</script>')), /raw HTML/)
  assert.throws(() => parseHelp('example', sample('Dana seamlessly improves every process.')), /marketing filler/)
})

test('maps changes to existing guides and preserves unknown areas for review', () => {
  const impact = impactedHelp([
    'src/client/components/task-schedule-picker.tsx',
    'tests/e2e/task-schedule.spec.ts',
    'src/client/brand-new-feature.tsx',
  ])
  assert.ok(impact.slugs.includes('schedule-a-task'))
  assert.deepEqual(impact.changedTests, ['tests/e2e/task-schedule.spec.ts'])
  assert.deepEqual(impact.unmatched, ['src/client/brand-new-feature.tsx'])
})
