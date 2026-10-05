// What search finds, shaped for the overlay. Empty query: the places. Otherwise the server
// search (two characters minimum). `rank`: 0 exact name, 1 prefix, 2 a later word, 3
// contains, 4 other or a passage. A page result's id is a route.
import { useMemo } from 'react'

import { useBundle, useFolders, useSearch, useShelves } from '../api/queries.js'
import { folderMark, shelfMark } from '../parts/presenters.js'
import { markIcon } from '../components/page/icon-manifest.js'
import { AlignLeft } from './icons.js'
import type { Folder } from '../../shared/folders.js'
import type { FocusAppearance } from '../../shared/bundle.js'
import { navPages, paths } from '../routes.js'
import { focusMark } from '../shell/focus-lists.js'
import type { SearchResultItem } from '../components/search-overlay.js'
import { crumbTrail } from '../components/page-head.js'

// A hit's place in the page tree as one muted line, already cut by the server where
// the viewer's access ends.
function trailHint(crumbs: readonly { readonly name: string }[] | undefined): string | null {
  if (crumbs === undefined || crumbs.length === 0) return null
  return crumbTrail(crumbs).map((crumb) => crumb?.name ?? '…').join(' / ')
}

// How well a name answers the query; see the header.
export function nameRank(name: string, normalized: string): number {
  const title = name.toLocaleLowerCase()
  if (title === normalized) return 0
  if (title.startsWith(normalized)) return 1
  if (title.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(normalized))) return 2
  if (title.includes(normalized)) return 3
  return 4
}

// A passage matched on its text, never its name.
const PASSAGE_RANK = 4

// Passages come after every name match and are capped, so a common word cannot bury
// the task named it.
const PASSAGE_LIMIT = 5

// Start a little before the match, so the row shows why it matched.
function around(text: string, normalized: string): string {
  const at = text.toLocaleLowerCase().indexOf(normalized)
  if (at <= 24) return text
  // Back to a word start about three words before the match.
  const space = text.lastIndexOf(' ', at - 16)
  const start = space > at - 32 ? space + 1 : at - 16
  return `…${text.slice(start)}`
}

// A page's ancestors from the viewer's own tree, for one-character queries with no
// server trail.
function ancestorsOf(byId: ReadonlyMap<string, Folder>, folder: Folder): Folder[] {
  const trail: Folder[] = []
  const seen = new Set([folder.id])
  let up = folder.parent_folder_id ?? null
  while (up !== null && !seen.has(up)) {
    const parent = byId.get(up)
    if (parent === undefined) break
    trail.unshift(parent)
    seen.add(up)
    up = parent.parent_folder_id ?? null
  }
  return trail
}

/** The server refuses shorter queries. */
export const MIN_QUERY = 2

// A folder is a page on screen: its chosen glyph, or the plain page glyph. Never the
// generic folder.
function pageResult(folder: Folder | undefined, id: string, title: string, hint: string): SearchResultItem {
  const mark = folderMark(folder)
  return {
    kind: 'folder',
    id,
    title,
    hint,
    color: mark.color,
    ...(folder?.icon == null ? {} : { icon: markIcon(folder.icon) }),
  }
}

// One character is too short for the server, so filter what is in hand by word start.
function startsAWord(name: string, char: string): boolean {
  return name
    .toLocaleLowerCase()
    .split(/\s+/)
    .some((word) => word.startsWith(char))
}

export interface SearchAnswer {
  results: SearchResultItem[]
  pending: boolean
  failed: boolean
}

/**
 * The one command search offers: the shortcuts sheet. Its id is not a path; the
 * overlay's opener checks it.
 */
export const SHORTCUTS_RESULT = '#keyboard-shortcuts'

export function placeItems(appearance?: FocusAppearance): SearchResultItem[] {
  return [
    ...navPages.map((place): SearchResultItem => {
      const mark = focusMark(place.key, appearance)
      return {
        kind: 'page',
        id: place.path,
        title: place.name,
        hint: '',
        icon: mark.icon,
        ...(mark.color === undefined ? {} : { color: mark.color }),
      }
    }),
    { kind: 'page', id: SHORTCUTS_RESULT, title: 'Keyboard shortcuts', hint: '' },
  ]
}

export function useSearchAnswer(query: string, open: boolean): SearchAnswer {
  const normalized = query.trim().toLocaleLowerCase()
  const asking = open && normalized.length >= MIN_QUERY
  const search = useSearch(normalized, asking)
  const bundle = useBundle()
  const folders = useFolders()
  const shelves = useShelves(open)
  const data = search.data
  const folderList = folders.data
  const shelfList = shelves.data
  const focusAppearance = bundle.data?.focus_appearance

  const results = useMemo((): SearchResultItem[] => {
    if (normalized.length === 0) return placeItems(focusAppearance)
    if (normalized.length < MIN_QUERY) {
      const inHand = new Map((folderList ?? []).map((folder) => [folder.id, folder]))
      return [
        ...(folderList ?? [])
          .filter((folder) => startsAWord(folder.name, normalized))
          .map((folder) =>
            pageResult(folder, folder.id, folder.name, trailHint(ancestorsOf(inHand, folder)) ?? ''),
          ),
        ...(shelfList ?? [])
          .filter((shelf) => startsAWord(shelf.name, normalized))
          .map((shelf): SearchResultItem => ({
            kind: 'shelf',
            id: shelf.id,
            title: shelf.name,
            color: shelfMark(shelf).color,
          })),
        ...placeItems(focusAppearance).filter((place) => startsAWord(place.title, normalized)),
      ]
        .map((item): SearchResultItem => ({ ...item, rank: nameRank(item.title, normalized) }))
        .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    }
    if (data === undefined) return []
    const byId = new Map((folderList ?? []).map((folder) => [folder.id, folder]))
    const shelfById = new Map((shelfList ?? []).map((shelf) => [shelf.id, shelf]))

    const tasks: SearchResultItem[] = data.rows.map((row) => {
      const folder = byId.get(row.folder.id)
      return {
        kind: 'task',
        id: row.id,
        title: row.title,
        hint: row.folder.name,
        status: row.status,
        folder: { name: row.folder.name, color: folderMark(folder).color },
        ...(row.due_date === null ? {} : { dueDate: row.due_date }),
      }
    })
    const found: SearchResultItem[] = (data.folders ?? []).map((hit) =>
      pageResult(byId.get(hit.id), hit.id, hit.name, trailHint(hit.breadcrumbs) ?? ''),
    )
    const foundShelves: SearchResultItem[] = (data.shelves ?? []).map((hit) => {
      const shelf = shelfById.get(hit.id)
      return {
        kind: 'shelf',
        id: hit.id,
        title: hit.name,
        ...(shelf === undefined ? {} : { color: shelfMark(shelf).color }),
      }
    })
    const pages: SearchResultItem[] = (data.pages ?? []).slice(0, PASSAGE_LIMIT).map((hit) => {
      const home =
        hit.folder_id !== null
          ? { path: paths.folder(hit.folder_id), name: byId.get(hit.folder_id)?.name }
          : hit.shelf_id !== null
            ? { path: paths.shelf(hit.shelf_id), name: shelfById.get(hit.shelf_id)?.name }
            : null
      const where = trailHint(hit.breadcrumbs) ?? home?.name
      return {
        kind: 'page',
        id: home === null ? paths.today : `${home.path}#block-${hit.block_id}`,
        title: around(hit.text, normalized),
        hint: where === undefined ? '' : `in ${where}`,
        // A passage, not a page called that: it wears the text glyph.
        icon: AlignLeft,
        passage: true,
        rank: PASSAGE_RANK,
      }
    })
    // Places are findable by typing too, by name or by the question they answer.
    const places = placeItems(focusAppearance).filter(
      (place) =>
        place.title.toLocaleLowerCase().includes(normalized) ||
        (place.hint ?? '').toLocaleLowerCase().includes(normalized),
    )
    const named = [...tasks, ...found, ...foundShelves, ...places].map(
      (item): SearchResultItem => ({ ...item, rank: nameRank(item.title, normalized) }),
    )
    // Stable, so the server's status order survives among tasks of one rank.
    return [...named, ...pages].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
  }, [normalized, data, folderList, shelfList, focusAppearance])

  return {
    results,
    pending: asking && search.isPending,
    failed: asking && search.isError,
  }
}
