/*
The 7.27 Folder facet contract, which both sides import (issue #210, M1-F).

A facet is one way into a Folder. There are four natives -- Main, Purpose,
Consultation and Results, exactly one of each, created with the Folder and
never lazily -- and the custom ones a member adds: a **Work** facet, which is
a live view of one H1 section of Main and stores no document of its own; a
**shared blank** facet, which has its own document and is shared by Folder
Access; and a **private blank** facet, which has its own document and is
visible only to the person who made it.

## The three things this file is careful about

**`name` is server-resolved and is never a stored column.** Main and
Consultation have fixed names. Purpose and Results carry an optional
`display_name`, and **NULL there is the default name rather than an absence** --
Reset is a write of NULL, which is why `display_name` is nullable on the wire
and `name` never is. A Work facet's name is its H1 block's text **at read
time**, so renaming the heading renames the facet and no rename route can
touch it. A blank facet's name is its `display_name`, which is required.

**`private` is a projection of `owner_id` and both are sent.** They cannot
disagree -- `folder_facets_owner_kind_check` makes `owner_id IS NOT NULL`
exactly equivalent to `kind = 'private_blank'` in the database -- and both are
here because a client drawing the privacy treatment #210 asks for should not
have to know that equivalence, while a client deciding whether to offer the
share action needs the id to compare against the viewer.

**A request field this file declares and no route reads is dropped with a
200**, the silent-drop hazard `shared/tasks.ts` describes for the reminder.
Every field below is read by `server/routes/facets.ts`; AC-830 to AC-844 in
7.27 state what must arrive.
*/
import { z } from 'zod'

/** 4.30's `folder_facets_kind_check`, in the same order. */
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

/**
 * The four that exist for every Folder, in the order 0027 backfills them and
 * `POST /folders` writes them. **Exactly one of each**, which
 * `folder_facets_folder_native_kind_idx` makes a database fact rather than a
 * handler's good intentions.
 */
export const NATIVE_FACET_KINDS = [
  'main',
  'purpose',
  'consultation',
  'results',
] as const
export type NativeFacetKind = (typeof NATIVE_FACET_KINDS)[number]
export const isNativeFacetKind = (kind: string): kind is NativeFacetKind =>
  (NATIVE_FACET_KINDS as readonly string[]).includes(kind)

/** The two kinds that hold a document of their own. */
export const BLANK_FACET_KINDS = ['shared_blank', 'private_blank'] as const
export const isBlankFacetKind = (kind: string): boolean =>
  (BLANK_FACET_KINDS as readonly string[]).includes(kind)

/**
 * The natives that hold a document of their own: Purpose (#211) and Results
 * (#213). Main's document is the Folder page; Consultation holds none yet.
 */
export const DOCUMENT_NATIVE_FACET_KINDS = ['purpose', 'results'] as const
export type DocumentNativeFacetKind =
  (typeof DOCUMENT_NATIVE_FACET_KINDS)[number]
export const isDocumentNativeFacetKind = (
  kind: string,
): kind is DocumentNativeFacetKind =>
  (DOCUMENT_NATIVE_FACET_KINDS as readonly string[]).includes(kind)

/**
 * The three natives that may be hidden and restored (#210). **Main is absent
 * and its absence is the rule**, and a custom facet is absent because a
 * custom facet is deleted rather than hidden.
 * `folder_facets_hidden_kind_check` says the same thing in the database.
 */
export const HIDEABLE_FACET_KINDS = ['purpose', 'consultation', 'results'] as const
export const isHideableFacetKind = (kind: string): boolean =>
  (HIDEABLE_FACET_KINDS as readonly string[]).includes(kind)

/**
 * The two natives whose name a member may change, and reset to NULL.
 * Main's and Consultation's names are fixed (#210), and a `display_name` on
 * either -- or on a Work facet, whose name is its H1's -- is 422.
 */
export const RENAMEABLE_FACET_KINDS = ['purpose', 'results'] as const
export const isRenameableFacetKind = (kind: string): boolean =>
  (RENAMEABLE_FACET_KINDS as readonly string[]).includes(kind)

/**
 * The default names, and the one place they are written down.
 *
 * They are the server's because `name` is resolved on the read: a client that
 * carried its own copy would show a different word from the one an export, an
 * email or a second client shows. A Work facet is absent from this table
 * because it has no default -- its name is its H1's text, and an H1 with no
 * text answers the empty string rather than a name nobody chose.
 */
export const DEFAULT_FACET_NAMES: Readonly<Record<NativeFacetKind, string>> = {
  /* Round 2's page tabs read intro, work, conclusion: Purpose, Work, Results,
     Discussion. These are display names only; the stored kinds stay `main`
     and `consultation`, which every route, row and address still carries. */
  main: 'Work',
  purpose: 'Purpose',
  consultation: 'Discussion',
  results: 'Results',
}

/**
 * The order a page draws its tabs in: intro, work, conclusion, conversation,
 * then the custom tabs in their stored order. Display only; the stored order
 * (Main first, `PUT /facets/order`) is unchanged.
 */
export const NATIVE_TAB_ORDER: readonly NativeFacetKind[] = [
  'purpose',
  'main',
  'results',
  'consultation',
]

/** 4.30's `folder_facets_display_name_length_check`, which is 4.17's heading
 * ceiling one table over. */
export const MAX_FACET_NAME = 120

const facetName = z.string().min(1).max(MAX_FACET_NAME)

/* ------------------------------------------------------------------ *
 * The read
 * ------------------------------------------------------------------ */

export const facet = z.object({
  id: z.uuid(),
  kind: z.enum(FACET_KINDS),
  /** Server-resolved, never stored, never null. See the header. */
  name: z.string(),
  /** The stored override, or null. Null on Purpose and Results means "the
   * default name", which is why this is sent beside `name` rather than
   * folded into it: only this field tells a client whether Reset does
   * anything. */
  display_name: z.string().nullable(),
  hidden: z.boolean(),
  private: z.boolean(),
  owner_id: z.uuid().nullable(),
  position: z.string(),
  h1_block_id: z.uuid().nullable(),
  /** 7.0's stale-write token, which `PATCH` carries back. */
  updated_at: z.string(),
})
export type Facet = z.infer<typeof facet>

export const getFacetsResponse = z.object({ facets: z.array(facet) })
export type GetFacetsResponse = z.infer<typeof getFacetsResponse>

/**
 * The canonical Purpose facet route is stable at `/app/facets/:id`, while
 * the actual workspace lives inside its Folder. This tiny read supplies only
 * the routing fact needed to bridge those two addresses; it intentionally
 * does not widen Dana Link summaries with Folder metadata.
 */
export const getFacetLocationResponse = z.object({
  folder_id: z.uuid(),
})
export type GetFacetLocationResponse = z.infer<typeof getFacetLocationResponse>

/* ------------------------------------------------------------------ *
 * The writes
 * ------------------------------------------------------------------ */

/**
 * `POST /folders/:id/facets`.
 *
 * Every kind is admitted by the schema and the four natives are refused by
 * the route with a 422 naming `kind`, rather than being left out of the enum.
 * The reason is the refusal order 7.27 fixes -- 404, then 422, then
 * 403 -- and the sentence a person reads: "a native facet already exists and
 * is not created" is the true answer, and an enum would answer "expected one
 * of work | shared_blank | private_blank", which is a shape complaint about a
 * rule.
 */
export const postFacetBody = z.object({
  kind: z.enum(FACET_KINDS),
  /** Required on `work`, refused on everything else. The block must be a
   * depth-1 Section of this Folder's own page. */
  h1_block_id: z.uuid().optional(),
  /** Required on the two blanks, refused on everything else. */
  display_name: facetName.optional(),
  /** Where to put it in the order the caller can see. Absent appends. */
  after_facet_id: z.uuid().nullable().optional(),
})
export type PostFacetBody = z.infer<typeof postFacetBody>

/**
 * `PATCH /folders/:id/facets/:facetId`.
 *
 * `display_name: null` is **Reset** on Purpose and Results, and 422 on a
 * blank facet, whose name is required. `.nullable()` and `.optional()`
 * together are load-bearing: absent means "do not touch the name" and null
 * means "write null", and a schema that could not tell them apart would make
 * Reset unreachable.
 */
export const patchFacetBody = z
  .object({
    display_name: facetName.nullable().optional(),
    hidden: z.boolean().optional(),
    /** 7.0's stale-write evidence. Optional, and a mismatch is 409. */
    updated_at: z.iso.datetime().optional(),
  })
  .refine(
    (body) => body.display_name !== undefined || body.hidden !== undefined,
    { message: 'a patch names at least one of display_name and hidden' },
  )
export type PatchFacetBody = z.infer<typeof patchFacetBody>

/**
 * `PUT /folders/:id/facets/order`, and **the list is the whole truth**, as
 * 7.16's `set_outline` is: no partial order and no merge. It carries every
 * facet of the Folder that every member can see, in the sequence they will
 * see it in. A private id in it is 422 -- a private facet's place is its
 * owner's and is written through `my-order`. Main may stand anywhere: tabs
 * are dragged freely on the row (round 2).
 */
export const putFacetOrderBody = z.object({
  order: z.array(z.uuid()).min(1).max(200),
})
export type PutFacetOrderBody = z.infer<typeof putFacetOrderBody>

/**
 * `PUT /folders/:id/facets/my-order`: the caller's own private facets and
 * nothing else. Another member's id answers 404, which is 10.2's grammar for
 * a row the caller cannot see the existence of.
 *
 * `after_facet_id: null` means "before the first facet the caller can see":
 * the front of the row (Main no longer stands first).
 */
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

/**
 * `POST /folders/:id/facets/:facetId/share`.
 *
 * The confirmation is required rather than implied, because #210 asks for
 * "a clear confirmation before exposing the content" and a body with nothing
 * in it cannot carry one. `z.literal(true)` refuses `false` as well as
 * absence, so "I changed my mind" is a 422 rather than a silent share.
 *
 * **There is no inverse**, and the same path in reverse is 409: shared to
 * private is not a conversion, it is a private copy, and that copy is out of
 * this slice.
 */
export const shareFacetBody = z.object({ confirm: z.literal(true) })
export type ShareFacetBody = z.infer<typeof shareFacetBody>
