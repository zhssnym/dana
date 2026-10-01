/*
The overflow menu for a Dana object, drawn from the contract.

`lib/object-acts.ts` says what the acts are, in what order, with what words
and what glyph. This draws them and nothing else, so the folder menu in the
Library and the folder menu on that folder's own window bar are now the same
menu, differing only in what each surface hands over.

**A surface may still add items of its own, through `extra`.** The folder's
menu no longer does: its header "…", its Library row "…" and the row's
right-click all draw exactly `lib/object-acts.ts`'s folder list. That escape hatch is deliberate and narrow, taking a
*rendered* node rather than a spec, so an act that belongs to the object
cannot be smuggled in this way and quietly diverge again. Anything belonging
to every surface goes in the contract. AC-246 enumerates the four items that
may come through it and fails a fifth.

**Workspace tabs are a shell act.** A Library row already owns the canonical
link for the Page or Collection beside this trigger, so opening the menu
captures that route and supplies `open-tab` to the object contract. A Task's
menu is shared by its full page and its peeks; its canonical full-page route is
resolved from the current task route/query. No caller has to grow a second
navigation mapping, and an object menu that has no resolvable destination does
not invent one.

**Project export stays page-owned.** The page already owns the one serializer
that writes a Dana work file. A project row in the Library therefore forwards
`Export work` to that project's page instead of growing a second serializer in
the sidebar. The forwarding query exists only long enough for the page's own
project menu to consume it, then is removed before the export handler runs.

**The trigger's name is 9.1's fixed string and never an interpolation.** A name in
9.1's table is a fixed string, and what tells four instances apart is 9.1's region rule, this
one being reached inside the row or the bar that names its object. So `name`
here is not drawn into the label; it is the tooltip's, and the surface's own
region is what separates one menu from the next.
*/
import { useEffect, useRef, useState, type ReactElement, type ReactNode, type SyntheticEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { actsFor } from '../lib/object-acts.js'
import type { ActHandlers, ObjectKind } from '../lib/object-acts.js'
import { MoreHorizontal } from '../lib/icons.js'
import { paths } from '../routes.js'
import { openInNewTab } from '../shell/tabs.js'

import { Button } from './ui/button.js'
import { MORE_ACTIONS } from './ui/copy.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.js'

const OBJECT_MENU_ACTION_PARAM = 'object-action'

function taskDestination(pathname: string, search: string): string | null {
  /* On the task's own page the tab already is that page: no second copy
     of what is on screen (u2). A peek (`?task=`) still offers it. */
  if (pathname.startsWith('/app/tasks/')) return null
  const id = new URLSearchParams(search).get('task')
  return id === null || id === '' ? null : paths.task(id)
}

/** The Page/Collection route already rendered beside a Library menu trigger. */
function libraryDestination(kind: ObjectKind, trigger: HTMLElement): string | null {
  if (kind === 'folder' || kind === 'project') {
    const row = trigger.closest<HTMLElement>('[data-page-row]')
    return row?.querySelector<HTMLAnchorElement>('a[href^="/app/folders/"]')?.getAttribute('href') ?? null
  }
  if (kind === 'shelf') {
    const row = trigger.closest<HTMLElement>('[data-shelf-head]')
    return row?.querySelector<HTMLAnchorElement>('a[href^="/app/shelves/"]')?.getAttribute('href') ?? null
  }
  return null
}

export function ObjectMenu({
  kind,
  name,
  handlers,
  trigger,
  extra,
  align = 'end',
  width = 'w-52',
}: {
  readonly kind: ObjectKind
  /** The object's name, for the trigger's tooltip. Never its accessible name. */
  readonly name: string
  readonly handlers: ActHandlers
  /**
   * The button that opens it, supplied by the surface: a Library row's ghost
   * button and a window bar's strip button are different chrome for one menu.
   */
  readonly trigger?: ReactElement<Record<string, unknown>>
  /** Rendered above the contract's acts: what this surface can do that the
      object cannot do everywhere. */
  readonly extra?: ReactNode
  readonly align?: 'start' | 'end'
  readonly width?: string
}): React.JSX.Element | null {
  const navigate = useNavigate()
  const location = useLocation()
  const [libraryPath, setLibraryPath] = useState<string | null>(null)
  const handledForward = useRef<string | null>(null)
  const destination = kind === 'task' ? taskDestination(location.pathname, location.search) : libraryPath
  const forwardProjectExport =
    kind === 'project' &&
    destination !== null &&
    handlers.export === undefined &&
    handlers['copy-link'] !== undefined
  const supplied: ActHandlers =
    destination === null
      ? handlers
      : {
          ...handlers,
          'open-tab': () => {
            void navigate(openInNewTab(destination))
          },
          ...(forwardProjectExport
            ? {
                export: () => {
                  const join = destination.includes('?') ? '&' : '?'
                  void navigate(`${destination}${join}${OBJECT_MENU_ACTION_PARAM}=export`)
                },
              }
            : {}),
        }

  /* A Library project row has the project's route but deliberately not the
     serializer. Once it forwards here, the destination page's own ObjectMenu
     is the only instance with the real export handler, so it consumes the act
     exactly once and removes the transient address before starting the file. */
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const forwarded = params.get(OBJECT_MENU_ACTION_PARAM)
    if (forwarded === null) {
      handledForward.current = null
      return
    }
    if (forwarded !== 'export' || kind !== 'project' || typeof handlers.export !== 'function') return
    const key = `${location.pathname}${location.search}`
    if (handledForward.current === key) return
    handledForward.current = key
    params.delete(OBJECT_MENU_ACTION_PARAM)
    const search = params.size === 0 ? '' : `?${params.toString()}`
    void navigate(`${location.pathname}${search}`, { replace: true })
    handlers.export()
  }, [handlers.export, kind, location.pathname, location.search, navigate])

  const acts = actsFor(kind, supplied)
  if (acts.length === 0 && extra === undefined) return null

  const rememberDestination = (event: SyntheticEvent<HTMLElement>): void => {
    if (kind === 'task') return
    const path = libraryDestination(kind, event.currentTarget)
    if (path !== libraryPath) setLibraryPath(path)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        onClick={rememberDestination}
        render={
          trigger ?? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={MORE_ACTIONS}
              title={name}
            />
          )
        }
      >
        <MoreHorizontal className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className={width}>
        {extra}
        {acts.map(({ spec, handler, startsGroup }) => (
          <div key={spec.key} className="contents">
            {startsGroup ? <DropdownMenuSeparator /> : null}
            {typeof handler === 'function' ? (
              <DropdownMenuItem
                variant={spec.destructive === true ? 'destructive' : undefined}
                onClick={handler}
              >
                <spec.icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
                {spec.label}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <spec.icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  {spec.label}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-44">
                  {handler.choose}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
