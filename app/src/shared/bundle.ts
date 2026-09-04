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

/**
 * 9.5's three calendar zooms, in the order the strip above the grid draws
 * them, and the values migration 0013's CHECK admits (issues #140, #142).
 *
 * **There is a second list of these keys, and it is not here**, exactly as
 * `NATIVE_VIEWS` above records for its own: `Zoom` in
 * `src/client/components/calendar/grid.ts` is the union the calendar
 * switches on, and nothing links the two. They are the same three strings on
 * purpose, so the stored value needs no mapping on either side; whoever adds
 * a fourth zoom owes `grid.ts`, this array and a migration one edit each, and
 * 9.5 is what says which zooms exist. Year zoom was cut for v1 by Q3C and is
 * deliberately absent: a value the product cannot draw is a value a person
 * can be left stuck on.
 */
export const CALENDAR_ZOOMS = ['day', 'week', 'month'] as const
export type CalendarZoom = (typeof CALENDAR_ZOOMS)[number]

/**
 * What a fresh account sees, which is what `PlannedCalendar.tsx` has always
 * opened at (`useState<Zoom>('month')`) and what migration 0013 gives the
 * column. It is also what a stored value outside `CALENDAR_ZOOMS` reads back
 * as, so a zoom retired by some later release cannot strand anybody on a grid
 * this build cannot draw.
 */
export const DEFAULT_CALENDAR_ZOOM: CalendarZoom = 'month'

export const patchSettingsBody = z.object({
  theme: z.enum(['system', 'light', 'dark']).optional(),
  row_density: z.enum(['comfortable', 'compact']).optional(),
  clock: z.enum(['12h', '24h']).optional(),
  task_open: z.enum(['dialog', 'panel', 'tab']).optional(),
  /* Imran's ruling on #140: the calendar's zoom follows the account rather
     than the browser, "consistent with other durable preferences such as
     density, clock format, and task-open surface". It rides beside those
     three because it is the same kind of fact, and `domain/bundle.ts` gained
     its reader and its writer in this same change, which is what this folder's
     own rule asks of a new request field. A value outside the three is 422
     naming `calendar_zoom` rather than a quiet narrowing to the default,
     which is 7.10's enumerated-value rule and the answer 4.10's CHECK gives
     underneath it. */
  calendar_zoom: z.enum(CALENDAR_ZOOMS).optional(),
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
  /** 4.10's `calendar_zoom` as migration 0013 added it (issues #140, #142).
   * Always one of `CALENDAR_ZOOMS`: the column's CHECK admits nothing else
   * and the read maps anything else to `DEFAULT_CALENDAR_ZOOM`. */
  calendar_zoom: CalendarZoom
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
  calendar_zoom: z.enum(CALENDAR_ZOOMS),
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
