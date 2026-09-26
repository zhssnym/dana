/*
A restrained application-level working set.

This is intentionally separate from a Folder's Purpose / Work / Results /
Discussion tabs. Those change the view inside one page; these tabs remember
which Dana places are open. The sidebar still answers where things live.

The + is an open-place search, not a creation menu. It reuses Dana's search
answer so a person can open a Page, Collection or Task without restoring the
old New folder / New shelf / New task menu.
*/
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { useBundle, useFolders, useShelves, useTask } from '../api/queries.js'
import { CheckCircle2, FileText, Plus, Search, Settings, Trash2, X } from '../lib/icons.js'
import type { LucideIcon } from '../lib/icons.js'
import { SHORTCUTS_RESULT, useSearchAnswer, type SearchAnswer } from '../lib/search-items.js'
import { useSortableList } from '../lib/use-sortable-list.js'
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover.js'
import { HistoryArrows } from '../components/breadcrumb-trail.js'
import { folderMark, shelfMark } from '../parts/presenters.js'
import { navPages, paths } from '../routes.js'
import { DEFAULT_FOCUS_LISTS } from '../../shared/bundle.js'
import type { FocusAppearance } from '../../shared/bundle.js'
import type { Folder } from '../../shared/folders.js'
import type { Shelf } from '../../shared/shelves.js'
import { focusList, focusMark, isFocusKey } from './focus-lists.js'
import {
  closeTab,
  openInNewTab,
  reorderTabs,
  retarget,
  selectTab,
  tabKey,
  useTabs,
} from './tabs.js'

const NO_FOLDERS: readonly Folder[] = []
const NO_SHELVES: readonly Shelf[] = []
const SEARCH_DEBOUNCE_MS = 150

type SearchItem = SearchAnswer['results'][number]

interface OpenPlace {
  readonly path: string
  readonly label: string
  readonly hint: string
}

interface TabIdentity {
  readonly title: string
  readonly icon: LucideIcon
  readonly color?: string
}

function titleFor(path: string, folders: readonly Folder[], shelves: readonly Shelf[]): string {
  const key = tabKey(path)
  const fixed = navPages.find((page) => page.path === key)
  if (fixed !== undefined) return fixed.name

  if (key.startsWith('/app/lists/')) {
    const listKey = key.slice('/app/lists/'.length)
    if (isFocusKey(listKey)) return focusList(listKey).name
  }

  if (key.startsWith('/app/folders/')) {
    const id = key.slice('/app/folders/'.length)
    return folders.find((folder) => folder.id === id)?.name ?? 'Page'
  }

  if (key.startsWith('/app/shelves/')) {
    const id = key.slice('/app/shelves/'.length)
    return shelves.find((shelf) => shelf.id === id)?.name ?? 'Collection'
  }

  if (key.startsWith('/app/tasks/')) return 'Task'
  if (key === paths.settings) return 'Settings'
  if (key === paths.trash) return 'Trash'
  return 'Dana'
}

/*
One tab face, resolved from the metadata the rest of Dana already uses.

Pages and collections go through the same identity resolvers as their sidebar
rows, so a chosen mark and colour cannot drift here. Focus pages use #353's
same saved resolver as their page head and sidebar row. A Task's title is the
only piece the tab store itself does not know, so the face reads that one Task
while its tab is open; passing null keeps the hook inert for every other
destination.
*/
function TabFace({
  path,
  folders,
  shelves,
  focusAppearance,
  labelId,
}: {
  readonly path: string
  readonly folders: readonly Folder[]
  readonly shelves: readonly Shelf[]
  readonly focusAppearance: FocusAppearance | undefined
  readonly labelId: string
}): React.JSX.Element {
  const key = tabKey(path)
  const taskId = key.startsWith('/app/tasks/') ? key.slice('/app/tasks/'.length) : null
  const task = useTask(taskId)

  let identity: TabIdentity
  const fixed = navPages.find((page) => page.path === key)
  if (fixed !== undefined) {
    const mark = focusMark(fixed.key, focusAppearance)
    identity = {
      title: fixed.name,
      icon: mark.icon,
      ...(mark.color === undefined ? {} : { color: mark.color }),
    }
  } else if (key.startsWith('/app/lists/')) {
    const listKey = key.slice('/app/lists/'.length)
    if (isFocusKey(listKey)) {
      const list = focusList(listKey)
      const mark = focusMark(listKey, focusAppearance)
      identity = {
        title: list.name,
        icon: mark.icon,
        ...(mark.color === undefined ? {} : { color: mark.color }),
      }
    } else {
      identity = { title: 'Dana', icon: FileText }
    }
  } else if (key.startsWith('/app/folders/')) {
    const id = key.slice('/app/folders/'.length)
    const folder = folders.find((candidate) => candidate.id === id)
    const mark = folderMark(folder)
    identity = { title: folder?.name ?? 'Page', icon: mark.icon, color: mark.color }
  } else if (key.startsWith('/app/shelves/')) {
    const id = key.slice('/app/shelves/'.length)
    const shelf = shelves.find((candidate) => candidate.id === id)
    if (shelf === undefined) {
      identity = { title: 'Collection', icon: FileText }
    } else {
      const mark = shelfMark(shelf)
      identity = { title: shelf.name, icon: mark.icon, color: mark.color }
    }
  } else if (taskId !== null) {
    identity = { title: task.data?.title ?? 'Task', icon: CheckCircle2 }
  } else if (key === paths.settings || key === paths.people) {
    identity = { title: 'Settings', icon: Settings }
  } else if (key === paths.trash) {
    identity = { title: 'Trash', icon: Trash2 }
  } else {
    identity = { title: 'Dana', icon: FileText }
  }

  const Icon = identity.icon
  return (
    <>
      <Icon
        className="size-4 shrink-0"
        strokeWidth={1.75}
        style={identity.color === undefined ? undefined : { color: identity.color }}
        aria-hidden="true"
      />
      <span id={labelId} className="min-w-0 flex-1 truncate">
        {identity.title}
      </span>
    </>
  )
}

function searchPlace(item: SearchItem): OpenPlace | null {
  if (item.id === SHORTCUTS_RESULT) return null
  switch (item.kind) {
    case 'task':
      return {
        path: paths.task(item.id),
        label: item.title,
        hint: item.hint ? `Task · ${item.hint}` : 'Task',
      }
    case 'folder':
      return { path: paths.folder(item.id), label: item.title, hint: 'Page' }
    case 'shelf':
      return { path: paths.shelf(item.id), label: item.title, hint: 'Collection' }
    case 'page':
      return { path: item.id, label: item.title, hint: item.passage ? item.hint ?? 'In page' : 'Place' }
  }
}

function uniquePlaces(places: readonly OpenPlace[]): OpenPlace[] {
  const seen = new Set<string>()
  return places.filter((place) => {
    if (seen.has(place.path)) return false
    seen.add(place.path)
    return true
  })
}

function OpenPlacePicker({ places, onPick }: {
  readonly places: readonly OpenPlace[]
  readonly onPick: (path: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const answer = useSearchAnswer(debouncedQuery, open)

  useEffect(() => {
    if (!open) return undefined
    const trimmed = query.trim()
    if (trimmed === debouncedQuery) return undefined
    const timer = window.setTimeout(() => setDebouncedQuery(trimmed), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [debouncedQuery, open, query])

  const shown = useMemo(() => {
    const needle = debouncedQuery.toLocaleLowerCase()
    if (needle === '') return [...places]
    const local = places.filter((place) =>
      `${place.label} ${place.hint}`.toLocaleLowerCase().includes(needle),
    )
    const searched = answer.results
      .map(searchPlace)
      .filter((place): place is OpenPlace => place !== null)
    return uniquePlaces([...searched, ...local])
  }, [answer.results, debouncedQuery, places])

  function changeOpen(next: boolean): void {
    setOpen(next)
    if (next) {
      setQuery('')
      setDebouncedQuery('')
      setActive(0)
    }
  }

  function pick(place: OpenPlace | undefined): void {
    if (place === undefined) return
    changeOpen(false)
    onPick(place.path)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (shown.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => (index + 1) % shown.length)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => (index - 1 + shown.length) % shown.length)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      setActive(0)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      setActive(shown.length - 1)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      pick(shown[active] ?? shown[0])
    }
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger
        aria-label="Open tab"
        title="Open tab"
        className="flex h-full w-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent initialFocus={input} align="start" className="flex w-80 flex-col p-1">
        <div className="flex items-center gap-2 border-b border-border px-2 pb-1">
          <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          <input
            ref={input}
            value={query}
            placeholder="Open a tab"
            aria-label="Search Dana to open a tab"
            aria-controls="dana-open-tab-results"
            aria-activedescendant={shown[active] === undefined ? undefined : `dana-open-tab-${String(active)}`}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            className="h-[var(--control-height)] min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div
          id="dana-open-tab-results"
          role="listbox"
          aria-label="Places to open"
          className="max-h-72 overflow-y-auto pt-1"
        >
          {answer.pending && shown.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">Searching…</p>
          ) : answer.failed && shown.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">Search failed. Try again.</p>
          ) : shown.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">No places found</p>
          ) : (
            shown.map((place, index) => (
              <button
                key={place.path}
                id={`dana-open-tab-${String(index)}`}
                type="button"
                role="option"
                aria-selected={index === active}
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActive(index)}
                onClick={() => pick(place)}
                className={`flex h-[var(--control-height)] w-full items-center gap-2 rounded-md px-2 text-left text-sm font-normal text-foreground ${
                  index === active ? 'bg-accent' : ''
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{place.label}</span>
                <span className="max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">{place.hint}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function TabStrip() {
  const location = useLocation()
  const navigate = useNavigate()
  const folders = useFolders().data ?? NO_FOLDERS
  const shelves = useShelves().data ?? NO_SHELVES
  const bundle = useBundle().data
  const focusKeys = bundle?.focus_lists ?? DEFAULT_FOCUS_LISTS
  const focusAppearance = bundle?.focus_appearance
  const { tabs, activeId } = useTabs()
  const tablist = useRef<HTMLDivElement>(null)
  const desk = folders.find((folder) => folder.is_default)
  const emptyTabPath = desk === undefined ? `${paths.home}/desk` : paths.folder(desk.id)

  const route = `${location.pathname}${location.search}${location.hash}`
  useEffect(() => {
    retarget(route)
  }, [route])

  const places = useMemo<readonly OpenPlace[]>(() => {
    const fixed: OpenPlace[] = navPages.map((page) => ({
      path: page.path,
      label: page.name,
      hint: 'Focus',
    }))
    const fixedPaths = new Set(fixed.map((place) => place.path))
    const extraFocus = focusKeys
      .map((key) => focusList(key))
      .filter((list) => !fixedPaths.has(list.path))
      .map((list): OpenPlace => ({ path: list.path, label: list.name, hint: 'Focus' }))
    const pages = folders.map((folder): OpenPlace => ({
      path: paths.folder(folder.id),
      label: folder.name,
      hint: 'Page',
    }))
    const collections = shelves.map((shelf): OpenPlace => ({
      path: paths.shelf(shelf.id),
      label: shelf.name,
      hint: 'Collection',
    }))
    return [
      ...fixed,
      ...extraFocus,
      ...pages,
      ...collections,
      { path: paths.settings, label: 'Settings', hint: 'Place' },
      { path: paths.trash, label: 'Trash', hint: 'Place' },
    ]
  }, [focusKeys, folders, shelves])

  const drag = useSortableList({
    count: tabs.length,
    axis: 'x',
    onReorder: reorderTabs,
    describe: (index) => {
      const tab = tabs[index]
      return tab === undefined ? 'Tab' : titleFor(tab.path, folders, shelves)
    },
  })

  function go(path: string): void {
    void navigate(path)
  }

  function close(id: string): void {
    const next = closeTab(id, emptyTabPath)
    if (next !== null) go(next)
  }

  function activate(index: number): void {
    const tab = tabs[index]
    if (tab === undefined) return
    go(selectTab(tab.id))
    window.requestAnimationFrame(() => {
      tablist.current?.querySelectorAll<HTMLElement>('[role="tab"]')[index]?.focus()
    })
  }

  /* Keep a selected tab visible when switching into an overflowed working set. */
  useEffect(() => {
    tablist.current
      ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeId])

  return (
    <div className="hidden h-8 shrink-0 items-stretch border-b border-border bg-sidebar md:flex">
      {/* Browser history belongs with the working-set navigation. The same
          component is moved here intact, so its back/forward semantics do not
          fork from the former window-bar placement. */}
      <div className="flex shrink-0 items-center px-1">
        <HistoryArrows />
      </div>
      <div
        ref={tablist}
        role="tablist"
        aria-label="Open tabs"
        className="flex min-w-0 shrink items-stretch overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar-button]:hidden [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none' }}
      >
        {tabs.map((tab, index) => {
          const active = tab.id === activeId
          const state = drag.itemState(index)
          const labelId = `dana-workspace-tab-${tab.id}`
          return (
            <div
              key={tab.id}
              ref={drag.setItemRef(index)}
              role="tab"
              aria-selected={active}
              aria-labelledby={labelId}
              tabIndex={active ? 0 : -1}
              data-sort-handle
              {...drag.surfaceProps(index, () => go(selectTab(tab.id)))}
              onAuxClick={(event) => {
                if (event.button !== 1) return
                event.preventDefault()
                close(tab.id)
              }}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return
                if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
                  drag.handleProps(index).onKeyDown(event)
                  return
                }
                if (event.key === 'ArrowLeft') {
                  event.preventDefault()
                  activate(index === 0 ? tabs.length - 1 : index - 1)
                  return
                }
                if (event.key === 'ArrowRight') {
                  event.preventDefault()
                  activate(index === tabs.length - 1 ? 0 : index + 1)
                  return
                }
                if (event.key === 'Home') {
                  event.preventDefault()
                  activate(0)
                  return
                }
                if (event.key === 'End') {
                  event.preventDefault()
                  activate(tabs.length - 1)
                  return
                }
                if (event.key === 'Delete' || event.key === 'Backspace') {
                  event.preventDefault()
                  close(tab.id)
                  return
                }
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  go(selectTab(tab.id))
                }
              }}
              style={{
                touchAction: 'none',
                ...(state.offset === 0 && !state.isActive
                  ? {}
                  : {
                      transform: `translateX(${String(state.offset)}px)`,
                      transition:
                        state.isActive && !state.isSettling
                          ? 'none'
                          : 'transform 180ms cubic-bezier(0.2, 0, 0, 1)',
                      zIndex: state.isActive ? 30 : undefined,
                    }),
              }}
              className={`group/tab relative flex w-52 min-w-32 max-w-52 cursor-default items-center gap-2 self-stretch px-3 pr-7 text-left text-sm transition-colors ${
                active
                  ? 'bg-background font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              } ${state.isActive ? 'opacity-70 shadow-sm' : ''}`}
            >
              <TabFace
                path={tab.path}
                folders={folders}
                shelves={shelves}
                focusAppearance={focusAppearance}
                labelId={labelId}
              />
              <button
                type="button"
                aria-label="Close tab"
                onClick={() => close(tab.id)}
                className="absolute right-1 flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/tab:opacity-100 group-focus-within/tab:opacity-100"
              >
                <X className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </div>
      <OpenPlacePicker
        places={places}
        onPick={(path) => {
          go(openInNewTab(path))
        }}
      />
    </div>
  )
}
