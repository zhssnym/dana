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

import { usePlaceCovers } from '../api/queries.js'

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
  /** Always undefined here; see the module header. */
  description?: string
}

const NO_IDENTITY: PageIdentity = {}

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
