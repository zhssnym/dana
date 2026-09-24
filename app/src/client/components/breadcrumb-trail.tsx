/*
The top bar's "where am I": history arrows, then the path, Notion's way.

- `HistoryArrows` are the browser's own back and forward, drawn as two quiet
  buttons, each disabled when there is nowhere to go. Back is judged by React
  Router's own `history.state.idx`, so it never offers a way out of Dana to the
  page before it; forward asks the Navigation API where the browser has one,
  and otherwise remembers the furthest entry this tab has pushed.
- `BreadcrumbTrail({ folderId, current })` draws `Page / Sub / Current`.
  `folderId` is the page whose ancestors lead the trail; it is a link like its
  ancestors when `current` names something inside it (a task), and the last,
  unlinked crumb when `current` is omitted. The server has already cut the walk
  at the first ancestor this viewer may not read, so nothing is filtered here.
  A long trail keeps its ends: the root, then "…" (a menu of the folded
  levels), then the last two. A phone keeps only the last two.

It has no chrome of its own, so the task peek can reuse it in its header.
*/
import { useSyncExternalStore } from 'react'
import { Link, useLocation, useNavigate, useNavigationType } from 'react-router'

import { useFolder } from '../api/queries.js'
import { ArrowLeft, ArrowRight } from '../lib/icons.js'
import { paths } from '../routes.js'
import { Button } from './ui/button.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.js'
import { cn } from './ui/utils.js'

interface Crumb {
  readonly id: string | null
  readonly name: string
}

/* The furthest history entry this tab has reached, for browsers without the
   Navigation API. A push truncates the forward stack; a pop never does. */
let furthest = 0

function historyIndex(): number {
  const state: unknown = window.history.state
  if (typeof state === 'object' && state !== null && 'idx' in state) {
    const idx = (state as { idx: unknown }).idx
    if (typeof idx === 'number') return idx
  }
  return 0
}

interface NavigationLike {
  readonly canGoForward?: boolean
  addEventListener?: (type: string, listener: () => void) => void
  removeEventListener?: (type: string, listener: () => void) => void
}

function navigationApi(): NavigationLike | undefined {
  return (globalThis as { navigation?: NavigationLike }).navigation
}

/* Re-read after every settled navigation, including ones React Router did not
   make (a hash change), which is what the Navigation API's event is for. */
function subscribeNavigation(notify: () => void): () => void {
  const api = navigationApi()
  api?.addEventListener?.('navigatesuccess', notify)
  return () => api?.removeEventListener?.('navigatesuccess', notify)
}

export function HistoryArrows(): React.JSX.Element {
  const location = useLocation()
  const type = useNavigationType()
  const navigate = useNavigate()
  /* Read during render: the router commits its location after the entry is
     written, so `idx` is already this entry's. `location.key` is the render's
     dependency; the store only adds the forward flag's own changes. */
  void location.key
  const idx = historyIndex()
  furthest = type === 'PUSH' ? idx : Math.max(furthest, idx)
  const apiForward = useSyncExternalStore(
    subscribeNavigation,
    () => navigationApi()?.canGoForward,
    () => undefined,
  )
  const canBack = idx > 0
  const canForward = apiForward ?? idx < furthest

  return (
    <div className="flex shrink-0 items-center gap-0.5 max-md:hidden">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-foreground disabled:opacity-40"
        aria-label="Go back"
        title="Go back"
        disabled={!canBack}
        onClick={() => {
          void navigate(-1)
        }}
      >
        <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-foreground disabled:opacity-40"
        aria-label="Go forward"
        title="Go forward"
        disabled={!canForward}
        onClick={() => {
          void navigate(1)
        }}
      >
        <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </Button>
    </div>
  )
}

const CRUMB =
  'flex h-7 min-w-0 max-w-48 items-center truncate rounded-md px-1.5 transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] outline-none focus-visible:ring-2 focus-visible:ring-ring/30'

function Separator({ phoneHidden }: { readonly phoneHidden: boolean }): React.JSX.Element {
  return (
    <span aria-hidden="true" className={cn('shrink-0 text-quiet-foreground', phoneHidden && 'max-md:hidden')}>
      /
    </span>
  )
}

export function BreadcrumbTrail({
  folderId,
  current,
  className,
}: {
  readonly folderId: string | null
  readonly current?: string | null
  readonly className?: string
}): React.JSX.Element | null {
  const folder = useFolder(folderId ?? '', folderId !== null)
  const detail = folderId === null ? undefined : folder.data

  const crumbs: Crumb[] = []
  if (detail !== undefined) {
    for (const ancestor of detail.ancestors ?? []) crumbs.push({ id: ancestor.id, name: ancestor.name })
    crumbs.push({ id: detail.id, name: detail.name })
  }
  const hasCurrent = current !== undefined && current !== null
  if (hasCurrent) crumbs.push({ id: null, name: current })
  /* Waiting for the page's own name: draw nothing rather than a half trail. */
  if (folderId !== null && detail === undefined) return null
  if (crumbs.length === 0) return null

  const last = crumbs.length - 1
  /* The root, the fold, then the last two. */
  const folded = crumbs.length > 3 ? crumbs.slice(1, crumbs.length - 2) : []
  const shown: (Crumb | 'fold')[] =
    folded.length === 0 ? crumbs : [crumbs[0] as Crumb, 'fold', ...crumbs.slice(crumbs.length - 2)]

  return (
    <nav aria-label="Breadcrumb" className={cn('min-w-0 text-sm', className)}>
      <ol className="flex min-w-0 items-center gap-0.5">
        {shown.map((crumb, index) => {
          const position = crumb === 'fold' ? -1 : crumbs.indexOf(crumb)
          /* A phone keeps the last two: the parent and where you are. */
          const phoneHidden = crumb === 'fold' || position < last - 1
          return (
            <li
              key={crumb === 'fold' ? 'fold' : `${crumb.id ?? 'current'}-${String(position)}`}
              className={cn('flex min-w-0 items-center gap-0.5', phoneHidden && 'max-md:hidden')}
            >
              {/* The first crumb a phone shows has nothing before it. */}
              {index > 0 ? <Separator phoneHidden={position === last - 1} /> : null}
              {crumb === 'fold' ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        aria-label="Show the hidden pages"
                        className={cn(CRUMB, 'text-muted-foreground hover:bg-accent hover:text-foreground')}
                      />
                    }
                  >
                    …
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    {folded.map((hidden) => (
                      <DropdownMenuItem key={hidden.id ?? hidden.name} render={<Link to={paths.folder(hidden.id ?? '')} />}>
                        <span className="truncate">{hidden.name}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : position === last ? (
                <span aria-current="page" className={cn(CRUMB, 'text-foreground')} title={crumb.name}>
                  <span className="truncate">{crumb.name || 'Untitled'}</span>
                </span>
              ) : (
                <Link
                  to={paths.folder(crumb.id ?? '')}
                  title={crumb.name}
                  className={cn(CRUMB, 'text-muted-foreground hover:bg-accent hover:text-foreground')}
                >
                  <span className="truncate">{crumb.name || 'Untitled'}</span>
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
