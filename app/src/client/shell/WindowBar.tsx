/*
The window bar of 9.1: a thin strip under the tabs, belonging to the window
rather than to the page.

Imran's direction of 2026-08-18 (DES-139) is what it is built from, and the
sentence that decides its shape is that controls belonging to *the thing this
tab is showing* are chrome, and chrome does not live inside the scroll area.
The folder page's own docking strip is what this replaces: it needed a
sentinel and a scroll listener, and it repeated the folder's name that the tab
two centimetres away already said.

**The page's title is not repeated here** (9.1, in terms). The tab says it.

**The left end holds the active filter's removable chips**, which arrived
with S10 and fill the slot S9 reserved. DES-139 recorded why it was reserved
rather than absent: a breadcrumb of one item is not a breadcrumb, and
inventing a hierarchy Dana does not have would be worse than a gap. It is a
portal target now, on the same store as the right end, so a place-page's chips
and that page's filter control are one screen's subtree rendered at two ends
of the bar.

**The right end is a portal target**, which is `window-bar.ts`. Screens render
their own controls into it through `WindowBarActions` and keep their own
state; the shell never learns what a screen's controls are. The view strip and
the filter control arrive that way with S10; the object's overflow menu with
the packages that own it.

**Activity is this file's own**, because it belongs to the window rather than
to any screen: it reads the recent events of the thing the tab is showing
(4.13, through 7.12), and every tab has a thing. It is a line of text rather
than a control with a glyph, which is DES-139's "the controls got quieter"
applied to the one thing in the bar that is not a control.
*/
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import { useSubjectEvents } from '../api/queries.js'
import { formatAgo } from '../parts/format-dates.js'

import { Button } from '../components/ui/button.js'
import { RefreshCw } from '../lib/icons.js'

import { setWindowBarSlot, useWindowBarSlot } from './window-bar.js'
import type { WindowBarSlot } from './window-bar.js'

/**
 * A screen's controls, rendered into the window bar.
 *
 * Mounted anywhere inside a screen; React keeps the subtree in the screen's
 * own tree, so state and context work exactly as if it were rendered in
 * place, and only the placement is the shell's. Renders nothing at all before
 * the bar has mounted, which is every render on the first paint.
 */
export function WindowBarActions({
  children,
  slot = 'controls',
}: {
  readonly children: React.ReactNode
  /** 9.1's two ends: the chips at the left, the tab's controls at the right. */
  readonly slot?: WindowBarSlot
}): React.JSX.Element | null {
  const target = useWindowBarSlot(slot)
  if (target === null) return null
  return createPortal(children, target)
}

/**
 * What the window bar is looking at, derived from the path rather than passed
 * down, because the bar belongs to the window and the window's subject is
 * wherever it is pointed.
 *
 * Only a folder and a task have events worth a line; a place page is a view
 * over other people's things and has no history of its own, which is why the
 * Activity line is absent there rather than empty.
 */
function subjectOf(pathname: string): string | null {
  const folder = /^\/app\/folders\/([0-9a-f-]{36})$/.exec(pathname)
  if (folder !== null) return `folder:${folder[1]}`
  const task = /^\/app\/tasks\/([0-9a-f-]{36})$/.exec(pathname)
  if (task !== null) return `task:${task[1]}`
  return null
}

/** 4.13's verbs in the past tense a person reads, for the Activity line. */
const VERB_TEXT: Record<string, string> = {
  created: 'Created',
  renamed: 'Renamed',
  edited: 'Edited',
  moved: 'Moved',
  completed: 'Completed',
  reopened: 'Reopened',
  abandoned: 'Abandoned',
  restored: 'Restored',
  duplicated: 'Duplicated',
  removed: 'Removed',
  deleted: 'Deleted',
  left: 'Left',
}

function ActivityLine({ subject }: { readonly subject: string }): React.JSX.Element | null {
  const events = useSubjectEvents(subject)
  const latest = events.data?.events[0]
  if (latest === undefined) return null
  const verb = VERB_TEXT[latest.verb] ?? latest.verb
  return (
    <span className="truncate text-xs text-muted-foreground">
      {/* 9.1's "{verb} {ago}", elapsed time rather than a calendar day; the
          reason the distinction matters is in `formatAgo`'s own header. */}
      {verb} {formatAgo(latest.created_at, Date.now())}
    </span>
  )
}

/**
 * 10.6's update copy, transcribed. It moved here from the page bar with
 * the bar itself: 9.1 says the page's title is not repeated in the window
 * bar and the tab already says it, so the strip that carried both is gone
 * and the one thing on it that was not the title comes across. AC-100
 * addresses the control by this name wherever it renders.
 */
const UPDATE_AVAILABLE = 'Update available, reload'

export function WindowBar({
  pathname,
  showUpdate = false,
  onUpdate,
}: {
  readonly pathname: string
  readonly showUpdate?: boolean
  readonly onUpdate?: () => void
}): React.JSX.Element {
  const chips = useRef<HTMLDivElement>(null)
  const controls = useRef<HTMLDivElement>(null)
  useEffect(() => {
    setWindowBarSlot('chips', chips.current)
    setWindowBarSlot('controls', controls.current)
    return () => {
      setWindowBarSlot('chips', null)
      setWindowBarSlot('controls', null)
    }
  }, [])

  const subject = subjectOf(pathname)

  return (
    <div
      // Not a `header`: a header element outside `article`, `aside`, `main`,
      // `nav` or `section` maps to the banner landmark, and AC-174 asserts
      // the absence of a banner on every page. The shell renders this inside
      // `main`, so it would be content rather than a banner either way, and
      // a plain element says what it is with less to get wrong.
      className="flex min-h-[var(--shell-windowbar-height)] shrink-0 items-center gap-3 px-4"
    >
      {/* 9.1's left end: the active filter's removable chips, portalled in by
          whichever place-page is showing. */}
      <div ref={chips} className="flex min-w-0 flex-1 items-center gap-1.5" />
      {subject === null ? null : <ActivityLine subject={subject} />}
      {showUpdate ? (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-[var(--color-graphite-700)]"
          // 10.6's non-forcing update: the waiting worker is applied on a
          // click and never without one.
          onClick={onUpdate ?? (() => globalThis.location.reload())}
        >
          <RefreshCw className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          {UPDATE_AVAILABLE}
        </Button>
      ) : null}
      <div ref={controls} className="flex shrink-0 items-center gap-1" />
    </div>
  )
}
