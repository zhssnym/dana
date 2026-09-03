/*
AC-365: given an account provisioned after migration 0010, then 4.10's
task_open reads `dialog`, which is the ruled default, and the stored column
default is `dialog` rather than the `panel` S12 chose before anything
consumed the column; and `panel` is still a value the column accepts, because
what changed is which one a person starts on and not how many homes a task
has.

**The column was the last thing in the build still saying panel.** Every
surface that draws the value already defaults to the dialog:
`screens/settings-screen.tsx` reads `task_open ?? "dialog"`,
`lib/task-surface-preference.ts` answers `dialog` before anybody has chosen,
9.3 says a task opens as a dialog, and AC-261's own afterEach restores
`'dialog'` as "what a fresh account carries". Only the DEFAULT disagreed, and
because nothing read the column as the record, nothing went red over it.

**Both halves of the default are asserted, and they are different facts.**
The read through 7.2 proves what a person gets; `information_schema` proves
what the column itself says, which is what the next row inserted by anything
that does not go through provisioning — the seed, a fixture, a future
migration — will get. Reading only the endpoint would pass on a build that
had hard-coded the answer in `domain/bundle.ts` and left the column wrong,
which is the exact shape of the defect this closes.

**The migration's other statement cannot be asserted here, and pretending
otherwise would be worse than saying so.** `0010` also moves existing rows
off `panel`, and on a fresh test database there are no existing rows: the
migration runs against nothing. That is the same honesty AC-211 records for
the Inbox-to-Desk rename, and it is why the update statement carries its
reasoning in the migration file rather than in a criterion.

Spec: 4.10, 7.2, 9.3, 9.7. Issue #30.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { rows } from './helpers.js'

let app: AuthTestApp
const cast = new Cast(['fresh'], 'i30')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-365 a task opens as a dialog until somebody says otherwise', () => {
  test('a fresh account reads dialog, and the column itself defaults to dialog', async () => {
    const [fresh] = (await cast.of(app)) as [Actor]

    const read = await fresh.browser.json('/settings', 'GET')
    expectStatus(read, 200, 'the bundle reads (spec 7.2)')
    expect(
      (read.json() as { task_open?: unknown }).task_open,
      'spec 9.3: a task opens as a dialog, and the account must say so from the first read rather than carrying the panel S12 defaulted to when nothing consumed the column',
    ).toBe('dialog')

    const stored = await rows(
      app.db,
      sql`SELECT task_open FROM user_settings WHERE user_id = ${fresh.id}::uuid`,
    )
    expect(
      stored[0]?.task_open,
      'provisioning writes no value for this column, so the row carries whatever the DEFAULT is',
    ).toBe('dialog')

    const declared = await rows(
      app.db,
      sql`SELECT column_default FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'user_settings'
            AND column_name = 'task_open'`,
    )
    expect(
      String(declared[0]?.column_default ?? ''),
      'the column’s own DEFAULT, not the endpoint’s answer: a build that hard-coded dialog in domain/bundle.ts and left the column saying panel would pass every assertion above',
    ).toContain("'dialog'")
  })

  test('panel is still a home a person can choose', async () => {
    const [fresh] = (await cast.of(app)) as [Actor]

    const chosen = await fresh.browser.json('/settings', 'PATCH', {
      task_open: 'panel',
    })
    expectStatus(chosen, 200, 'the choice writes (spec 7.2)')
    expect(
      (chosen.json() as { task_open?: unknown }).task_open,
      'spec 9.3 names three homes and 4.10’s CHECK admits three: what moved is which one a person starts on, and a "fix" that dropped panel would close the issue by removing the feature',
    ).toBe('panel')

    const back = await fresh.browser.json('/settings', 'PATCH', {
      task_open: 'dialog',
    })
    expectStatus(back, 200, 'and back, so the shared-database leg leaves no chosen value behind')
  })
})
