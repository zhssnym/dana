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
or a file with a crop, per viewer; a folder's is 4.3's `cover_file_id`, or
since RFC 0005 change control item 58 its `cover_preset` with a
`cover_focal_y`, one look for every member. So a place can wear a gradient and
can never wear a picture (section 13 item 52), and a folder can wear either,
which is section 13 item 53's first answer taken. No page offers B8's link or
photo tiers, because neither is a file or a preset, and `coverTiersFor` is
where each page's answer is written down. A `storageName` beginning `folder:` names a
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
  /* A folder holds a file and, since RFC 0005 change control item 58 took
     section 13 item 53's first answer, a preset and a crop as well (4.3), so
     it offers the gallery a place page offers plus the upload a place page
     cannot make (item 52); a shelf holds a file it has no way of making
     (section 13 item 57). */
  if (shelfOf(place) !== null) return []
  return folderOf(place) === null ? ['gallery'] : ['gallery', 'upload']
}

/*
**Why `photos` and `link` are still absent, measured 2026-08-30 rather than
assumed, because what is written down about them is incomplete.**

The owner asked for "free stock images" and B8 exempted the tier on 10.6, "a
third-party network dependency the service worker cannot precache". That is
true and it is the smaller half. **The larger half is 10.8's response headers,
and it refuses both halves of the tier outright**:
`app/src/server/index.ts` sends `img-src 'self' data:` and
`connect-src 'self' https://*.sentry.io`, so the picker's search request to
`api.openverse.org` never leaves the page and a result's thumbnail never
paints. Two things follow that are worth having on the record.

**No provider key is missing.** B8 was written against Unsplash; the picker
lifted at S25 searches **Openverse**, which needs no key and no account, and
`components/folder-cover.tsx`'s own header already says so. Nothing here is
waiting on a credential.

**And no client-side workaround exists**, which is the finding that decides
it. The obvious one, download the chosen photograph and put it through 7.15
so the stored cover is Dana's own file, dies twice: `connect-src 'self'`
refuses the download, and a photograph's bytes sit on whichever host the
original publisher uses, which sends no CORS header to a browser that asked.
So the tier is not a front-end job pending a flag. It needs the **server** to
do the fetching, which is a section 7 addition and therefore the owner's:
a search proxy, and a route that turns a chosen URL into a `files` row. With
those, `img-src 'self'` is satisfied by construction and 10.6's objection
goes away with it, because the cover a person ends up wearing is a file this
origin serves rather than a third party's URL.

Everything on this side of that line is already built and needs no further
work: the Photos tab, its search field, its result grid, its attribution line
and its offline copy are in `components/folder-cover.tsx` today, and the one
switch that draws them is the array above.
*/

/**
 * Whether this page has somewhere to keep a cover's vertical crop.
 *
 * 4.20 carries `focal_y` and 7.19 writes it, and since item 58 `folders`
 * carries `cover_focal_y` through 7.4's PATCH (ledger L-068 closes with it).
 * A shelf still has nowhere to keep one, so the Reposition control is drawn
 * where the drag can be kept and is absent where it cannot, rather than
 * moving a picture that snaps back on the next read.
 */
export function coverStoresPosition(place: string): boolean {
  return shelfOf(place) === null
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
          /* The crop goes back to the middle with the picture, exactly as
             `savePageIdentity` does for every other cover: without it a
             folder whose last cover had been dragged to its foot showed the
             new one already repositioned, which reads as an upload that
             cropped itself. */
          body: { cover_file_id: stored.id, cover_focal_y: DEFAULT_FOCAL_Y },
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
    /* A preset first, a file second, exactly as `coverKeyOf` reads a place's
       row: 4.3's one-source CHECK means at most one is set. */
    const cover =
      detail.cover_preset !== null
        ? presetToKey(detail.cover_preset)
        : detail.cover_file_id !== null
          ? `link:/api/v1/files/${detail.cover_file_id}`
          : undefined
    return {
      ...(cover === undefined ? {} : { cover, coverPos: detail.cover_focal_y }),
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
  The folder half. 4.3 carries the cover as a file id or a preset with a crop
  (since RFC 0005 change control item 58 took section 13 item 53's first
  answer) and the description as text, all shared by every member and all
  written by 7.4's PATCH, so what crosses is those and nothing else. The two
  paragraphs that stood here recorded `coverPos` and a gallery key being
  dropped for want of a column; the columns exist now, ledger L-068 closes,
  and the folder page writes exactly what a place page writes.
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
      /* Removal clears both sources; a file names 4.3's file column and a
         gallery key its preset column, the server clearing the other (item
         58). A fresh cover starts at 4.20's default crop, as a place's does. */
      if (patch.cover === undefined) {
        body['cover_file_id'] = null
        body['cover_preset'] = null
      } else if (patch.cover.startsWith('link:/api/v1/files/')) {
        body['cover_file_id'] = patch.cover.slice('link:/api/v1/files/'.length)
        body['cover_focal_y'] = DEFAULT_FOCAL_Y
      } else {
        const preset = keyToPreset(patch.cover)
        if (preset === null) return
        body['cover_preset'] = preset
        body['cover_focal_y'] = DEFAULT_FOCAL_Y
      }
    }
    if (patch.coverPos !== undefined) body['cover_focal_y'] = Math.round(patch.coverPos)
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
