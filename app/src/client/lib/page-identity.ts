/*
The adapter seam for a page's identity: `prototype-v2`'s
`lib/folder-presentation.ts` rewritten over sections 7.4, 7.16, 7.19 and 7.21
(RFC 0005 change control item 44's B1, lifted by RFC 0004's S25).

This is the shape S22 built the seam in, and it works here for the reason it
worked there: the prototype's components take their look from a named lib
module and touch no storage themselves, so the module is the only thing that
changes and `page-cover.tsx`, `page-head.tsx` and `folder-cover.tsx` cross
with their bodies untouched. What that file did with `window.localStorage`,
this does with the four contracts named above.

**The two exported names are the prototype's, through an import alias at each
call site.** `usePageIdentity` and `savePageIdentity` are what they are called
here, because `savePrototypeFolderIdentity` in a shipped client would name
neither a prototype nor a folder; the lifted files alias them back on import,
so the whole seam is one import statement per file and no body moves.

**The cover and description cross through separate contracts.** 7.19 stores a
place page's cover and 7.21 stores the person's wording. They still meet here
because the lifted page head expects one identity object. A place page's glyph
remains Dana's own and is never offered as a personal setting.

**The key alphabet is the one real translation.** The prototype writes
`gradient:cobalt` and `mark:ink`; 4.20's `preset` is checked against
`^[a-z0-9-]{1,40}$` and a colon does not pass it. So a colon crosses as a
hyphen going out and the first hyphen splits the tier back off coming in,
which is unambiguous because both tier names are single words and only the
swatch names carry hyphens of their own (`cobalt-deep`). The alternative,
widening a frozen section 4 CHECK for a punctuation mark, is not one.

**Three kinds of page cross this module, and since issue #118 they are dressed
alike.** A `storageName` beginning `folder:` names a folder by id and one
beginning `shelf:` names a shelf by id; anything else is 4.20's own place
string, and the endpoint is its authority. Each kind keeps its cover in its own
store — 4.3's three columns through 7.4's PATCH for a folder, 4.18's same three
through 7.16's for a shelf, 4.20's row through 7.19's PUT and DELETE for a
place — and `pageOf` below is the one place that difference is written down.
Everything a person can reach is the same on all three: the same Gallery,
Upload and Photos tabs, the same reposition, the same words when a write fails.

**This header said the opposite until 2026-09-04, and that is the point of this
paragraph rather than an embarrassment to it.** What stood here was a
measurement, made honestly and recorded with its reasoning: 7.15's upload
required `folder_id` as a uuid, a shelf and a place page are not folders,
therefore no file could exist for either to wear, therefore `coverTiersFor`
answered nothing for a shelf and the gallery alone for a place, and a tier a
surface cannot honestly draw is a tier it does not draw (DES-144). Every
sentence of that was true when written and every one is false now: issues #20
and #100 made `folder_id` optional for `kind: cover`, added
`POST /api/v1/covers/photo` for a page that is not a folder, gave 4.18 the
`cover_preset` and `cover_focal_y` columns a folder has had since migration
0006, and gave 7.16's PATCH the write that had been answering 200 and storing
nothing. The old text also cited `server/routes/files.ts:48-52` by line number,
which is the second way a comment rots here: those lines moved with the change
and now hold a `superRefine` saying the opposite. **CLAUDE.md's opening warning
is about this file by name**, and the rule it asks for is the one applied here
— a comment states intent, behaviour is what the code does, and where the two
argue the comment is rewritten in the same change rather than left to win an
argument it cannot.

**What is still absent is the link tier, and its reason is unchanged**
(issue #115). 10.8's `img-src` admits no external host, so a pasted URL draws
as the flat fallback and the honest fix is a server-side fetch with a real
SSRF surface. `folder-cover.tsx` draws a tab only where `tiers` names it, and
nothing here names that one.
*/
import type { PlaceCover } from '../../shared/covers.js'
import { DEFAULT_FOCAL_Y } from '../../shared/covers.js'
import { queryKeys } from '../api/keys.js'
import { z } from 'zod'

import { mutateApi } from '../api/http.js'
import { queryClient } from '../api/queryClient.js'
import { placeCover } from '../../shared/covers.js'
import { placeDescription } from '../../shared/place-descriptions.js'
import { writeFailureMessage } from '../api/queryClient.js'
import { showToast } from '../state/toasts.js'

import {
  useFolder,
  usePlaceCovers,
  usePlaceDescriptions,
  useShelf,
} from '../api/queries.js'
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
  /** The saved wording for a place, folder, or shelf. */
  description?: string
  /** The prototype's name for 4.18's `icon` key, a shelf's only today. */
  glyph?: string
  /** 4.18's `color`, a shelf's only today. */
  color?: string
}

const NO_IDENTITY: PageIdentity = {}

/** What a folder page passes as its `storageName`; see the module header. */
export const FOLDER_PREFIX = 'folder:'

/** What a shelf page passes as its `storageName`; see the module header. */
export const SHELF_PREFIX = 'shelf:'

/**
 * Which of the three stores a `storageName` names.
 *
 * One function rather than the two predicates this file used to ask
 * separately at seven call sites. Since #118 the difference between the three
 * kinds is no longer "what may this page wear" but only "where is it kept", so
 * a discriminated answer makes the switch in `setCoverFile` the compiler's
 * problem rather than a reader's.
 */
type PageRef =
  | { readonly kind: 'folder'; readonly id: string }
  | { readonly kind: 'shelf'; readonly id: string }
  | { readonly kind: 'place'; readonly place: string }

function pageOf(place: string): PageRef {
  if (place.startsWith(FOLDER_PREFIX)) {
    return { kind: 'folder', id: place.slice(FOLDER_PREFIX.length) }
  }
  if (place.startsWith(SHELF_PREFIX)) {
    return { kind: 'shelf', id: place.slice(SHELF_PREFIX.length) }
  }
  return { kind: 'place', place }
}

/** The `link:` form a picker key takes for a file this origin serves (7.15). */
const FILE_KEY_PREFIX = 'link:/api/v1/files/'

/** The id inside a `link:/api/v1/files/<id>` key, or null for any other key. */
function fileIdOf(key: string): string | null {
  return key.startsWith(FILE_KEY_PREFIX) ? key.slice(FILE_KEY_PREFIX.length) : null
}

/**
 * Which cover tiers this page can honestly supply, which is the seam
 * `components/folder-cover.tsx` gained at S25.
 *
 * **All three kinds of page answer the same list since issue #118**, which is
 * Imran's ruling on it — "shelves and place pages should use exactly the same
 * Gallery, Upload, and Photos treatment as folder pages" — resting on the
 * backend half of #20 and #100 that made it true rather than on a preference.
 * A folder, a shelf and a place page each have somewhere to keep a preset with
 * a crop and somewhere to keep a file, and 7.15 now makes a file that belongs
 * to no folder, so every tab this returns has a store behind it.
 *
 * **The gap this function closed when it was added was live on eight pages**,
 * and it is worth keeping in view because it is the failure a wrong answer
 * here produces. `page-cover.tsx` rendered the picker with the prop defaulting
 * to all four, so a person on Today could choose Upload, Link or a photograph;
 * the first stored the preset `upload`, whose object URL does not survive a
 * reload, and the other two produced a key `keyToPreset` cannot spell, so the
 * write was dropped without a word. Three tabs that do nothing is DES-144's
 * dead control and protocol section 4's false green. The rule that follows is
 * unchanged by #118 and is why `link` is still missing: a tier is listed here
 * only where every one of `usePageIdentity`, `savePageIdentity`,
 * `coverUploader` and `coverPhotoPicker` below can serve it for this page.
 */
export function coverTiersFor(_place: string): readonly CoverTier[] {
  return ['gallery', 'upload', 'photos']
}

/*
**Why `photos` comes through this origin and `link` is nothing at all,
measured 2026-08-30 rather than assumed.** Kept from the round that built the
tier, because it is the reason the tier is shaped this way and the reason the
fourth one is still absent.

The owner asked for "free stock images" and B8 exempted the tier on 10.6, "a
third-party network dependency the service worker cannot precache". That is
true and it is the smaller half. **The larger half is 10.8's response headers,
and it refuses both halves of the tier outright**: `app/src/server/index.ts`
sent `img-src 'self' data:` and `connect-src 'self' https://*.sentry.io`, so
the picker's search request to `api.openverse.org` never left the page and a
result's thumbnail never painted. Two things follow that are worth the record.

**No provider key is missing.** B8 was written against Unsplash; the picker
lifted at S25 searches **Openverse**, which needs no key and no account, and
`components/folder-cover.tsx`'s own header already says so. Nothing here is
waiting on a credential.

**And no client-side workaround exists**, which is the finding that decides
it. The obvious one, download the chosen photograph and put it through 7.15 so
the stored cover is Dana's own file, dies twice: `connect-src 'self'` refuses
the download, and a photograph's bytes sit on whichever host the original
publisher uses, which sends no CORS header to a browser that asked. So the
tier is not a front-end job pending a flag. It needs the **server** to do the
fetching, which is a section 7 addition and therefore the owner's: a search
proxy, and a route that turns a chosen URL into a `files` row. With those,
`img-src 'self'` is satisfied by construction and 10.6's objection goes with
it, because the cover a person ends up wearing is a file this origin serves
rather than a third party's URL.

That server half exists: `routes/cover-photos.ts` proxies the search, streams
the thumbnails from this origin, and turns a chosen photograph into a `cover`
file. `coverPhotoPicker` below is the client's half, and since #118 it has two
arms because 7.15 has two — the folder route and the folder-less one.
*/

/**
 * Whether this page has somewhere to keep a cover's vertical crop.
 *
 * All three do, and have since issue #20 gave 4.18 the `cover_focal_y` a
 * folder has carried since migration 0006 and a place page has carried since
 * 4.20. The function stays rather than being inlined as `true`, because what
 * it answers is a property of the store and the day a fourth kind of page
 * arrives is the day it has to be asked again. Where a page could not keep a
 * crop the Reposition control was drawn absent rather than moving a picture
 * that snaps back on the next read; nothing is in that state now.
 */
export function coverStoresPosition(_place: string): boolean {
  return true
}

/** `POST /files` and `POST /covers/photo` both answer 7.15's stored row. */
const storedCoverSchema = z.object({ id: z.uuid() })

/**
 * One cover failure, reported the way every other write in this client
 * reports one.
 *
 * **The three page kinds share this deliberately**, which is the whole of "the
 * same loading and error behaviour" in Imran's ruling on #118: a shelf over
 * 10.3's gigabyte and a folder over it are the same event to a person, so they
 * say the same thing. `writeFailureMessage` is this client's one rule for what
 * a failed write says — 9.1's offline sentence where the request never left,
 * the server's own words for a 409 and a 403, and section 9's generic sentence
 * for everything else, which is where a 413 `quota_exceeded` and a 422 both
 * land. That is the folder page's existing behaviour reused rather than a
 * second treatment invented for the two new pages. **The server writes a
 * better sentence for the quota than this shows** — 7.15 answers 413 with
 * section 9's "You've used your 1 GB of storage." — and surfacing it is a
 * change to `writeFailureMessage`, which is every write in the client rather
 * than covers, so it is not made here.
 */
function reportCoverFailure(error: unknown): void {
  showToast(writeFailureMessage(error))
}

/** The filterless invalidation `savePageIdentity` explains; see its note. */
function settleWrites(): void {
  void queryClient()?.invalidateQueries()
}

/**
 * Point a page at a stored file, whatever kind of page it is.
 *
 * **What ends up on the page is the id the server hands back and never the one
 * that was sent**, and on this endpoint those are two different things: 7.19's
 * rule 1, amended 2026-09-04 for issues #116 and #128, copies a picture that
 * is not already a `cover` in the page's own scope, so a folder's photograph
 * set as a shelf's cover is stored as a fresh folder-less file of the setter's
 * own and the shelf names the copy. Nothing here holds the sent id in client
 * state: the band is drawn from `usePageIdentity`, which reads the query
 * cache, and the invalidation the callers do is what puts the server's answer
 * on the screen. A client that optimistically wrote back what it sent would
 * draw the original for as long as that cache lived and then silently swap it.
 *
 * The crop goes to 4.20's default with the picture, exactly as
 * `savePageIdentity` does for every other cover: without it a page whose last
 * cover had been dragged to its foot showed the new one already repositioned,
 * which reads as an upload that cropped itself.
 */
function setCoverFile(page: PageRef, fileId: string): Promise<unknown> {
  if (page.kind === 'place') {
    return mutateApi(placeCover, {
      method: 'PUT',
      path: `/place-covers/${page.place}`,
      body: { file_id: fileId, focal_y: DEFAULT_FOCAL_Y },
    })
  }
  return mutateApi(null, {
    method: 'PATCH',
    path: page.kind === 'folder' ? `/folders/${page.id}` : `/shelves/${page.id}`,
    body: { cover_file_id: fileId, cover_focal_y: DEFAULT_FOCAL_Y },
  })
}

/**
 * The upload tier's half of the bargain, for all three kinds of page since
 * issue #118.
 *
 * **A folder scopes its upload and the other two do not, and that is the whole
 * difference.** 7.15 takes `folder_id` for a folder page, so the bytes become
 * a file of that folder and every member sees the one cover they are all
 * wearing; a shelf and a place page send no `folder_id` at all, and 7.15
 * stores a folder-less `cover` readable by its owner alone, which is what
 * makes a shelf's cover private by 4.18 and a place page's per-viewer by 4.20.
 * Passing the empty string rather than null would be refused 422, and
 * `uploadFile` says so at the line that decides it.
 */
export function coverUploader(place: string): ((file: File) => void) | undefined {
  const page = pageOf(place)
  const folderId = page.kind === 'folder' ? page.id : null
  return (file: File) => {
    void uploadFile('cover', folderId, file)
      .then((stored) => setCoverFile(page, stored.id))
      .then(settleWrites)
      .catch(reportCoverFailure)
  }
}

/**
 * The photo tier's other half of `coverUploader`'s bargain: the server fetches
 * and stores the photograph, and the write that follows is byte-for-byte the
 * upload's, crop reset included.
 *
 * **Two routes, for the same reason the upload has two spellings.** A folder
 * page posts to `POST /folders/:id/cover/photo`, which stores the photograph
 * inside that folder; a shelf and a place page post to `POST /covers/photo`,
 * added by issue #20 for a page that has no folder to name, which stores it
 * folder-less and owned by the caller. It is a route rather than an optional
 * parameter because the URL is where the folder is named and there is no
 * folder to name — `routes/cover-photos.ts` states the same reasoning from the
 * other side.
 */
export function coverPhotoPicker(place: string): ((photoId: string) => void) | undefined {
  const page = pageOf(place)
  const path =
    page.kind === 'folder' ? `/folders/${page.id}/cover/photo` : '/covers/photo'
  return (photoId: string) => {
    void mutateApi(storedCoverSchema, {
      method: 'POST',
      path,
      body: { photo_id: photoId },
    })
      .then((stored) => setCoverFile(page, stored.id))
      .then(settleWrites)
      .catch(reportCoverFailure)
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
 * `preset` first because 4.20's CHECK admits at most one of the two; a
 * `file_id` resolves to the authenticated serving path of 7.15, which the band
 * draws as a background image and the browser sends the session cookie for,
 * this being one origin (11.1).
 */
export function coverKeyOf(cover: PlaceCover): string | undefined {
  if (cover.preset !== null) return presetToKey(cover.preset)
  if (cover.file_id !== null) return `${FILE_KEY_PREFIX}${cover.file_id}`
  return undefined
}

/**
 * The identity a row carrying 4.3's or 4.18's cover columns reads as.
 *
 * One function for a folder and a shelf because since issue #20 the two rows
 * hold the same three cover columns, written by two PATCHes taking the same
 * body. A preset first and a file second, exactly as `coverKeyOf` reads a
 * place's row: the one-source CHECK means at most one is set.
 */
function identityOfRow(row: {
  cover_file_id: string | null
  cover_preset: string | null
  cover_focal_y: number
  description: string | null
}): PageIdentity {
  const cover =
    row.cover_preset !== null
      ? presetToKey(row.cover_preset)
      : row.cover_file_id !== null
        ? `${FILE_KEY_PREFIX}${row.cover_file_id}`
        : undefined
  return {
    ...(cover === undefined ? {} : { cover, coverPos: row.cover_focal_y }),
    ...(row.description === null ? {} : { description: row.description }),
  }
}

/**
 * One page's identity, live.
 *
 * A place page's whole set is one query, 7.19 answering the caller's own
 * covers in one response, so eight pages mounting this share one request and a
 * cover chosen on Today is on Today the moment the write settles.
 */
export function usePageIdentity(place: string): PageIdentity {
  const page = pageOf(place)
  const covers = usePlaceCovers()
  const descriptions = usePlaceDescriptions(page.kind === 'place')
  /*
  Both row hooks run on every page because hooks must, and each is off where it
  has nothing to read: `useFolder` and `useShelf` are disabled for a page of
  another kind, and `usePlaceCovers` is one unconditional request the whole
  client shares anyway (7.19 answers the caller's own covers whole).
  */
  const folder = useFolder(page.kind === 'folder' ? page.id : '', page.kind === 'folder')
  const shelf = useShelf(page.kind === 'shelf' ? page.id : '', page.kind === 'shelf')
  if (page.kind === 'shelf') {
    const detail = shelf.data
    if (detail === undefined) return NO_IDENTITY
    return {
      ...identityOfRow(detail),
      ...(detail.icon === null ? {} : { glyph: detail.icon }),
      ...(detail.color === null ? {} : { color: detail.color }),
    }
  }
  if (page.kind === 'folder') {
    const detail = folder.data
    if (detail === undefined) return NO_IDENTITY
    return identityOfRow(detail)
  }
  const foundCover = covers.data?.covers.find((cover) => cover.place === place)
  const cover = foundCover === undefined ? undefined : coverKeyOf(foundCover)
  const description = descriptions.data?.descriptions.find(
    (entry) => entry.place === place,
  )?.description
  return {
    ...(cover === undefined || foundCover === undefined
      ? {}
      : { cover, coverPos: foundCover.focal_y }),
    ...(description == null ? {} : { description }),
  }
}

/** The cached set, for the plain-function write below. */
function storedCover(place: string): PlaceCover | undefined {
  const cached = queryClient()?.getQueryData<{ covers: PlaceCover[] }>(
    queryKeys.placeCovers(),
  )
  return cached?.covers.find((cover) => cover.place === place)
}

/**
 * A picker key as the cover columns 4.3 and 4.18 share, or null where the key
 * names a tier neither has a column for.
 *
 * Removal clears both sources, because 4.3 and 4.18 admit a row wearing
 * neither; a `link:` key names the file column and a gallery key the preset
 * column, the server clearing the other (RFC 0005 change control item 58). A
 * fresh cover starts at 4.20's default crop, as a place's does.
 */
function coverColumnsFor(cover: string | undefined): Record<string, unknown> | null {
  if (cover === undefined) return { cover_file_id: null, cover_preset: null }
  const fileId = fileIdOf(cover)
  if (fileId !== null) {
    return { cover_file_id: fileId, cover_focal_y: DEFAULT_FOCAL_Y }
  }
  const preset = keyToPreset(cover)
  if (preset === null) return null
  return { cover_preset: preset, cover_focal_y: DEFAULT_FOCAL_Y }
}

/**
 * The write half, with the prototype's own patch shape: `{ cover }` chooses or
 * removes one, `{ coverPos }` moves the crop.
 *
 * A place patch clearing the cover is 7.19's DELETE, because 4.20 admits no
 * row with neither a file nor a preset: removal is the row's deletion and
 * there is no half-set cover to leave behind. A folder's and a shelf's is the
 * PATCH with both columns null, their rows outliving the cover. A place patch
 * carrying only a position re-sends the cover it is moving, the endpoint being
 * an idempotent PUT of the whole entry rather than a partial update.
 *
 * It invalidates by hand because it is not a `useMutation`, so the mutation
 * cache's own `onSuccess` of 8.3 never sees it; the filterless
 * `invalidateQueries()` is deliberately the same call that cache makes, so
 * this write refetches exactly what every other write refetches. That refetch
 * is also what makes the screen show the id the **server** chose rather than
 * the one this function sent, which 7.19's rule 1 can make two different
 * things; `setCoverFile` above states it where it matters most.
 */
export function savePageIdentity(
  place: string,
  patch: Partial<PageIdentity>,
): void {
  const page = pageOf(place)

  /*
  The folder and shelf halves, which are one half since issue #20. 4.3 and 4.18
  each carry the cover as a file id or a preset with a crop, and the
  description as text, all written by a PATCH taking the same body, so what
  crosses is those and nothing else; a shelf's mark and colour are two more
  columns of its own (4.18) and a folder writes those through its own picker.
  The paragraph that stood here recorded a shelf branch that sent
  `cover_file_id` alone, ignored every gradient key and never sent a crop —
  #118's "what is left on your side", closed by the shared body below.
  */
  if (page.kind !== 'place') {
    const body: Record<string, unknown> = {}
    if ('cover' in patch) {
      const columns = coverColumnsFor(patch.cover)
      /* A key neither column can spell is dropped rather than sent to be
         refused; nothing produces one today, `link` being unlisted. */
      if (columns === null) return
      Object.assign(body, columns)
    }
    if (patch.coverPos !== undefined) body['cover_focal_y'] = Math.round(patch.coverPos)
    if ('description' in patch) body['description'] = patch.description ?? null
    if (page.kind === 'shelf') {
      if ('glyph' in patch) body['icon'] = patch.glyph ?? null
      if ('color' in patch) body['color'] = patch.color ?? null
    }
    if (Object.keys(body).length === 0) return
    void mutateApi(null, {
      method: 'PATCH',
      path: page.kind === 'folder' ? `/folders/${page.id}` : `/shelves/${page.id}`,
      body,
    })
      .then(settleWrites)
      .catch(reportCoverFailure)
    return
  }

  if ('description' in patch) {
    void mutateApi(placeDescription, {
      method: 'PUT',
      path: `/place-descriptions/${place}`,
      body: { description: patch.description ?? null },
    })
      .then(settleWrites)
      .catch(reportCoverFailure)
  }

  /* A description-only edit has finished above. Cover work continues only
     when the same patch actually names a cover or its position. */
  if (!('cover' in patch) && patch.coverPos === undefined) return

  if ('cover' in patch && patch.cover === undefined) {
    void mutateApi(null, { method: 'DELETE', path: `/place-covers/${place}` })
      .then(settleWrites)
      .catch(reportCoverFailure)
    return
  }

  const current = storedCover(place)
  const key = patch.cover ?? (current === undefined ? undefined : coverKeyOf(current))
  if (key === undefined) return
  /*
  7.19 takes exactly one of `file_id` and `preset` and refuses a body naming
  both or neither, so the key decides which. **The `file_id` arm is issue
  #118's fix and the line it replaced was one `return`**: every non-preset key
  was dropped here, which is what stopped a place page holding a picture in the
  shipping client, and it is also what dropped a *reposition* of one — a drag
  on a file-backed cover re-sends the cover it is moving, and the re-send was
  being spelled as a preset it could never be. A key that is neither, which
  today means only a `link:` to some other origin, is still dropped rather than
  sent to be refused.
  */
  const fileId = fileIdOf(key)
  const preset = fileId === null ? keyToPreset(key) : null
  if (fileId === null && preset === null) return

  void mutateApi(placeCover, {
    method: 'PUT',
    path: `/place-covers/${place}`,
    body: {
      ...(fileId === null ? { preset } : { file_id: fileId }),
      focal_y:
        patch.coverPos ?? ('cover' in patch ? DEFAULT_FOCAL_Y : current?.focal_y),
    },
  })
    .then(settleWrites)
    .catch(reportCoverFailure)
}
