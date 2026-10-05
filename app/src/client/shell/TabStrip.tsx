/*
 * The app-level tab strip: which Dana places are open, separate from a project's own tabs. The + is an
 * open-place search with one New page action.
 */
import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router'

import { useCreateFolder } from '../api/mutations.js'
import { useAllPages, useBundle, useFolders, useShelves, useTask } from '../api/queries.js'
import { Box, CheckCircle2, FileText, Folders, MessagesSquare, Plus, Search, Settings, Trash2, UsersRound, X } from '../lib/icons.js'
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
import { FOLDER_ACTION_PARAM } from './app-sidebar.js'
import { focusList, focusMark, isFocusKey } from './focus-lists.js'
import { clearTabDrop, registerTabStrip, useTabDrag } from './tab-drop.js'
import {
  closeTab,
  openInNewTab,
  reorderTabs,
  retarget,
  selectTab,
  tabKey,
  updateActiveCollaboration,
  useTabs,
} from './tabs.js'
import type { CollaborationState } from './tabs.js'

const NO_FOLDERS: readonly Folder[] = []
const NO_SHELVES: readonly Shelf[] = []
const SEARCH_DEBOUNCE_MS = 150

type SearchItem = SearchAnswer['results'][number]

interface OpenPlace {
  readonly path: string
  readonly label: string
  readonly hint: string
  readonly icon: LucideIcon
  readonly color?: string
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
  if (key === paths.archivedWork) return 'Archived work'
  if (key === paths.trash) return 'Trash'
  return 'Dana'
}

/*
 * One tab face, from the same identity resolvers as the sidebar rows. Reads a Task only for a Task tab. A
 * full-page collaboration surface keeps its tab and shows "Project · Discussion" or "Project · Team".
 */
function TabFace({
  path,
  collaboration,
  folders,
  shelves,
  focusAppearance,
  labelId,
}: {
  readonly path: string
  readonly collaboration: CollaborationState | null
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
  } else if (key === paths.archivedWork) {
    identity = { title: 'Archived work', icon: Box }
  } else if (key === paths.trash) {
    identity = { title: 'Trash', icon: Trash2 }
  } else {
    identity = { title: 'Dana', icon: FileText }
  }

  if (collaboration?.presentation === 'full') {
    identity = collaboration.kind === 'discussion'
      ? { title: `${identity.title} · Discussion`, icon: MessagesSquare }
      : { title: `${identity.title} · Team`, icon: UsersRound }
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

function searchPlace(item: SearchItem, places: readonly OpenPlace[]): OpenPlace | null {
  if (item.id === SHORTCUTS_RESULT) return null

  let result: OpenPlace
  switch (item.kind) {
    case 'task':
      result = {
        path: paths.task(item.id),
        label: item.title,
        hint: item.hint ? `Task · ${item.hint}` : 'Task',
        icon: CheckCircle2,
      }
      break
    case 'folder':
      result = {
        path: paths.folder(item.id),
        label: item.title,
        hint: 'Page',
        icon: item.icon ?? FileText,
        ...(item.color === undefined ? {} : { color: item.color }),
      }
      break
    case 'shelf':
      result = {
        path: paths.shelf(item.id),
        label: item.title,
        hint: 'Collection',
        icon: item.icon ?? Folders,
        ...(item.color === undefined ? {} : { color: item.color }),
      }
      break
    case 'page':
      result = {
        path: item.id,
        label: item.title,
        hint: item.passage ? item.hint ?? 'In page' : 'Place',
        icon: item.icon ?? FileText,
        ...(item.color === undefined ? {} : { color: item.color }),
      }
      break
  }

  /* Prefer the local place row when known; it has the freshest identity. */
  return places.find((place) => place.path === result.path) ?? result
}

function uniquePlaces(places: readonly OpenPlace[]): OpenPlace[] {
  const seen = new Set<string>()
  return places.filter((place) => {
    if (seen.has(place.path)) return false
    seen.add(place.path)
    return true
  })
}

function OpenPlacePicker({
  places,
  onPick,
  onCreatePage,
}: {
  readonly places: readonly OpenPlace[]
  readonly onPick: (path: string) => void
  readonly onCreatePage: () => void
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
      .map((item) => searchPlace(item, places))
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

  function createPage(): void {
    changeOpen(false)
    onCreatePage()
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
            shown.map((place, index) => {
              const Icon = place.icon
              return (
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
                  <Icon
                    className="size-4 shrink-0"
                    strokeWidth={1.75}
                    style={place.color === undefined ? undefined : { color: place.color }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">{place.label}</span>
                  <span className="max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">{place.hint}</span>
                </button>
              )
            })
          )}
        </div>
        <div className="mt-1 border-t border-border pt-1">
          <button
            type="button"
            onClick={createPage}
            className="flex h-[var(--control-height)] w-full items-center gap-2 rounded-md px-2 text-left text-sm font-normal text-foreground hover:bg-accent"
          >
            <Plus className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span>New page</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function TabStrip() {
  const location = useLocation()
  const navigate = useNavigate()
  const library = useFolders().data ?? NO_FOLDERS
  const allPages = useAllPages().data
  /* A project's tab is not a Library row: name and mark it as its project. */
  const folders = useMemo(() => {
    if (allPages === undefined) return library
    const byId = new Map(allPages.map((page) => [page.id, page]))
    const tabs = allPages.flatMap((page) => {
      if (page.tab_position === null || page.id === page.project_id) return []
      const root = byId.get(page.project_id)
      return root === undefined ? [] : [{ ...root, id: page.id }]
    })
    return tabs.length === 0 ? library : [...library, ...tabs]
  }, [library, allPages])
  const shelves = useShelves().data ?? NO_SHELVES
  const bundle = useBundle().data
  const focusKeys = bundle?.focus_lists ?? DEFAULT_FOCUS_LISTS
  const focusAppearance = bundle?.focus_appearance
  const createFolder = useCreateFolder()
  const creatingPage = useRef(false)
  const { tabs, activeId } = useTabs()
  const tablist = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  /* A sidebar row dragged out (`tab-drop.ts`): a ghost tab over the strip, a card elsewhere. */
  const carried = useTabDrag()
  const slot = carried?.slot ?? null
  useEffect(() => {
    if (bar.current === null || tablist.current === null) return undefined
    registerTabStrip({ bar: bar.current, list: tablist.current, go: (path) => void navigate(path) })
    return () => { registerTabStrip(null) }
  }, [navigate])
  /* However a drag ends (a release elsewhere, Escape), the ghost goes with it. */
  useEffect(() => {
    const end = (): void => { clearTabDrop() }
    const escape = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') clearTabDrop()
    }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('keydown', escape)
    }
  }, [])
  const desk = folders.find((folder) => folder.is_default)
  const emptyTabPath = desk === undefined ? `${paths.home}/desk` : paths.folder(desk.id)

  const route = `${location.pathname}${location.search}${location.hash}`
  useEffect(() => {
    retarget(route)
  }, [route])

  const activeTab = tabs.find((tab) => tab.id === activeId)
  const activeCollaboration = activeTab?.collaboration
  /*
   * Back from an expanded Discussion returns to the remembered route; once the tab matches it, restore the
   * Discussion as a sidebar. A committed expansion has a different tab.path, so this cannot cancel it.
   */
  useEffect(() => {
    if (
      activeTab?.path !== route ||
      activeCollaboration?.kind !== 'discussion' ||
      activeCollaboration.presentation !== 'full' ||
      activeCollaboration.returnTo !== route
    ) return
    updateActiveCollaboration((current) => {
      if (current?.kind !== 'discussion' || current.presentation !== 'full') return current
      return { ...current, presentation: 'sidebar' }
    })
  }, [activeCollaboration, activeTab?.path, route])

  const places = useMemo<readonly OpenPlace[]>(() => {
    const fixed: OpenPlace[] = navPages.map((page) => {
      const mark = focusMark(page.key, focusAppearance)
      return {
        path: page.path,
        label: page.name,
        hint: 'Focus',
        icon: mark.icon,
        ...(mark.color === undefined ? {} : { color: mark.color }),
      }
    })
    const fixedPaths = new Set(fixed.map((place) => place.path))
    const extraFocus = focusKeys
      .map((key) => focusList(key))
      .filter((list) => !fixedPaths.has(list.path))
      .map((list): OpenPlace => {
        const mark = focusMark(list.key, focusAppearance)
        return {
          path: list.path,
          label: list.name,
          hint: 'Focus',
          icon: mark.icon,
          ...(mark.color === undefined ? {} : { color: mark.color }),
        }
      })
    const pages = folders.map((folder): OpenPlace => {
      const mark = folderMark(folder)
      return {
        path: paths.folder(folder.id),
        label: folder.name,
        hint: 'Page',
        icon: mark.icon,
        color: mark.color,
      }
    })
    const collections = shelves.map((shelf): OpenPlace => {
      const mark = shelfMark(shelf)
      return {
        path: paths.shelf(shelf.id),
        label: shelf.name,
        hint: 'Collection',
        icon: mark.icon,
        color: mark.color,
      }
    })
    return [
      ...fixed,
      ...extraFocus,
      ...pages,
      ...collections,
      { path: paths.settings, label: 'Settings', hint: 'Place', icon: Settings },
      { path: paths.trash, label: 'Trash', hint: 'Place', icon: Trash2 },
    ]
  }, [focusAppearance, focusKeys, folders, shelves])

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

  /* The tab a dragged row would become, so the strip shows where it opens before the release. */
  function ghost(path: string): React.JSX.Element {
    return (
      <div
        data-tab-ghost=""
        aria-hidden="true"
        className="pointer-events-none relative flex w-52 min-w-32 max-w-52 items-center gap-2 self-stretch bg-background px-3 pr-7 text-left text-sm font-medium text-foreground opacity-60 animate-in fade-in-0 duration-150 motion-reduce:animate-none"
      >
        <TabFace
          path={path}
          collaboration={null}
          folders={folders}
          shelves={shelves}
          focusAppearance={focusAppearance}
          labelId="dana-workspace-tab-ghost"
        />
      </div>
    )
  }

  function createPage(): void {
    if (creatingPage.current) return
    creatingPage.current = true
    /* A new unpicked project: its page offers the picker. */
    createFolder.mutate(
      { name: 'Untitled', kind: null },
      {
        onSuccess: (made) => {
          go(openInNewTab(`${paths.folder(made.id)}?${FOLDER_ACTION_PARAM}=rename`))
        },
        onSettled: () => {
          creatingPage.current = false
        },
      },
    )
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
    <div ref={bar} className="hidden h-8 shrink-0 items-stretch border-b border-border bg-sidebar md:flex">
      {/* Browser history arrows belong with the tab navigation. */}
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
            <Fragment key={tab.id}>
            {carried !== null && slot === index ? ghost(carried.path) : null}
            <div
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
                collaboration={tab.collaboration}
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
            </Fragment>
          )
        })}
        {carried !== null && slot !== null && slot >= tabs.length ? ghost(carried.path) : null}
      </div>
      {carried !== null && slot === null
        ? createPortal(
            /* A tab-shaped card held below and right of the pointer, so the pointer still sees what it is over. */
            <div
              data-tab-drag-card=""
              aria-hidden="true"
              className="pointer-events-none fixed z-50 flex h-8 w-52 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground shadow-sm"
              style={{ left: carried.x + 12, top: carried.y + 8 }}
            >
              <TabFace
                path={carried.path}
                collaboration={null}
                folders={folders}
                shelves={shelves}
                focusAppearance={focusAppearance}
                labelId="dana-workspace-tab-carried"
              />
            </div>,
            document.body,
          )
        : null}
      <OpenPlacePicker
        places={places}
        onPick={(path) => {
          go(openInNewTab(path))
        }}
        onCreatePage={createPage}
      />
    </div>
  )
}
