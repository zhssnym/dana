import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { checkUpdates, currentUpdates } from './check.mjs'
import { classifyPR } from './select.mjs'

const original = currentUpdates()

test('historical backfill has valid and unique public permalinks', () => {
  assert.ok(checkUpdates(original).entries.length >= 3)
  assert.ok(original.entries.every((entry) => entry.id === 'pr-' + entry.pr))
})

test('duplicates, malformed text, and non-shipped data do not enter the public feed', () => {
  const repeated = { version: 1, entries: [original.entries[0], original.entries[0]] }
  assert.throws(() => checkUpdates(repeated), /duplicate/)
  const article = { ...original.entries[0], summary: 'Our revolutionary seamless AI-powered product changes everything' }
  assert.throws(() => checkUpdates({ version: 1, entries: [article] }), /editorial rules/)
  assert.throws(() => checkUpdates({ version: 1, entries: [{ ...original.entries[0], commit: 'unverified' }] }), /source SHA/)
})

test('users get the change, not CI or dependency release noise', () => {
  const relevant = classifyPR({
    title: 'feat: improve task scheduling (#901)',
    body: '## What changed\n- Choose a Start Date and Due Date independently for each task in the scheduling picker.',
    labels: [],
  }, [{ filename: 'src/client/components/task-schedule.tsx' }])
  assert.equal(relevant.status, 'include')
  assert.equal(relevant.kind, 'feature')
  assert.match(relevant.summary, /Choose a Start Date/)

  assert.equal(classifyPR({
    title: 'chore: update dependencies',
    body: '- Upgrade internal dependencies in the lockfile.',
    labels: [],
  }, [{ filename: 'package-lock.json' }]).status, 'skip')

  assert.equal(classifyPR({
    title: 'feat: adjust hidden backend scheduler',
    body: '- This adds no visible controls.',
    labels: [{ name: 'updates:skip' }],
  }, [{ filename: 'src/client/pages/SettingsPage.tsx' }]).status, 'skip')
})

test('unclear PR copy is sent to review rather than invented', () => {
  const result = classifyPR({
    title: 'fix: improve Calendar task controls',
    body: '## Checks\n- Run CI and update unit tests in the repository.',
    labels: [],
  }, [{ filename: 'src/client/views/calendar/Calendar.tsx' }])
  assert.equal(result.status, 'review')
})
