/*
The 7.27 Folder facet contract. Facets are now project tabs (migration 0061);
these shapes remain for the legacy facet reads in routes/workshop.ts.
`name` is resolved by the server, never stored: for Purpose and Results a null
`display_name` means the default name.
*/
import { z } from 'zod'

/** `folder_facets_kind_check`, same order. */
export const FACET_KINDS = [
  'main',
  'purpose',
  'consultation',
  'results',
  'work',
  'shared_blank',
  'private_blank',
] as const
export type FacetKind = (typeof FACET_KINDS)[number]

/** One of each per Folder (`folder_facets_folder_native_kind_idx`). */
export const NATIVE_FACET_KINDS = [
  'main',
  'purpose',
  'consultation',
  'results',
] as const
export type NativeFacetKind = (typeof NATIVE_FACET_KINDS)[number]
export const isNativeFacetKind = (kind: string): kind is NativeFacetKind =>
  (NATIVE_FACET_KINDS as readonly string[]).includes(kind)

export const BLANK_FACET_KINDS = ['shared_blank', 'private_blank'] as const
export const isBlankFacetKind = (kind: string): boolean =>
  (BLANK_FACET_KINDS as readonly string[]).includes(kind)

/** Natives with their own document. Main's document is the Folder page. */
export const DOCUMENT_NATIVE_FACET_KINDS = ['purpose', 'results'] as const
export type DocumentNativeFacetKind =
  (typeof DOCUMENT_NATIVE_FACET_KINDS)[number]
export const isDocumentNativeFacetKind = (
  kind: string,
): kind is DocumentNativeFacetKind =>
  (DOCUMENT_NATIVE_FACET_KINDS as readonly string[]).includes(kind)

/** Natives that may be hidden; never Main (`folder_facets_hidden_kind_check`). */
export const HIDEABLE_FACET_KINDS = ['purpose', 'consultation', 'results'] as const
export const isHideableFacetKind = (kind: string): boolean =>
  (HIDEABLE_FACET_KINDS as readonly string[]).includes(kind)

/** Natives a member may rename or reset to NULL. */
export const RENAMEABLE_FACET_KINDS = ['purpose', 'results'] as const
export const isRenameableFacetKind = (kind: string): boolean =>
  (RENAMEABLE_FACET_KINDS as readonly string[]).includes(kind)

/** Default names, kept on the server so every reader shows the same word. */
export const DEFAULT_FACET_NAMES: Readonly<Record<NativeFacetKind, string>> = {
  /* Display names only; the stored kinds stay `main` and `consultation`. */
  main: 'Work',
  purpose: 'Purpose',
  consultation: 'Discussion',
  results: 'Results',
}

/** Display order of the native tabs; the stored order is unchanged. */
export const NATIVE_TAB_ORDER: readonly NativeFacetKind[] = [
  'purpose',
  'main',
  'results',
  'consultation',
]

/** `folder_facets_display_name_length_check`. */
export const MAX_FACET_NAME = 120

const facetName = z.string().min(1).max(MAX_FACET_NAME)

export const facet = z.object({
  id: z.uuid(),
  kind: z.enum(FACET_KINDS),
  /** Server-resolved, never stored, never null. */
  name: z.string(),
  /** The stored override; null on Purpose and Results means the default name. */
  display_name: z.string().nullable(),
  hidden: z.boolean(),
  private: z.boolean(),
  owner_id: z.uuid().nullable(),
  position: z.string(),
  h1_block_id: z.uuid().nullable(),
  /** Stale-write token. */
  updated_at: z.string(),
})
export type Facet = z.infer<typeof facet>

export const getFacetsResponse = z.object({ facets: z.array(facet) })
export type GetFacetsResponse = z.infer<typeof getFacetsResponse>

/** Routing bridge from `/app/facets/:id` to the Folder that holds the facet. */
export const getFacetLocationResponse = z.object({
  folder_id: z.uuid(),
})
export type GetFacetLocationResponse = z.infer<typeof getFacetLocationResponse>

/* Write bodies. No route reads these any more. */

/** `POST /folders/:id/facets`. */
export const postFacetBody = z.object({
  kind: z.enum(FACET_KINDS),
  /** Required on `work`: a depth-1 Section of this Folder's page. */
  h1_block_id: z.uuid().optional(),
  /** Required on the two blanks. */
  display_name: facetName.optional(),
  /** Absent appends. */
  after_facet_id: z.uuid().nullable().optional(),
})
export type PostFacetBody = z.infer<typeof postFacetBody>

/**
 * `PATCH /folders/:id/facets/:facetId`. Absent leaves the name; null resets it,
 * so both `.nullable()` and `.optional()` are needed.
 */
export const patchFacetBody = z
  .object({
    display_name: facetName.nullable().optional(),
    hidden: z.boolean().optional(),
    /** A mismatch is 409. */
    updated_at: z.iso.datetime().optional(),
  })
  .refine(
    (body) => body.display_name !== undefined || body.hidden !== undefined,
    { message: 'a patch names at least one of display_name and hidden' },
  )
export type PatchFacetBody = z.infer<typeof patchFacetBody>

/** `PUT /folders/:id/facets/order`: the whole shared order; a private id is 422. */
export const putFacetOrderBody = z.object({
  order: z.array(z.uuid()).min(1).max(200),
})
export type PutFacetOrderBody = z.infer<typeof putFacetOrderBody>

/** `PUT /folders/:id/facets/my-order`: the caller's private facets only. */
export const putMyFacetOrderBody = z.object({
  placements: z
    .array(
      z.object({
        facet_id: z.uuid(),
        after_facet_id: z.uuid().nullable(),
      }),
    )
    .min(1)
    .max(200),
})
export type PutMyFacetOrderBody = z.infer<typeof putMyFacetOrderBody>

/** `POST /folders/:id/facets/:facetId/share`. `z.literal(true)` refuses false too. */
export const shareFacetBody = z.object({ confirm: z.literal(true) })
export type ShareFacetBody = z.infer<typeof shareFacetBody>
