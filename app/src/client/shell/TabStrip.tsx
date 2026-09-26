/*
A restrained application-level working set.

This is intentionally separate from a Folder's Purpose / Work / Results /
Discussion tabs. Those change the view inside one page; these tabs remember
which Dana places are open. The sidebar still answers where things live.

The + is an open-place search, not a creation menu. It only adds a place to
the working set; making folders, collections and tasks stays with the controls
that already own those actions in the Quiet shell.
*/
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { useBundle, useFolders, useShelves } from '../api/queries.js'
import { Plus, Search, X } from '../lib/icons.js'
import { useSortableList } from '../lib/use-sortable-list.js'
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover.js'
import { navPages, paths } from '../routes.js'
import { DEFAULT_FOCUS_LISTS } from '../../shared/bundle.js'
import type { Folder } from '../../shared/folders.js'
import type { Shelf } from '../../shared/shelves.js'
import { focusList, isFocusKey } from './focus-lists.js'
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

interface OpenPlace {
  readonly path: string
  readonly label: string
  readonly hint: string
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

function OpenPlacePicker({ places, onPick }: {
  readonly places: readonly OpenPlace[]
  readonly onPick: (path: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle === '') return places
    return places.filter((place) =>
      `${place.label} ${place.hint}`.toLowerCase().includes(needle),
    )
  }, [places, query])

  function changeOpen(next: boolean): void {
    setOpen(next)
    if (next) {
      setQuery('')
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
        className="flex h-full w-8 shrink-0 items-center justify-center text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        initialFocus={input}
        align="start"
        className="flex w-72 flex-col p-1"
      >
        <div className="flex items-center gap-2 border-b border-border px-2 pb-1">
          <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          <input
            ref={input}
            value={query}
            placeholder="Open a tab"
            aria-label="Search places"
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
          aria-label="Places"
          className="max-h-72 overflow-y-auto pt-1"
        >
          {shown.length === 0 ? (
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
                className={`flex h-[var(--control-height)] w-full items-center gap-2 rounded-md px-2 text-left text-sm font-normal text-foreground outline-none ${
                  index === active ? 'bg-accent' : ''
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{place.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{place.hint}</span>
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
  const focusKeys = useBundle().data?.focus_lists ?? DEFAULT_FOCUS_LISTS
  const { tabs, activeId } = useTabs()
  const tablist = useRef<HTMLDivElement>(null)

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
    const next = closeTab(id)
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
      <div
        ref={tablist}
        role="tablist"
        aria-label="Open tabs"
        className="flex min-w-0 shrink items-stretch overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar-button]:hidden [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none' }}
      >
        {tabs.map((tab, index) => {
          const title = titleFor(tab.path, folders, shelves)
          const active = tab.id === activeId
          const state = drag.itemState(index)
          const closable = !(tabs.length === 1 && tabKey(tab.path) === paths.today)
          return (
            <div
              key={tab.id}
              ref={drag.setItemRef(index)}
              role="tab"
              aria-selected={active}
              aria-label={title}
              tabIndex={active ? 0 : -1}
              data-sort-handle
              {...drag.surfaceProps(index, () => go(selectTab(tab.id)))}
              onAuxClick={(event) => {
                if (event.button !== 1 || !closable) return
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
                if ((event.key === 'Delete' || event.key === 'Backspace') && closable) {
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
              className={`group/tab relative flex w-52 min-w-32 max-w-52 cursor-default items-center self-stretch px-3 pr-7 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                active
                  ? 'bg-background font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              } ${state.isActive ? 'opacity-70 shadow-sm' : ''}`}
            >
              <span className="min-w-0 flex-1 truncate">{title}</span>
              {closable ? (
                <button
                  type="button"
                  aria-label="Close tab"
                  onClick={() => close(tab.id)}
                  className="absolute right-1 flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/tab:opacity-100 group-focus-within/tab:opacity-100"
                >
                  <X className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                </button>
              ) : null}
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
