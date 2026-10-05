// The overflow menu for a Dana object, drawn from `lib/object-acts.ts`. `name` is the
// tooltip, never the trigger's accessible name (spec 9.1's fixed names).
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
  // On the task's own page the tab already shows it; a peek (`?task=`) still offers it.
  if (pathname.startsWith('/app/tasks/')) return null
  const id = new URLSearchParams(search).get('task')
  return id === null || id === '' ? null : paths.task(id)
}

/** The Page or Collection route already rendered beside a Library menu trigger. */
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
  /** For the trigger's tooltip. Never its accessible name. */
  readonly name: string
  readonly handlers: ActHandlers
  readonly trigger?: ReactElement<Record<string, unknown>>
  /** Rendered above the contract's acts, for surface-only items. */
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

  // A Library project row forwards Export to the project's page, whose own menu holds
  // the serializer. That menu consumes it once and clears the param first.
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
