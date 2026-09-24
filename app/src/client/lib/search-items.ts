/*
What search can find, as `components/search-overlay.tsx` reads it:
`SearchResultItem[]`, answered by 6 Q8 and 7.18.

The overlay owns the typed query and debounces it. The tasks cannot all be in
hand, so the hook below does the rest: given the debounced query it answers the
places when nothing is typed (an empty box offers the places rather than
nothing), and otherwise asks Q8 through `useSearch`, which refuses a query under
two characters, and shapes the four kinds 7.18 returns into the one item shape.

**A title match ranks above a body match**: somebody typing *venue* means the
thing called venue before the thing that mentions it. Section 6's rule that
clients never re-sort is about the query orders; what the overlay keeps of Q8's
is the status order inside Tasks, which the rank sort is stable over, so a
pending row is still above an abandoned one and the ranked order is inside each
status.

**A page result's id is a route**, because opening one means going there: a nav
page's is its path, and a 7.18 page hit's is the path of the folder or shelf
whose page carries the block, with the block's own text as the title and the
page's name as the hint. `kind: "page"` covers both: a page is anything you go
to rather than open.

**The folder chip on a task result is the sidebar's folder list**, looked up by
id, which is `parts/presenters.ts`'s `folderDisplay` rule: the card carries a
stub and the identity rides the Folder object. It is not the response's
`folders`, which is the folders the query matched; do not confuse the two.
*/
import { useMemo } from 'react'

import { useFolders, useSearch, useShelves } from '../api/queries.js'
import { folderMark, shelfMark } from '../parts/presenters.js'
import { NAV_PAGES, pageQuestion } from './nav-model.js'
import { paths } from '../routes.js'
import type { SearchResultItem } from '../components/search-overlay.js'

/** Q8's floor, which the endpoint refuses below. */
export const MIN_QUERY = 2

export interface SearchAnswer {
  results: SearchResultItem[]
  pending: boolean
  failed: boolean
}

/** 9.1's page block as rows to go to. */
export function placeItems(): SearchResultItem[] {
  return NAV_PAGES.map((page) => ({
    kind: 'page',
    id: page.path,
    title: page.name,
    hint: pageQuestion(page.name) ?? '',
  }))
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
    if (normalized.length < MIN_QUERY) return placeItems()
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
    const found: SearchResultItem[] = (data.folders ?? []).map((hit) => ({
      kind: 'folder',
      id: hit.id,
      title: hit.name,
      hint: 'Folder',
      color: folderMark(byId.get(hit.id)).color,
    }))
    const foundShelves: SearchResultItem[] = (data.shelves ?? []).map((hit) => {
      const shelf = shelfById.get(hit.id)
      return {
        kind: 'shelf',
        id: hit.id,
        title: hit.name,
        hint: 'Shelf',
        ...(shelf === undefined ? {} : { color: shelfMark(shelf).color }),
      }
    })
    const pages: SearchResultItem[] = (data.pages ?? []).map((hit) => {
      const home =
        hit.folder_id !== null
          ? { path: paths.folder(hit.folder_id), name: byId.get(hit.folder_id)?.name }
          : hit.shelf_id !== null
            ? { path: paths.shelf(hit.shelf_id), name: shelfById.get(hit.shelf_id)?.name }
            : null
      return {
        kind: 'page',
        id: home?.path ?? paths.today,
        title: hit.text,
        hint: home?.name === undefined ? 'Page' : `On ${home.name}`,
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
    const all = [...tasks, ...found, ...foundShelves, ...places, ...pages]
    /* A title match beats a body match. Stable, so Q8's status order inside
       Tasks survives it. */
    return all
      .map((item) => ({
        item,
        rank: item.title.toLocaleLowerCase().includes(normalized) ? 0 : 1,
      }))
      .sort((a, b) => a.rank - b.rank)
      .map((entry) => entry.item)
  }, [normalized, data, folderList, shelfList])

  return {
    results,
    pending: asking && search.isPending,
    failed: asking && search.isError,
  }
}
