// A page's cover and description. A `storageName` of `folder:<id>` or `shelf:<id>` names
// that row; anything else is a place page (`pageOf`). Preset keys cross with the colon as a
// hyphen, because the server's preset alphabet has no colon.
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

// The place is a plain string; the endpoint answers 404 for anything outside the set.

/** The page identity, narrowed to what the server holds. */
export interface PageIdentity {
  /** A picker key such as `colour:blue`, or `link:` for a stored file. */
  cover?: string
  /** The vertical crop of a photographic cover, 0 to 100. */
  coverPos?: number
  /** The saved wording for a place, folder, or shelf. */
  description?: string
  /** The icon key; shelves only today. */
  glyph?: string
  /** Shelves only today. */
  color?: string
}

const NO_IDENTITY: PageIdentity = {}

/** What a folder page passes as its `storageName`. */
export const FOLDER_PREFIX = 'folder:'

/** What a shelf page passes as its `storageName`. */
export const SHELF_PREFIX = 'shelf:'

/** Which of the three stores a `storageName` names. */
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

/** The `link:` form a picker key takes for a file this origin serves. */
const FILE_KEY_PREFIX = 'link:/api/v1/files/'

/** The id inside a `link:/api/v1/files/<id>` key, or null for any other key. */
function fileIdOf(key: string): string | null {
  return key.startsWith(FILE_KEY_PREFIX) ? key.slice(FILE_KEY_PREFIX.length) : null
}

/**
 * The cover tabs this page can actually store. No `link` tier: the CSP's `img-src`
 * allows no external host.
 */
export function coverTiersFor(_place: string): readonly CoverTier[] {
  return ['gallery', 'upload', 'photos']
}

// Photos come through this origin: the CSP blocks direct Openverse requests, so
// `routes/cover-photos.ts` proxies the search and stores the chosen photo as a file.

/** All three page kinds can store a crop today. */
export function coverStoresPosition(_place: string): boolean {
  return true
}

/** Both endpoints answer the stored file row. */
const storedCoverSchema = z.object({ id: z.uuid() })

function reportCoverFailure(error: unknown): void {
  showToast(writeFailureMessage(error))
}

/** The same filterless invalidation every mutation makes. */
function settleWrites(): void {
  void queryClient()?.invalidateQueries()
}

/**
 * The page shows the id the server returns, never the one sent: the server may copy a
 * file into the page's scope. The crop resets to the default with a new picture.
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
 * A folder's upload is scoped to the folder; shelves and place pages upload a
 * folder-less file only the owner can read.
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
 * The server fetches and stores the photo. Folder pages use the folder route; others
 * use `/covers/photo`.
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

/** `colour-blue` back to `colour:blue`. */
export function presetToKey(preset: string): string {
  const cut = preset.indexOf('-')
  return cut === -1 ? preset : `${preset.slice(0, cut)}:${preset.slice(cut + 1)}`
}

/** `colour:blue` to `colour-blue`, or null where the key names no preset. */
export function keyToPreset(key: string): string | null {
  const preset = key.replace(':', '-')
  return /^[a-z0-9-]{1,40}$/.test(preset) ? preset : null
}

/** Preset first; at most one of the two is set. A file resolves to its served path. */
export function coverKeyOf(cover: PlaceCover): string | undefined {
  if (cover.preset !== null) return presetToKey(cover.preset)
  if (cover.file_id !== null) return `${FILE_KEY_PREFIX}${cover.file_id}`
  return undefined
}

/** Folders and shelves hold the same cover columns; preset first, then file. */
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

/** A place page's covers are one shared query for all places. */
export function usePageIdentity(place: string): PageIdentity {
  const page = pageOf(place)
  const covers = usePlaceCovers()
  const descriptions = usePlaceDescriptions(page.kind === 'place')
  // Hooks must run on every page; each is disabled where it has nothing to read.
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
 * Removal clears both columns; a fresh cover starts at the default crop. Null where the
 * key names no column.
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
 * `{ cover }` chooses or removes, `{ coverPos }` moves the crop. A place's removal is a
 * DELETE; a position change re-sends its cover (the PUT takes the whole entry).
 * Not a `useMutation`, so it invalidates by hand.
 */
export function savePageIdentity(
  place: string,
  patch: Partial<PageIdentity>,
): void {
  const page = pageOf(place)

  // Folders and shelves share one PATCH body: cover columns, crop and description, plus
  // a shelf's icon and colour.
  if (page.kind !== 'place') {
    const body: Record<string, unknown> = {}
    if ('cover' in patch) {
      const columns = coverColumnsFor(patch.cover)
      // A key no column can spell is dropped rather than sent to be refused.
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

  // A description-only edit is done above.
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
  // The server takes exactly one of `file_id` and `preset`, so the key decides which.
  // Any other key (a `link:` elsewhere) is dropped.
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
