/*
Work has one document and four presentations. Thread is the progressive reading
of that document; Freeform draws its writing without the rail, Board groups
its canonical Tasks, and Calendar projects their schedules.

The default is a device preference, separate from the view someone chooses on
a particular Work. A switch is kept for this session only, per page, so it can
never become document data or make two versions of the Work. A page with no
session choice follows the preferred default. The old `dana.folder-view` key is
retired in `view-mode.ts` and is deliberately not reused here.
*/
import { useCallback, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router'

import { Button } from '../components/ui/button.js'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu.js'
import { CalendarDays, GitCommitVertical, List, SquareKanban } from '../lib/icons.js'
import type { LucideIcon } from '../lib/icons.js'

export type WorkView = 'thread' | 'freeform' | 'board' | 'calendar'

const DEFAULT_KEY = 'dana.work-view-default'
const INITIAL_VIEW: WorkView = 'freeform'
const WORK_VIEWS: readonly WorkView[] = ['thread', 'freeform', 'board', 'calendar']

function isWorkView(value: string | null): value is WorkView {
  return value !== null && (WORK_VIEWS as readonly string[]).includes(value)
}

let cachedDefault: WorkView | null = null
const defaultListeners = new Set<() => void>()
const currentByWork = new Map<string, WorkView>()
const workListeners = new Map<string, Set<() => void>>()

function readDefault(): WorkView {
  if (cachedDefault !== null) return cachedDefault
  let view: WorkView = INITIAL_VIEW
  try {
    const stored = globalThis.localStorage.getItem(DEFAULT_KEY)
    if (isWorkView(stored)) view = stored
  } catch {
    // Storage is optional; the initial view still applies this session.
  }
  cachedDefault = view
  return view
}

function emitWork(workId: string): void {
  for (const listener of workListeners.get(workId) ?? []) listener()
}

export function writeDefaultWorkView(view: WorkView): void {
  cachedDefault = view
  try {
    globalThis.localStorage.setItem(DEFAULT_KEY, view)
  } catch {
    // The preference still applies to this session when storage is unavailable.
  }
  for (const listener of defaultListeners) listener()
  /* Open Works with no deliberate switch follow the new preference. A Work
     already switched keeps that explicit session choice. */
  for (const workId of workListeners.keys()) {
    if (!currentByWork.has(workId)) emitWork(workId)
  }
}

function subscribeDefault(listener: () => void): () => void {
  defaultListeners.add(listener)
  return () => { defaultListeners.delete(listener) }
}

export function useDefaultWorkView(): [WorkView, (view: WorkView) => void] {
  const view = useSyncExternalStore(subscribeDefault, readDefault, () => INITIAL_VIEW)
  return [view, writeDefaultWorkView]
}

export function useWorkView(workId: string): [WorkView, (view: WorkView) => void] {
  const subscribe = useCallback((listener: () => void): (() => void) => {
    let listeners = workListeners.get(workId)
    if (listeners === undefined) {
      listeners = new Set()
      workListeners.set(workId, listeners)
    }
    listeners.add(listener)
    return () => {
      listeners?.delete(listener)
      if (listeners?.size === 0) workListeners.delete(workId)
    }
  }, [workId])
  const snapshot = useCallback(
    (): WorkView => currentByWork.get(workId) ?? readDefault(),
    [workId],
  )
  const view = useSyncExternalStore(subscribe, snapshot, () => INITIAL_VIEW)
  const setView = useCallback((next: WorkView): void => {
    currentByWork.set(workId, next)
    emitWork(workId)
  }, [workId])
  return [view, setView]
}

/** The Work currently on screen. Path is presentation identity only; the
 * choice never enters the page document or server contract. */
export function useCurrentWorkView(): [WorkView, (view: WorkView) => void] {
  const { pathname } = useLocation()
  return useWorkView(pathname)
}

const OPTIONS: readonly {
  readonly value: WorkView
  readonly label: string
  readonly icon: LucideIcon
}[] = [
  { value: 'thread', label: 'Thread', icon: GitCommitVertical },
  { value: 'freeform', label: 'Freeform', icon: List },
  { value: 'board', label: 'Board', icon: SquareKanban },
  { value: 'calendar', label: 'Calendar', icon: CalendarDays },
]

export function WorkViewControl({
  view,
  onChange,
}: {
  readonly view: WorkView
  readonly onChange: (view: WorkView) => void
}): React.JSX.Element {
  const active = OPTIONS.find((option) => option.value === view) ?? OPTIONS[0]!
  const ActiveIcon = active.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={`Work view: ${active.label}`}
            title="Work view"
          />
        }
      >
        <ActiveIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44" aria-label="Work view">
        <DropdownMenuRadioGroup value={view} onValueChange={(value: unknown) => {
          const selected = OPTIONS.find((option) => option.value === value)
          if (selected !== undefined) onChange(selected.value)
        }}>
          {OPTIONS.map((option) => {
            const Icon = option.icon
            return (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
                closeOnClick
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                {option.label}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
