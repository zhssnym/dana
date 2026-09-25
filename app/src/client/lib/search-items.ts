/*
What search can find, as `components/search-overlay.tsx` reads it:
`SearchResultItem[]`, answered by 6 Q8 and 7.18.

The overlay owns the typed query and debounces it. The tasks cannot all be in
hand, so the hook below does the rest: given the debounced query it answers the
places when nothing is typed (an empty box offers the places rather than
nothing), and otherwise asks Q8 through `useSearch`, which refuses a query under
two characters, and shapes the four kinds 7.18 returns into the one item shape.

**A title match ranks above a body match**: somebody typing *venue* means the
thing called venue before the thing that mentions it. Each result carries a
`rank`: 0 when its name is what was typed, 1 when its name starts with it, 2
when a later word in its name does, 3 when its name only contains it, 4 when it
matched on something else. A passage is always 4: its "title" is the text that
matched, so reading a rank off it would call every passage a name match. One
typed character ranks the same way, so the list does not reorder when the
second character hands the query to Q8. The overlay orders
by it (`components/search-overlay.tsx`); Q8's status order survives only among
tasks of one rank.

**A page result's id is a route**, because opening one means going there: a nav
page's is its path, and a 7.18 page hit's is the path of the folder or shelf
whose page carries the block, plus `#block-<id>` so the page scrolls to the passage
(`useBlockAnchor`), with the block's own text as the title and "in" the page's
trail as the hint, which keeps it from reading like a child page's parent trail. `kind: "page"` covers both: a page is anything you go
to rather than open.

**The folder chip on a task result is the sidebar's folder list**, looked up by
id, which is `parts/presenters.ts`'s `folderDisplay` rule: the card carries a
stub and the identity rides the Folder object. It is not the response's
`folders`, which is the folders the query matched; do not confuse the two.
*/
import { useMemo } from 'react'

import { useFolders, useSearch, useShelves } from '../api/queries.js'
import { folderMark, shelfMark } from '../parts/presenters.js'
import { markIcon } from '../components/page/icon-manifest.js'
import { AlignLeft } from './icons.js'
import type { Folder } from '../../shared/folders.js'
import { navPages, paths } from '../routes.js'
import type { SearchResultItem } from '../components/search-overlay.js'
import { crumbTrail } from '../components/page-head.js'

/* Wave 2: a hit's place in the page tree as one muted line, "Root / … /
   Parent", already cut by the server where the viewer's access ends. */
function trailHint(crumbs: readonly { readonly name: string }[] | undefined): string | null {
  if (crumbs === undefined || crumbs.length === 0) return null
  return crumbTrail(crumbs).map((crumb) => crumb?.name ?? '…').join(' / ')
}

/* How well a name answers the query; see the header. */
export function nameRank(name: string, normalized: string): number {
  const title = name.toLocaleLowerCase()
  if (title === normalized) return 0
  if (title.startsWith(normalized)) return 1
  if (title.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(normalized))) return 2
  if (title.includes(normalized)) return 3
  return 4
}

/* A passage matched on its text, never its name. */
const PASSAGE_RANK = 4

/* Passages come after every name match and are capped, so a word used all
   over the pages cannot bury the task named it. */
const PASSAGE_LIMIT = 5

/* A passage's text from a little before the match, so the row shows why it
   matched rather than the paragraph's opening words. */
function around(text: string, normalized: string): string {
  const at = text.toLocaleLowerCase().indexOf(normalized)
  if (at <= 24) return text
  /* Back to the start of a word about three words before the match. */
  const space = text.lastIndexOf(' ', at - 16)
  const start = space > at - 32 ? space + 1 : at - 16
  return `…${text.slice(start)}`
}

/* A page's ancestors in the viewer's own tree, root first, as the server's
   breadcrumbs name them; used below Q8's floor, where there is no server trail. */
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

/** Q8's floor, which the endpoint refuses below. */
export const MIN_QUERY = 2

/* A folder is a page on screen, so one found by search is drawn as a page:
   the glyph its owner chose, or the plain page glyph when none was chosen
   (the overlay draws that fallback). Never the generic folder. */
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

/* One character is too short for Q8, which refuses it, so it filters what is
   already in hand: the places, and the pages and collections the sidebar
   holds, by the start of any word in the name. */
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

/** 9.1's page block as rows to go to. */
/** The one command search offers besides places: the shortcuts sheet, whose
    other door is `?`. Its id is not a path; the overlay's opener checks it. */
export const SHORTCUTS_RESULT = '#keyboard-shortcuts'

export function placeItems(): SearchResultItem[] {
  return [
    ...navPages.map((place): SearchResultItem => ({ kind: 'page', id: place.path, title: place.name, hint: '' })),
    { kind: 'page', id: SHORTCUTS_RESULT, title: 'Keyboard shortcuts', hint: '' },
  ]
}

export function useSearchAnswer(query: string, open: boolean): SearchAnswer {
  const normalized = query.trim().toLocaleLowerCase()
  const asking = open && normalized.length >= MIN_QUERY
  const search = useSearch(normalized, asking)
  const folders = useFolders()
  const shelves = useShelves(open)
  const data = search.data
  const folderList = folders.data
  const shelfList = shelves.data

  const results = useMemo((): SearchResultItem[] => {
    if (normalized.length === 0) return placeItems()
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
        ...placeItems().filter((place) => startsAWord(place.title, normalized)),
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
        /* A passage, not a page called that: it wears the text glyph. */
        icon: AlignLeft,
        passage: true,
        rank: PASSAGE_RANK,
      }
    })
    /* The places are findable by typing too, not only offered before anything
       is typed: "sched" should reach Scheduled. A page matches on its name or
       on the question it answers. */
    const places = placeItems().filter(
      (place) =>
        place.title.toLocaleLowerCase().includes(normalized) ||
        (place.hint ?? '').toLocaleLowerCase().includes(normalized),
    )
    const named = [...tasks, ...found, ...foundShelves, ...places].map(
      (item): SearchResultItem => ({ ...item, rank: nameRank(item.title, normalized) }),
    )
    /* Stable, so Q8's status order survives among tasks of one rank. */
    return [...named, ...pages].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
  }, [normalized, data, folderList, shelfList])

  return {
    results,
    pending: asking && search.isPending,
    failed: asking && search.isError,
  }
}
