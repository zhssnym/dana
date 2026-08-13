/*
The designer's `src/components/page-bar.tsx`, ported at P8R session R3: the
strip at the top of a page carrying that page's name, and 10.6's update
affordance when a new worker is waiting.

**It is a page's own header and never the application's, which AC-174 turns
on.** 9.1 lost its top bar at the owner's ruling of 2026-08-13, and that
criterion asserts the removal as the absence of a banner landmark on every
page. A `header` element maps to `banner` only when it is not inside
`article`, `aside`, `main`, `nav` or `section`, so this one is a landmark or
not depending on where the shell puts it. Measured against the running
prototype on 2026-08-13: his shell renders it inside `main`, which exposes
zero banners, and that placement is a requirement of the shell rather than a
detail of it. R5 owns the shell; this note is the request.

The update control's copy is 10.6's "Update available, reload", unchanged and
exact, and AC-100 admits either a button or a link for it.

**One label removed.** His static page tab carried `aria-label="Open page:
{title}"` on a plain `div` with no role and no handler, which names a control
that does not exist: a screen reader is told the element opens a page and
pressing it does nothing. The visible title is what the element is, so it is
the only thing announced now. Nothing in section 9 names this element.
*/
import type { LucideIcon } from 'lucide-react'
import { RefreshCw } from 'lucide-react'

import { Button } from './ui/button.js'

export function PageBar({
  title,
  icon: Icon,
  iconColor,
  showUpdate = false,
  onUpdate,
}: {
  title: string
  icon?: LucideIcon
  iconColor?: string
  showUpdate?: boolean
  onUpdate?: () => void
}) {
  return (
    <header
      className={showUpdate
        ? 'flex h-[var(--control-height)] shrink-0 items-center border-b border-[var(--color-graphite-200)] bg-[var(--color-graphite-25)]'
        : 'flex h-[var(--shell-pagebar-height)] shrink-0 items-center border-b border-[var(--color-graphite-200)] bg-[var(--color-graphite-25)]'}
    >
      <div
        data-static-page-tab
        className="relative -mt-px -mb-px -ml-px flex min-w-48 max-w-64 self-stretch items-center gap-2 border-x border-t border-[var(--color-graphite-200)] bg-card px-3"
      >
        {Icon ? (
          <Icon
            className="size-3.5 shrink-0"
            style={iconColor ? { color: iconColor } : undefined}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        ) : null}
        <span className="truncate text-xs leading-4 font-medium text-[var(--color-graphite-800)]">
          {title}
        </span>
      </div>
      {showUpdate ? (
        <Button
          variant="ghost"
          className="ml-auto h-[var(--control-height)] px-3 text-sm text-[var(--color-graphite-700)] hover:bg-[var(--color-graphite-100)]"
          // 10.6's non-forcing update: the waiting worker is applied on a
          // click and never without one. His prototype reloads the window
          // directly because it has no worker to activate; the shell passes
          // the registration's own update path here.
          onClick={onUpdate ?? (() => window.location.reload())}
        >
          <RefreshCw
            data-icon="inline-start"
            className="size-4"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          Update available, reload
        </Button>
      ) : null}
    </header>
  )
}
