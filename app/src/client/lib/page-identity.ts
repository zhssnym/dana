/*
The adapter seam for a place page's cover: `prototype-v2`'s
`lib/folder-presentation.ts` rewritten over 7.19 (RFC 0005 change control
item 44's B1, lifted by RFC 0004's S25).

This is the shape S22 built the seam in, and it works here for the reason it
worked there: the prototype's components take their look from a named lib
module and touch no storage themselves, so the module is the only thing that
changes and `page-cover.tsx`, `page-head.tsx` and `folder-cover.tsx` cross
with their bodies untouched. What that file did with `window.localStorage`,
this does with `GET/PUT/DELETE /place-covers`.

**The two exported names are the prototype's, through an import alias at each
call site.** `usePageIdentity` and `savePageIdentity` are what they are called
here, because `savePrototypeFolderIdentity` in a shipped client would name
neither a prototype nor a folder; the lifted files alias them back on import,
so the whole seam is one import statement per file and no body moves.

**Only the cover crosses, and the description deliberately does not.** The
prototype's identity record carries a glyph, a colour, a cover, its crop and
a description; 4.20 stores a cover, its crop and nothing else. A place page's
glyph is Dana's own and was never a person's to pick, which `page-head.tsx`
states itself. The description is the live half of RFC 0005 change control
item 9 and is escalated at this row's close rather than improvised, so
`description` is always undefined here and the head draws the page's DES-152
question as its prose line. A field wired to nothing is worse than a
sentence.

**The key alphabet is the one real translation.** The prototype writes
`gradient:cobalt` and `mark:ink`; 4.20's `preset` is checked against
`^[a-z0-9-]{1,40}$` and a colon does not pass it. So a colon crosses as a
hyphen going out and the first hyphen splits the tier back off coming in,
which is unambiguous because both tier names are single words and only the
swatch names carry hyphens of their own (`cobalt-deep`). The alternative,
widening a frozen section 4 CHECK for a punctuation mark, is not one.

**A folder is the other half of this module, added at S26, and the two
halves are exactly complementary.** A place page's cover is 4.20's, a preset
or a file with a crop, per viewer; a folder's is 4.3's `cover_file_id` and
nothing else, one look for every member. So a place can wear a gradient and
can never wear a picture (section 13 item 52), and a folder can wear a picture
and can never wear a gradient or a crop (**section 13 item 53**). Neither page
in Dana can offer all four of item 44's B8 tiers, which is a fact about two
frozen tables rather than about either picker, and `coverTiersFor` is where
the two answers are written down. A `storageName` beginning `folder:` names a
folder by id; anything else is 4.20's own place string, and the endpoint is
its authority.

**A shelf is the third half, added at S27 for the lifted `shelf-page.tsx`,
and it is the folder half with two more columns.** 4.18 gives a shelf the same
`cover_file_id`, `description`, `icon` and `color` a folder has, written by
7.16's PATCH, so a `storageName` beginning `shelf:` reads `useShelf` and
writes `PATCH /shelves/:id`. The prototype's screen asks its identity for a
glyph and a colour as well as a cover and a description, which is why
`PageIdentity` carries `glyph` and `color` now; a folder page takes those from
its own read and a place page has none. **No cover tier is reachable on a
shelf**, for item 52's reason one object over: 7.15's upload needs a
`folder_id`, and a shelf is not a folder, so `coverTiersFor` answers nothing
and the screen draws no Add cover control (section 13 item 57).

**A stored file renders as a link, which is the tier nothing can reach yet.**
4.20 admits a `file_id` and 7.19 takes one, and `POST /api/v1/files` requires
`folder_id` as a uuid (`server/routes/files.ts:48-52`), so no file exists
today that is not some folder's and a place page is not a folder. The read
path is here anyway, because it costs four lines and it is what B8 lands on;
the write path is not, and `folder-cover.tsx`'s own header records which
tiers that leaves this row.
*/
import type { PlaceCover } from '../../shared/covers.js'
import { DEFAULT_FOCAL_Y } from '../../shared/covers.js'
import { queryKeys } from '../api/keys.js'
import { mutateApi } from '../api/http.js'
import { queryClient } from '../api/queryClient.js'
import { placeCover } from '../../shared/covers.js'
import { writeFailureMessage } from '../api/queryClient.js'
import { showToast } from '../state/toasts.js'

import { usePlaceCovers, useFolder, useShelf } from '../api/queries.js'
import { uploadFile } from '../api/http.js'
import type { CoverTier } from '../components/folder-cover.js'

/*
The place a cover belongs to is taken as a plain string rather than 4.20's
union, deliberately: the lifted files call it `storageName` and type it
`string`, and narrowing it here would be a signature the lifted bodies would
have to be edited to satisfy. The endpoint is 4.20's own authority anyway,
answering 404 for anything outside the set, so a wrong string is refused at
the one place that can refuse it rather than at a type the seam invented.
*/

/** The prototype's `PrototypeFolderIdentity`, narrowed to what 4.20 holds. */
export interface PageIdentity {
  /** A picker key: `gradient:*`, `mark:*`, or `link:` for a stored file. */
  cover?: string
  /** 4.20's `focal_y`, the vertical crop of a photographic cover, 0 to 100. */
  coverPos?: number
  /** Undefined for a place (see the module header); 4.3's or 4.18's text
   *  for a folder or a shelf. */
  description?: string
  /** The prototype's name for 4.18's `icon` key, a shelf's only today. */
  glyph?: string
  /** 4.18's `color`, a shelf's only today. */
  color?: string
}

const NO_IDENTITY: PageIdentity = {}

/** The `folder:<id>` form, or null where this name is 4.20's own place. */
function folderOf(place: string): string | null {
  return place.startsWith(FOLDER_PREFIX) ? place.slice(FOLDER_PREFIX.length) : null
}

/** What a folder page passes as its `storageName`; see the module header. */
export const FOLDER_PREFIX = 'folder:'

/** What a shelf page passes as its `storageName`; see the module header. */
export const SHELF_PREFIX = 'shelf:'

/** The `shelf:<id>` form, or null. */
function shelfOf(place: string): string | null {
  return place.startsWith(SHELF_PREFIX) ? place.slice(SHELF_PREFIX.length) : null
}

/**
 * Which cover tiers this page can honestly supply, which is the seam
 * `components/folder-cover.tsx` gained at S25 and which nothing passed until
 * now.
 *
 * **The gap this closes was live on eight pages.** `page-cover.tsx` rendered
 * the picker with the prop defaulting to all four, so a person on Today could
 * choose Upload, Link or a photograph; the first stores the preset `upload`,
 * whose object URL does not survive a reload, and the other two produce a key
 * `keyToPreset` cannot spell, so the write is dropped without a word. Three
 * tabs that do nothing is DES-144's dead control and protocol section 4's
 * false green, and it is the shape RFC 0005 change control item 48(b) named:
 * a capability lifted ahead of its consumer fails in neither half loudly.
 */
export function coverTiersFor(place: string): readonly CoverTier[] {
  /* A folder holds a file and no preset (4.3), a place holds a preset and can
     hold no file it has any way of making (item 52), and a shelf holds a file
     it has no way of making either (section 13 item 57). */
  if (shelfOf(place) !== null) return []
  return folderOf(place) === null ? ['gallery'] : ['upload']
}

/**
 * Whether this page has somewhere to keep a cover's vertical crop.
 *
 * 4.20 carries `focal_y` and 7.19 writes it; `folders` carries a cover and no
 * crop at all, which is ledger L-068 read against the schema. So the
 * Reposition control is drawn where the drag can be kept and is absent where
 * it cannot, rather than moving a picture that snaps back on the next read.
 */
export function coverStoresPosition(place: string): boolean {
  return folderOf(place) === null && shelfOf(place) === null
}

/**
 * The upload a folder's cover can take and a place page's cannot, which is
 * item 44's B8 as far as the two tables reach.
 *
 * 7.15 scopes a file to a folder, which is exactly what a folder page has, so
 * the bytes go up as a `cover` and 4.3's column takes the id. The invalidation
 * is `savePageIdentity`'s own, for its reason.
 */
export function coverUploader(place: string): ((file: File) => void) | undefined {
  const folderId = folderOf(place)
  if (folderId === null) return undefined
  return (file: File) => {
    const client = queryClient()
    void uploadFile('cover', folderId, file)
      .then((stored) =>
        mutateApi(null, {
          method: 'PATCH',
          path: `/folders/${folderId}`,
          body: { cover_file_id: stored.id },
        }),
      )
      .then(() => void client?.invalidateQueries())
      .catch((error: unknown) => showToast(writeFailureMessage(error)))
  }
}

/** `gradient-cobalt-deep` back to `gradient:cobalt-deep`. */
export function presetToKey(preset: string): string {
  const cut = preset.indexOf('-')
  return cut === -1 ? preset : `${preset.slice(0, cut)}:${preset.slice(cut + 1)}`
}

/** `gradient:cobalt-deep` to `gradient-cobalt-deep`, or null where the key
 *  names a tier 4.20 has no column for. */
export function keyToPreset(key: string): string | null {
  const preset = key.replace(':', '-')
  return /^[a-z0-9-]{1,40}$/.test(preset) ? preset : null
}

/**
 * A picker key from a stored row.
 *
 * `preset` first because it is the only one a place page can write today; a
 * `file_id` resolves to the authenticated serving path of 7.15, which the
 * band draws as a background image and the browser sends the session cookie
 * for, this being one origin (11.1).
 */
export function coverKeyOf(cover: PlaceCover): string | undefined {
  if (cover.preset !== null) return presetToKey(cover.preset)
  if (cover.file_id !== null) return `link:/api/v1/files/${cover.file_id}`
  return undefined
}

/**
 * One place's cover, live.
 *
 * The whole set is one query, 7.19 answering the caller's own covers in one
 * response, so eight pages mounting this share one request and a cover chosen
 * on Today is on Today the moment the write settles.
 */
export function usePageIdentity(place: string): PageIdentity {
  const covers = usePlaceCovers()
  /*
  The folder half. Both hooks run on every page because hooks must, and each
  is off where it has nothing to read: `useFolder` is disabled for a place
  name, and `usePlaceCovers` is one unconditional request the whole client
  shares anyway (7.19 answers the caller's own covers whole).
  */
  const folderId = folderOf(place)
  const folder = useFolder(folderId ?? '', folderId !== null)
  const shelfId = shelfOf(place)
  const shelf = useShelf(shelfId ?? '', shelfId !== null)
  if (shelfId !== null) {
    const detail = shelf.data
    if (detail === undefined) return NO_IDENTITY
    return {
      ...(detail.cover_file_id === null
        ? {}
        : { cover: `link:/api/v1/files/${detail.cover_file_id}` }),
      ...(detail.description === null ? {} : { description: detail.description }),
      ...(detail.icon === null ? {} : { glyph: detail.icon }),
      ...(detail.color === null ? {} : { color: detail.color }),
    }
  }
  if (folderId !== null) {
    const detail = folder.data
    if (detail === undefined) return NO_IDENTITY
    return {
      ...(detail.cover_file_id === null
        ? {}
        : { cover: `link:/api/v1/files/${detail.cover_file_id}` }),
      ...(detail.description === null ? {} : { description: detail.description }),
    }
  }
  const found = covers.data?.covers.find((cover) => cover.place === place)
  if (found === undefined) return NO_IDENTITY
  const key = coverKeyOf(found)
  if (key === undefined) return NO_IDENTITY
  return { cover: key, coverPos: found.focal_y }
}

/** The cached set, for the plain-function write below. */
function storedCover(place: string): PlaceCover | undefined {
  const cached = queryClient()?.getQueryData<{ covers: PlaceCover[] }>(
    queryKeys.placeCovers(),
  )
  return cached?.covers.find((cover) => cover.place === place)
}

/**
 * The write half, with the prototype's own patch shape: `{ cover }` chooses
 * or removes one, `{ coverPos }` moves the crop.
 *
 * A patch clearing the cover is 7.19's DELETE, because 4.20 admits no row
 * with neither a file nor a preset: removal is the row's deletion and there
 * is no half-set cover to leave behind. A patch carrying only a position
 * re-sends the cover it is moving, the endpoint being an idempotent PUT of
 * the whole entry rather than a partial update.
 *
 * It invalidates by hand because it is not a `useMutation`, so the mutation
 * cache's own `onSuccess` of 8.3 never sees it; the filterless
 * `invalidateQueries()` is deliberately the same call that cache makes, so
 * this write refetches exactly what every other write refetches.
 */
export function savePageIdentity(
  place: string,
  patch: Partial<PageIdentity>,
): void {
  const client = queryClient()
  const settle = (): void => void client?.invalidateQueries()

  /*
  The folder half. 4.3 carries the cover as a file id and the description as
  text, both shared by every member and both written by 7.4's PATCH, so what
  crosses is those two and nothing else.

  **`coverPos` is deliberately dropped rather than stored somewhere.** There is
  no crop column on `folders` (ledger L-068), and `coverStoresPosition` above
  keeps the control that would produce one off the page, so a patch carrying
  one can only come from a caller that has not read either. Section 13 item 53
  is the amendment.

  **A key that is not a stored file is dropped for the same kind of reason**:
  a folder has no preset column, so a gradient has nowhere to go, and
  `coverTiersFor` keeps that tier off a folder's picker.
  */
  /* The shelf half: 4.18's four identity columns through 7.16's PATCH. */
  const shelfId = shelfOf(place)
  if (shelfId !== null) {
    const body: Record<string, unknown> = {}
    if ('cover' in patch) {
      if (patch.cover === undefined) body['cover_file_id'] = null
      else if (patch.cover.startsWith('link:/api/v1/files/')) {
        body['cover_file_id'] = patch.cover.slice('link:/api/v1/files/'.length)
      }
    }
    if ('description' in patch) body['description'] = patch.description ?? null
    if ('glyph' in patch) body['icon'] = patch.glyph ?? null
    if ('color' in patch) body['color'] = patch.color ?? null
    if (Object.keys(body).length === 0) return
    void mutateApi(null, { method: 'PATCH', path: `/shelves/${shelfId}`, body })
      .then(settle)
      .catch((error: unknown) => showToast(writeFailureMessage(error)))
    return
  }

  const folderId = folderOf(place)
  if (folderId !== null) {
    const body: Record<string, unknown> = {}
    if ('cover' in patch) {
      if (patch.cover === undefined) body['cover_file_id'] = null
      else if (!patch.cover.startsWith('link:/api/v1/files/')) return
      else body['cover_file_id'] = patch.cover.slice('link:/api/v1/files/'.length)
    }
    if ('description' in patch) body['description'] = patch.description ?? null
    if (Object.keys(body).length === 0) return
    void mutateApi(null, { method: 'PATCH', path: `/folders/${folderId}`, body })
      .then(settle)
      .catch((error: unknown) => showToast(writeFailureMessage(error)))
    return
  }

  if ('cover' in patch && patch.cover === undefined) {
    void mutateApi(null, { method: 'DELETE', path: `/place-covers/${place}` })
      .then(settle)
      .catch((error: unknown) => showToast(writeFailureMessage(error)))
    return
  }

  const current = storedCover(place)
  const key = patch.cover ?? (current === undefined ? undefined : coverKeyOf(current))
  if (key === undefined) return
  const preset = keyToPreset(key)
  /* A `link:` key is a stored file's serving path and never a preset, so a
     write that cannot be spelled as one is dropped rather than sent to be
     refused. Nothing produces one today; see the module header. */
  if (preset === null) return

  void mutateApi(placeCover, {
    method: 'PUT',
    path: `/place-covers/${place}`,
    body: {
      preset,
      focal_y:
        patch.coverPos ?? ('cover' in patch ? DEFAULT_FOCAL_Y : current?.focal_y),
    },
  })
    .then(settle)
    .catch((error: unknown) => showToast(writeFailureMessage(error)))
}
