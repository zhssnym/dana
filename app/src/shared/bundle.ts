/*
The person's bundle (RFC 0005, 4.19; the 9.7 settings screen): the v2
settings surface at /settings, beside and never instead of frozen 7.2's
/me/settings, and the saved views at /views. Arrangement state serializes
ids, never display names (11.15's port note), which is the whole reason
user_views exists as a table rather than a bookmark.
*/
import { z } from 'zod'

/** The native views 9.7's pin list governs; Desk is locked pinned. */
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
  pinned_views: z.array(z.enum(NATIVE_VIEWS)).max(9).optional(),
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
