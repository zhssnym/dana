/*
The domain module for the settings bundle and the saved views (4.19), keyed by the session's user like everything at 7.2's address.

The pin fold: pinned_views null
means never chosen, and the pins derive from the three v1 flags, so a v1
account's show_done arrives as Done pinned with no data migration at all;
once written, the column is the record and the flags stop mattering to this
surface.

**The derivation is the whole of what those three columns now do (issue
#113).** Nothing writes them any more, and this read is their only consumer
besides the `settings` key of 7.1's GET /me. They
are not dropped: a v1 account that never chose pins still gets the sidebar
its flags describe, which is exactly what this function is for, and dropping
the columns is a later contract migration. At no moment are two records
authoritative for one reader.

Desk is locked pinned (9.7): whatever a write carries, the stored list
keeps 'desk', because the place a task goes when you have not said where
has to stay reachable.
*/
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type {
  CalendarZoom,
  FocusAppearance,
  FocusAppearanceOverride,
  FocusListKey,
  PatchFocusAppearance,
  PatchSettingsBody,
  PatchViewBody,
  PostViewBody,
  SavedView,
  SettingsBundle,
} from '../../shared/bundle.js'
import {
  CALENDAR_ZOOMS,
  DEFAULT_CALENDAR_ZOOM,
  DEFAULT_FOCUS_LISTS,
  DEFAULT_PINNED,
  FOCUS_LISTS,
} from '../../shared/bundle.js'
import type { Executor } from '../database.js'
import { inTransaction, rowsOf } from '../database.js'

function toIso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString()
}

function jsonOf(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value
}

function derivePins(row: Record<string, unknown>): string[] {
  const stored = jsonOf(row.pinned_views)
  if (Array.isArray(stored)) {
    return stored.includes('desk')
      ? stored.map(String)
      : ['desk', ...stored.map(String)]
  }
  const pins = [...DEFAULT_PINNED] as string[]
  const drop = (view: string): void => {
    const at = pins.indexOf(view)
    if (at !== -1) pins.splice(at, 1)
  }
  if (row.show_important !== true) drop('important')
  if (row.show_all !== true) drop('all')
  if (row.show_done === true) pins.push('done')
  return pins
}

/*
The calendar's zoom, read defensively (issues #140, #142).

The column's CHECK admits exactly `CALENDAR_ZOOMS`, so a stored value outside
them cannot exist today and this branch is unreachable through the schema.
It is written anyway because of what the alternative costs on the day a zoom
is retired: the client parses every response through `settingsBundle`, whose
`calendar_zoom` is that same enum, so a row left carrying a dropped value
would fail the parse and the person would meet an error on the whole settings
bundle rather than a calendar drawn at the default. Reading a retired value as
`DEFAULT_CALENDAR_ZOOM` is what #140 asks for — "invalid/retired values
should fall back safely to the product default" — and it costs one comparison.

This is deliberately not done for `theme`, `clock` and the rest: their values
have never moved, nobody has asked, and a defensive read added everywhere on
the strength of one requirement is four more places for a real wrong value to
hide.
*/
function zoomFrom(value: unknown): CalendarZoom {
  const stored = String(value)
  return (CALENDAR_ZOOMS as readonly string[]).includes(stored)
    ? (stored as CalendarZoom)
    : DEFAULT_CALENDAR_ZOOM
}

const ICON_KEY = /^[a-z0-9-]{1,40}$/
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/

/**
 * Issue #353's sparse Focus identity map. The request schema guards every new
 * write; this read is defensive because the column is JSONB rather than a set
 * of scalar CHECKed columns. A malformed nested value must not make the whole
 * settings bundle unreadable. Invalid fields fall back independently, and an
 * entry with neither valid field disappears — exactly the native-default
 * state.
 */
function focusAppearanceFrom(value: unknown): FocusAppearance {
  const stored = jsonOf(value)
  if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) {
    return {}
  }

  const source = stored as Record<string, unknown>
  const result: FocusAppearance = {}
  for (const key of FOCUS_LISTS) {
    const candidate = source[key]
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
      continue
    }
    const fields = candidate as Record<string, unknown>
    const icon =
      typeof fields.icon === 'string' && ICON_KEY.test(fields.icon)
        ? fields.icon
        : null
    const color =
      typeof fields.color === 'string' && HEX_COLOR.test(fields.color)
        ? fields.color
        : null
    if (icon !== null || color !== null) result[key] = { icon, color }
  }
  return result
}

/** Merge one sparse PATCH into the stored map. Null is whole-key reset; an
 * omitted nested field is left alone; and the all-null state is canonicalized
 * away so there is only one spelling of "use the native identity". */
function mergeFocusAppearance(
  current: FocusAppearance,
  patch: PatchFocusAppearance,
): FocusAppearance {
  const next: FocusAppearance = { ...current }
  for (const key of FOCUS_LISTS) {
    if (!(key in patch)) continue
    const change = patch[key]
    if (change === null || change === undefined) {
      delete next[key]
      continue
    }
    const before: FocusAppearanceOverride = next[key] ?? { icon: null, color: null }
    const merged: FocusAppearanceOverride = {
      icon: change.icon === undefined ? before.icon : change.icon,
      color: change.color === undefined ? before.color : change.color,
    }
    if (merged.icon === null && merged.color === null) delete next[key]
    else next[key] = merged
  }
  return next
}

function bundleFrom(row: Record<string, unknown>): SettingsBundle {
  const order = jsonOf(row.sidebar_order)
  const arrangements = jsonOf(row.arrangements)
  return {
    theme: String(row.theme) as SettingsBundle['theme'],
    row_density: String(row.row_density) as SettingsBundle['row_density'],
    clock: String(row.clock) as SettingsBundle['clock'],
    task_open: String(row.task_open) as SettingsBundle['task_open'],
    calendar_zoom: zoomFrom(row.calendar_zoom),
    pinned_views: derivePins(row),
    sidebar_order: Array.isArray(order) ? order.map(String) : [],
    arrangements:
      arrangements !== null &&
      typeof arrangements === 'object' &&
      !Array.isArray(arrangements)
        ? (arrangements as Record<string, string>)
        : {},
    focus_lists: focusFrom(row.focus_lists),
    focus_appearance: focusAppearanceFrom(row.focus_appearance),
  }
}

/** The stored Focus keys, unknown and repeated keys dropped, order kept. */
function focusFrom(value: unknown): FocusListKey[] {
  const stored = jsonOf(value)
  if (!Array.isArray(stored)) return [...DEFAULT_FOCUS_LISTS]
  const known = FOCUS_LISTS as readonly unknown[]
  return stored.filter(
    (key, at): key is FocusListKey => known.includes(key) && stored.indexOf(key) === at,
  )
}

const BUNDLE_COLUMNS = sql`theme, row_density, clock, task_open, calendar_zoom,
  pinned_views, sidebar_order, arrangements, focus_lists, focus_appearance,
  show_important, show_all, show_done`

export async function readBundle(
  db: Executor,
  userId: string,
): Promise<SettingsBundle> {
  const found = await rowsOf(
    db,
    sql`SELECT ${BUNDLE_COLUMNS} FROM user_settings
        WHERE user_id = ${userId}`,
  )
  const row = found[0]
  if (row === undefined) {
    throw new Error(`user ${userId} has no settings row (INV-14)`)
  }
  return bundleFrom(row)
}

export async function writeBundle(
  db: Db,
  userId: string,
  patch: PatchSettingsBody,
): Promise<SettingsBundle> {
  return inTransaction(db, async (tx) => {
    const sets = []
    if (patch.theme !== undefined) sets.push(sql`theme = ${patch.theme}`)
    if (patch.row_density !== undefined) {
      sets.push(sql`row_density = ${patch.row_density}`)
    }
    if (patch.clock !== undefined) sets.push(sql`clock = ${patch.clock}`)
    if (patch.task_open !== undefined) {
      sets.push(sql`task_open = ${patch.task_open}`)
    }
    /* The reader above and this writer landed with the field itself (issues
       #140, #142). A declared request field with no writer is the four-package
       reminder loss `shared/tasks.ts` records: it parses, it is dropped, and
       the caller is answered 200. */
    if (patch.calendar_zoom !== undefined) {
      sets.push(sql`calendar_zoom = ${patch.calendar_zoom}`)
    }
    if (patch.pinned_views !== undefined) {
      const pins = patch.pinned_views.includes('desk')
        ? patch.pinned_views
        : ['desk', ...patch.pinned_views]
      sets.push(sql`pinned_views = ${JSON.stringify(pins)}::jsonb`)
    }
    if (patch.sidebar_order !== undefined) {
      sets.push(sql`sidebar_order = ${JSON.stringify(patch.sidebar_order)}::jsonb`)
    }
    if (patch.arrangements !== undefined) {
      sets.push(sql`arrangements = ${JSON.stringify(patch.arrangements)}::jsonb`)
    }
    if (patch.focus_lists !== undefined) {
      const unique = [...new Set(patch.focus_lists)]
      sets.push(sql`focus_lists = ${JSON.stringify(unique)}::jsonb`)
    }
    if (patch.focus_appearance !== undefined) {
      /* A row lock makes nested partial updates composable: an icon write and
         a colour write cannot both read the same stale map and overwrite one
         another. The outer settings UPDATE stays in this transaction too. */
      const stored = await rowsOf(
        tx,
        sql`SELECT focus_appearance FROM user_settings
            WHERE user_id = ${userId} FOR UPDATE`,
      )
      const row = stored[0]
      if (row === undefined) {
        throw new Error(`user ${userId} has no settings row (INV-14)`)
      }
      const appearance = mergeFocusAppearance(
        focusAppearanceFrom(row.focus_appearance),
        patch.focus_appearance,
      )
      sets.push(sql`focus_appearance = ${JSON.stringify(appearance)}::jsonb`)
    }
    if (sets.length === 0) return readBundle(tx, userId)
    sets.push(sql`updated_at = now()`)
    const updated = await rowsOf(
      tx,
      sql`UPDATE user_settings SET ${sql.join(sets, sql`, `)}
          WHERE user_id = ${userId}
          RETURNING ${BUNDLE_COLUMNS}`,
    )
    const row = updated[0]
    if (row === undefined) {
      throw new Error(`user ${userId} has no settings row (INV-14)`)
    }
    return bundleFrom(row)
  })
}

/* ------------------------------------------------------------------ *
 * Saved views (4.19): the viewer's own, 50 per account (10.3)
 * ------------------------------------------------------------------ */

const VIEW_COLUMNS = sql`id, name, definition, pinned, created_at`

function viewFrom(row: Record<string, unknown>): SavedView {
  const definition = jsonOf(row.definition)
  return {
    id: String(row.id),
    name: String(row.name),
    definition:
      definition !== null &&
      typeof definition === 'object' &&
      !Array.isArray(definition)
        ? (definition as Record<string, unknown>)
        : {},
    pinned: row.pinned === true,
    created_at: toIso(row.created_at),
  }
}

export async function listViews(db: Db, userId: string): Promise<SavedView[]> {
  const rows = await rowsOf(
    db,
    sql`SELECT ${VIEW_COLUMNS} FROM user_views
        WHERE user_id = ${userId}
        ORDER BY lower(name) ASC, id ASC`,
  )
  return rows.map(viewFrom)
}

export async function viewById(
  db: Db,
  userId: string,
  viewId: string,
): Promise<SavedView | null> {
  const rows = await rowsOf(
    db,
    sql`SELECT ${VIEW_COLUMNS} FROM user_views
        WHERE id = ${viewId} AND user_id = ${userId}`,
  )
  const row = rows[0]
  return row === undefined ? null : viewFrom(row)
}

export type CreateViewResult =
  | { kind: 'created'; view: SavedView }
  | { kind: 'view_cap' }

export async function createView(
  db: Db,
  userId: string,
  body: PostViewBody,
): Promise<CreateViewResult> {
  return inTransaction(db, async (tx) => {
    await tx.execute(sql`SELECT 1 FROM users WHERE id = ${userId} FOR UPDATE`)
    const count = await rowsOf(
      tx,
      sql`SELECT count(*)::int AS n FROM user_views
          WHERE user_id = ${userId}`,
    )
    if (Number(count[0]?.n ?? 0) >= 50) return { kind: 'view_cap' } as const
    const inserted = await rowsOf(
      tx,
      sql`INSERT INTO user_views (user_id, name, definition, pinned)
          VALUES (${userId}::uuid, ${body.name},
                  ${JSON.stringify(body.definition)}::jsonb,
                  ${body.pinned ?? false})
          RETURNING ${VIEW_COLUMNS}`,
    )
    return { kind: 'created', view: viewFrom(inserted[0] ?? {}) } as const
  })
}

export async function patchView(
  db: Db,
  userId: string,
  viewId: string,
  patch: PatchViewBody,
): Promise<SavedView | null> {
  const sets = []
  if (patch.name !== undefined) sets.push(sql`name = ${patch.name}`)
  if (patch.definition !== undefined) {
    sets.push(sql`definition = ${JSON.stringify(patch.definition)}::jsonb`)
  }
  if (patch.pinned !== undefined) sets.push(sql`pinned = ${patch.pinned}`)
  if (sets.length === 0) return viewById(db, userId, viewId)
  const updated = await rowsOf(
    db,
    sql`UPDATE user_views SET ${sql.join(sets, sql`, `)}
        WHERE id = ${viewId} AND user_id = ${userId}
        RETURNING ${VIEW_COLUMNS}`,
  )
  const row = updated[0]
  return row === undefined ? null : viewFrom(row)
}

export async function deleteView(
  db: Db,
  userId: string,
  viewId: string,
): Promise<'deleted' | 'not_found'> {
  const removed = await rowsOf(
    db,
    sql`DELETE FROM user_views
        WHERE id = ${viewId} AND user_id = ${userId}
        RETURNING id`,
  )
  return removed.length > 0 ? 'deleted' : 'not_found'
}
