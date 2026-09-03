/*
The person's bundle (RFC 0005, 4.19; the 9.7 settings screen): the v2
settings surface at /settings, beside and never instead of frozen 7.2's
/me/settings, and the saved views at /views. Arrangement state serializes
ids, never display names (11.15's port note), which is the whole reason
user_views exists as a table rather than a bookmark.
*/
import { z } from 'zod'

/**
 * The native views 9.7's pin list governs; Desk is locked pinned.
 *
 * **There is a second list of these keys, and it is not here.**
 * `src/client/routes.ts` restates them as the `NativeViewKey` union and again
 * as `navPages`, which is what the sidebar actually draws, and nothing links
 * either to this array (#39). So a tenth view added here compiles on both
 * sides, is accepted by `patchSettingsBody` below, is stored, is returned by
 * `GET /settings` — and never draws, because `pinnedNavPages` filters
 * `navPages` and `navPages` has no row for it. Closing that is a client
 * change and is tracked separately; until it lands, **a view added here is
 * half a view**, and whoever adds one owes `routes.ts` the same edit.
 */
export const NATIVE_VIEWS = [
  'desk',
  'today',
  'scheduled',
  'assignments',
  'important',
  'all',
  'done',
  'abandoned',
  'anytime',
] as const
export type NativeView = (typeof NATIVE_VIEWS)[number]

/** 9.1's fixed order, the pins a fresh account carries. */
export const DEFAULT_PINNED: readonly NativeView[] = [
  'desk',
  'today',
  'scheduled',
  'assignments',
  'important',
  'all',
]

export const patchSettingsBody = z.object({
  theme: z.enum(['system', 'light', 'dark']).optional(),
  row_density: z.enum(['comfortable', 'compact']).optional(),
  clock: z.enum(['12h', '24h']).optional(),
  task_open: z.enum(['dialog', 'panel', 'tab']).optional(),
  /* The cap is "every native view, and no more", so it is the array's own
     length rather than the 9 that was written here: a tenth view added above
     used to make a full pin list a 422, which is the second way that array
     was load-bearing at a distance (#39). */
  pinned_views: z.array(z.enum(NATIVE_VIEWS)).max(NATIVE_VIEWS.length).optional(),
  sidebar_order: z.array(z.uuid()).max(300).optional(),
  arrangements: z.record(z.uuid(), z.string().max(40)).optional(),
})
export type PatchSettingsBody = z.infer<typeof patchSettingsBody>

export interface SettingsBundle {
  theme: 'system' | 'light' | 'dark'
  row_density: 'comfortable' | 'compact'
  clock: '12h' | '24h'
  task_open: 'dialog' | 'panel' | 'tab'
  pinned_views: string[]
  sidebar_order: string[]
  arrangements: Record<string, string>
}

/* ------------------------------------------------------------------ *
 * Saved views (4.19)
 * ------------------------------------------------------------------ */

export const postViewBody = z.object({
  name: z.string().min(1).max(40),
  /** The filter model, zod-checked for shape and size; its values are ids
   * by the client serializer's discipline, which AC-209 pins. */
  definition: z.record(z.string().max(40), z.unknown()),
  pinned: z.boolean().optional(),
})
export type PostViewBody = z.infer<typeof postViewBody>

export const patchViewBody = postViewBody.partial()
export type PatchViewBody = z.infer<typeof patchViewBody>

export interface SavedView {
  id: string
  name: string
  definition: Record<string, unknown>
  pinned: boolean
  created_at: string
}

/*
The read half, added by the S9 client arm on 2026-08-24, for the reason
`shelves.ts` records at its own addition: S7 published the patch body and the
`SettingsBundle` interface, and `api/http.ts` parses every response through a
zod schema, so the sidebar cannot read its own pin list without this. The
interface above stays the type the server writes against; this is the same
shape as a parser, and the two are asserted equal by construction below.
*/
export const settingsBundle = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  row_density: z.enum(['comfortable', 'compact']),
  clock: z.enum(['12h', '24h']),
  task_open: z.enum(['dialog', 'panel', 'tab']),
  pinned_views: z.array(z.string()),
  sidebar_order: z.array(z.string()),
  arrangements: z.record(z.string(), z.string()),
})
export const getSettingsResponse = settingsBundle
export type GetSettingsResponse = z.infer<typeof settingsBundle>

/* A compile-time equality: the parser and the interface the server writes
   against are one shape, so a field added to one and not the other is a
   typecheck failure rather than a runtime surprise in the sidebar. */
const _bundleShapesAgree: GetSettingsResponse extends SettingsBundle
  ? SettingsBundle extends GetSettingsResponse
    ? true
    : never
  : never = true
void _bundleShapesAgree

export const savedView = z.object({
  id: z.uuid(),
  name: z.string(),
  definition: z.record(z.string(), z.unknown()),
  pinned: z.boolean(),
  created_at: z.string(),
})
export const getViewsResponse = z.array(savedView)
export type GetViewsResponse = z.infer<typeof getViewsResponse>
