/*
Issue #353: Focus identity is account data, not browser state. These cases pin
the sparse settings round-trip/reset contract, the shared Overdue native-place
key, and the export-version handoff that keeps the new durable field portable.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { EXPORT_VERSION, exportDocument } from '../../src/shared/export.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'focus353')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

function jsonValue(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value
}

describe('#353 durable Focus identity', () => {
  test('Focus icon/color overrides round-trip, merge per field, reset to absence, validate, and export', async () => {
    const [owner] = await cast.of(app)
    if (!owner) throw new Error('cast must produce an owner')

    const fresh = await owner.browser.json('/settings', 'GET')
    expectStatus(fresh, 200, 'fresh settings')
    expect((fresh.json() as { focus_appearance: unknown }).focus_appearance).toEqual({})

    const written = await owner.browser.json('/settings', 'PATCH', {
      focus_appearance: {
        today: { icon: 'calendar-days', color: '#416180' },
        overdue: { icon: null, color: '#AA22CC' },
      },
    })
    expectStatus(written, 200, 'write two Focus identities')
    expect((written.json() as { focus_appearance: unknown }).focus_appearance).toEqual({
      today: { icon: 'calendar-days', color: '#416180' },
      overdue: { icon: null, color: '#AA22CC' },
    })

    const iconOnly = await owner.browser.json('/settings', 'PATCH', {
      focus_appearance: { overdue: { icon: 'alarm-clock' } },
    })
    expectStatus(iconOnly, 200, 'merge one nested field')
    expect((iconOnly.json() as { focus_appearance: Record<string, unknown> }).focus_appearance.overdue).toEqual({
      icon: 'alarm-clock',
      color: '#AA22CC',
    })

    const stored = await rows(
      app.db,
      sql`SELECT focus_appearance FROM user_settings WHERE user_id = ${owner.id}::uuid`,
    )
    expect(jsonValue(stored[0]?.focus_appearance)).toEqual({
      today: { icon: 'calendar-days', color: '#416180' },
      overdue: { icon: 'alarm-clock', color: '#AA22CC' },
    })

    const resetToday = await owner.browser.json('/settings', 'PATCH', {
      focus_appearance: { today: null },
    })
    expectStatus(resetToday, 200, 'whole-key reset')
    expect((resetToday.json() as { focus_appearance: Record<string, unknown> }).focus_appearance.today).toBeUndefined()

    const clearIcon = await owner.browser.json('/settings', 'PATCH', {
      focus_appearance: { overdue: { icon: null } },
    })
    expectStatus(clearIcon, 200, 'clear only icon')
    expect((clearIcon.json() as { focus_appearance: Record<string, unknown> }).focus_appearance.overdue).toEqual({
      icon: null,
      color: '#AA22CC',
    })

    const canonicalReset = await owner.browser.json('/settings', 'PATCH', {
      focus_appearance: { overdue: { color: null } },
    })
    expectStatus(canonicalReset, 200, 'all-null override collapses to absence')
    expect((canonicalReset.json() as { focus_appearance: unknown }).focus_appearance).toEqual({})

    for (const [label, body] of [
      ['bad icon', { focus_appearance: { today: { icon: 'Calendar Days' } } }],
      ['bad color', { focus_appearance: { today: { color: 'blue' } } }],
      ['unknown Focus key', { focus_appearance: { everything: { icon: 'circle' } } }],
    ] as const) {
      expectStatus(await owner.browser.json('/settings', 'PATCH', body), 422, label)
    }

    const forExport = await owner.browser.json('/settings', 'PATCH', {
      focus_appearance: { important: { icon: 'star', color: '#123ABC' } },
    })
    expectStatus(forExport, 200, 'identity before export')

    const exported = await owner.browser.json('/me/export', 'GET')
    expectStatus(exported, 200, 'account export')
    const document = exportDocument.parse(exported.json())
    expect(EXPORT_VERSION).toBe(9)
    expect(document.version).toBe(9)
    expect(document.settings.focus_appearance).toEqual({
      important: { icon: 'star', color: '#123ABC' },
    })
  })

  test('Overdue uses the same durable cover and description place key as the other native pages', async () => {
    const [owner] = await cast.of(app)
    if (!owner) throw new Error('cast must produce an owner')

    const cover = await owner.browser.json('/place-covers/overdue', 'PUT', {
      preset: 'focus-overdue',
      focal_y: 37,
    })
    expectStatus(cover, 200, 'Overdue cover')
    expect(cover.json()).toEqual({
      place: 'overdue',
      file_id: null,
      preset: 'focus-overdue',
      focal_y: 37,
    })

    const covers = await owner.browser.json('/place-covers', 'GET')
    expectStatus(covers, 200, 'cover list')
    expect((covers.json() as { covers: Array<{ place: string }> }).covers.some((entry) => entry.place === 'overdue')).toBe(true)

    const description = await owner.browser.json('/place-descriptions/overdue', 'PUT', {
      description: 'Work that has passed its due date.',
    })
    expectStatus(description, 200, 'Overdue description')
    expect(description.json()).toEqual({
      place: 'overdue',
      description: 'Work that has passed its due date.',
    })

    const descriptions = await owner.browser.json('/place-descriptions', 'GET')
    expectStatus(descriptions, 200, 'description list')
    expect(
      (descriptions.json() as { descriptions: Array<{ place: string; description: string | null }> }).descriptions.find(
        (entry) => entry.place === 'overdue',
      ),
    ).toEqual({ place: 'overdue', description: 'Work that has passed its due date.' })

    expectStatus(await owner.browser.api('/place-covers/overdue', { method: 'DELETE' }), 204, 'remove Overdue cover')
    const removed = await rows(
      app.db,
      sql`SELECT place FROM user_page_covers WHERE user_id = ${owner.id}::uuid AND place = 'overdue'`,
    )
    expect(removed).toEqual([])

    const clearedDescription = await owner.browser.json('/place-descriptions/overdue', 'PUT', {
      description: null,
    })
    expectStatus(clearedDescription, 200, 'clear Overdue description')
    expect(clearedDescription.json()).toEqual({ place: 'overdue', description: null })
  })
})
