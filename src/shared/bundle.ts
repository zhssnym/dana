/*
The person's bundle (4.19): settings at /settings and saved views at /views.
Arrangement state stores ids, never display names.
*/
import { z } from 'zod'

import { hexColor } from './folders.js'

/**
 * Native views the pin list governs; Desk is always pinned. A view added here
 * also needs a row in `navPages` (client/routes.ts), or it is stored but never drawn.
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

/** 9.1's default pins, in order. */
export const DEFAULT_PINNED: readonly NativeView[] = [
  'desk',
  'today',
  'scheduled',
  'assignments',
  'important',
  'all',
]

/**
 * Calendar zooms (migration 0013's CHECK). `Zoom` in client calendar/grid.ts
 * repeats them unlinked: a new zoom needs that, this array and a migration.
 */
export const CALENDAR_ZOOMS = ['day', 'week', 'month'] as const
export type CalendarZoom = (typeof CALENDAR_ZOOMS)[number]

/** Default zoom, and what an unknown stored value reads back as. */
export const DEFAULT_CALENDAR_ZOOM: CalendarZoom = 'month'

/** Focus lists in "+" menu order; the first three are defaults. `focus_lists` stores the chosen keys in order. */
export const FOCUS_LISTS = [
  'today',
  'scheduled',
  'assignments',
  'important',
  'overdue',
  'undated',
  'open',
] as const
export type FocusListKey = (typeof FOCUS_LISTS)[number]
export const DEFAULT_FOCUS_LISTS: readonly FocusListKey[] = ['today', 'scheduled', 'assignments']

/*
Sparse Focus identity overrides: an absent key means the native icon and
colour; a present object with one null field keeps the other overridden. The
PATCH shape makes both fields optional so changing one never clears the other.
*/
const focusIconKey = z
  .string()
  .regex(/^[a-z0-9-]{1,40}$/, 'must be an icon key')

export const focusAppearanceOverride = z.object({
  icon: focusIconKey.nullable(),
  color: hexColor.nullable(),
})
export type FocusAppearanceOverride = z.infer<typeof focusAppearanceOverride>

export const focusAppearance = z.partialRecord(
  z.enum(FOCUS_LISTS),
  focusAppearanceOverride,
)
export type FocusAppearance = z.infer<typeof focusAppearance>

const patchFocusAppearanceOverride = focusAppearanceOverride.partial()
export const patchFocusAppearance = z.partialRecord(
  z.enum(FOCUS_LISTS),
  patchFocusAppearanceOverride.nullable(),
)
export type PatchFocusAppearance = z.infer<typeof patchFocusAppearance>

export const patchSettingsBody = z.object({
  theme: z.enum(['system', 'light', 'dark']).optional(),
  row_density: z.enum(['comfortable', 'compact']).optional(),
  clock: z.enum(['12h', '24h']).optional(),
  task_open: z.enum(['dialog', 'panel', 'tab']).optional(),
  /* Per account (#140). Outside the three is 422, not a silent default. */
  calendar_zoom: z.enum(CALENDAR_ZOOMS).optional(),
  feedback_reminder_dismissed: z.boolean().optional(),
  /** Acknowledged nonhistorical public updates. The server merges IDs instead of replacing them. */
  updates_seen_ids: z.array(z.string().regex(/^pr-[1-9]\d*$/)).max(100).optional(),
  /* Capped by the array's length, so adding a view never makes a full list 422. */
  pinned_views: z.array(z.enum(NATIVE_VIEWS)).max(NATIVE_VIEWS.length).optional(),
  sidebar_order: z.array(z.uuid()).max(300).optional(),
  arrangements: z.record(z.uuid(), z.string().max(40)).optional(),
  focus_lists: z.array(z.enum(FOCUS_LISTS)).max(FOCUS_LISTS.length).optional(),
  /** Per-key patch: null removes the override; a nested null clears one field.
   * An entry with both fields null is removed by the server. */
  focus_appearance: patchFocusAppearance.optional(),
})
export type PatchSettingsBody = z.infer<typeof patchSettingsBody>

export interface SettingsBundle {
  theme: 'system' | 'light' | 'dark'
  row_density: 'comfortable' | 'compact'
  clock: '12h' | '24h'
  task_open: 'dialog' | 'panel' | 'tab'
  /** Always one of CALENDAR_ZOOMS: the read maps anything else to the default. */
  calendar_zoom: CalendarZoom
  feedback_reminder_dismissed: boolean
  updates_seen_ids: string[]
  pinned_views: string[]
  sidebar_order: string[]
  arrangements: Record<string, string>
  focus_lists: FocusListKey[]
  focus_appearance: FocusAppearance
}

export const postViewBody = z.object({
  name: z.string().min(1).max(40),
  /** Shape and size only. Values should be ids (AC-209); nothing checks that. */
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

/* The zod half of SettingsBundle, checked equal to the interface below. */
export const settingsBundle = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  row_density: z.enum(['comfortable', 'compact']),
  clock: z.enum(['12h', '24h']),
  task_open: z.enum(['dialog', 'panel', 'tab']),
  calendar_zoom: z.enum(CALENDAR_ZOOMS),
  feedback_reminder_dismissed: z.boolean(),
  updates_seen_ids: z.array(z.string().regex(/^pr-[1-9]\d*$/)),
  pinned_views: z.array(z.string()),
  sidebar_order: z.array(z.string()),
  arrangements: z.record(z.string(), z.string()),
  focus_lists: z.array(z.enum(FOCUS_LISTS)),
  focus_appearance: focusAppearance,
})
export const getSettingsResponse = settingsBundle
export type GetSettingsResponse = z.infer<typeof settingsBundle>

/* Compile-time check that the parser and the interface stay one shape. */
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
