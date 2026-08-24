/*
The S7 domain module: the settings bundle and the saved views (4.19,
RFC 0005), keyed by the session's user like everything at 7.2's address.

The pin fold (BUG-8), as S7's change control rules it: pinned_views null
means never chosen, and the pins derive from the three v1 flags, so a v1
account's show_done arrives as Done pinned with no data migration at all;
once written, the column is the record and the flags stop mattering to this
surface. Frozen 7.2's /me/settings keeps reading and writing the flags
untouched either way, which is what keeps AC-119 to AC-123 exactly as
written. At no moment are two records authoritative for one reader.

Desk is locked pinned (9.7): whatever a write carries, the stored list
keeps 'desk', because the place a task goes when you have not said where
has to stay reachable.
*/
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type {
  PatchSettingsBody,
  PatchViewBody,
  PostViewBody,
  SavedView,
  SettingsBundle,
} from '../../shared/bundle.js'
import { DEFAULT_PINNED } from '../../shared/bundle.js'
import { inTransaction, rowsOf } from './db.js'

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

function bundleFrom(row: Record<string, unknown>): SettingsBundle {
  const order = jsonOf(row.sidebar_order)
  const arrangements = jsonOf(row.arrangements)
  return {
    theme: String(row.theme) as SettingsBundle['theme'],
    row_density: String(row.row_density) as SettingsBundle['row_density'],
    clock: String(row.clock) as SettingsBundle['clock'],
    task_open: String(row.task_open) as SettingsBundle['task_open'],
    pinned_views: derivePins(row),
    sidebar_order: Array.isArray(order) ? order.map(String) : [],
    arrangements:
      arrangements !== null &&
      typeof arrangements === 'object' &&
      !Array.isArray(arrangements)
        ? (arrangements as Record<string, string>)
        : {},
  }
}

const BUNDLE_COLUMNS = sql`theme, row_density, clock, task_open,
  pinned_views, sidebar_order, arrangements,
  show_important, show_all, show_done`

export async function readBundle(
  db: Db,
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
  const sets = []
  if (patch.theme !== undefined) sets.push(sql`theme = ${patch.theme}`)
  if (patch.row_density !== undefined) {
    sets.push(sql`row_density = ${patch.row_density}`)
  }
  if (patch.clock !== undefined) sets.push(sql`clock = ${patch.clock}`)
  if (patch.task_open !== undefined) {
    sets.push(sql`task_open = ${patch.task_open}`)
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
  if (sets.length === 0) return readBundle(db, userId)
  sets.push(sql`updated_at = now()`)
  const updated = await rowsOf(
    db,
    sql`UPDATE user_settings SET ${sql.join(sets, sql`, `)}
        WHERE user_id = ${userId}
        RETURNING ${BUNDLE_COLUMNS}`,
  )
  const row = updated[0]
  if (row === undefined) {
    throw new Error(`user ${userId} has no settings row (INV-14)`)
  }
  return bundleFrom(row)
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
