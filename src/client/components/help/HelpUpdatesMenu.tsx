import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { z } from 'zod'

import { usePatchBundle } from '../../api/mutations.js'
import { useBundle } from '../../api/queries.js'
import { getPlain } from '../../api/http.js'
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CircleHelp,
  FileText,
  Info,
  Megaphone,
} from '../../lib/icons.js'
import { paths } from '../../routes.js'
import { productUpdates, formatUpdateDay } from '../../updates/index.js'
import { unreadUpdateIds } from '../../updates/read-state.js'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '../ui/popover.js'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip.js'

declare const __DANA_BUILD_TIME__: string

const buildResponse = z.object({ commit: z.string().regex(/^[a-f0-9]{40}$/) })
const announcedUpdates = productUpdates.filter((item) => !item.historical)
const recentUpdates = announcedUpdates.slice(0, 3)

function buildTime(): string {
  const value = new Date(__DANA_BUILD_TIME__)
  if (!Number.isFinite(value.getTime())) return 'Unavailable'
  return new Intl.DateTimeFormat('en', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(value)
}

export function HelpUpdatesMenu({
  className,
  onFeedback,
}: {
  readonly className: string
  readonly onFeedback: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [runningCommit, setRunningCommit] = useState<string | null>(null)
  const [checkedBuild, setCheckedBuild] = useState(false)
  const attempted = useRef(new Set<string>())
  const bundle = useBundle()
  const patchBundle = usePatchBundle()
  const unreadIds = bundle.data === undefined
    ? []
    : unreadUpdateIds(announcedUpdates, bundle.data.updates_seen_ids)
  const unread = unreadIds.length

  // The full announcement list has been opened, not merely deployed. Acknowledge
  // exactly these IDs; the server unions them with state from other devices.
  useEffect(() => {
    if (!open || unreadIds.length === 0) return
    const unattempted = unreadIds.filter((id) => !attempted.current.has(id)).slice(0, 100)
    if (unattempted.length === 0) return
    for (const id of unattempted) attempted.current.add(id)
    patchBundle.mutate(
      { updates_seen_ids: unattempted },
      {
        onError: () => {
          for (const id of unattempted) attempted.current.delete(id)
        },
      },
    )
  }, [open, unreadIds.join(',')])

  useEffect(() => {
    if (!open) return
    let active = true
    void getPlain(buildResponse, '/build')
      .then(({ commit }) => {
        if (active) setRunningCommit(commit)
      })
      .catch(() => {
        if (active) setRunningCommit(null)
      })
      .finally(() => {
        if (active) setCheckedBuild(true)
      })
    return () => { active = false }
  }, [open])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <PopoverTrigger render={<TooltipTrigger render={
          <button
            type="button"
            aria-label={unread > 0 ? 'Help & Updates, new updates' : 'Help & Updates'}
            className={'relative ' + className}
          />
        } />}>
          <CircleHelp strokeWidth={1.75} aria-hidden="true" />
          {unread > 0 ? (
            <span
              aria-hidden="true"
              className="absolute top-[var(--direct-message-dot-offset)] right-[var(--direct-message-dot-offset)] size-[var(--direct-message-dot)] rounded-full bg-primary ring-2 ring-sidebar"
            />
          ) : null}
        </PopoverTrigger>
        <TooltipContent side="top">Help & Updates</TooltipContent>
      </Tooltip>

      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-[min(344px,calc(100vw-24px))] max-h-[min(540px,calc(100dvh-32px))] overflow-y-auto border border-border p-0"
      >
        <PopoverTitle className="border-b border-border px-4 py-3 font-title text-sm">Help & Updates</PopoverTitle>
        <div className="p-2">
          <Link
            to={paths.help}
            onClick={() => setOpen(false)}
            className="flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-hover focus-visible:outline-2 focus-visible:outline-primary"
          >
            <BookOpen className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
            <span className="min-w-0 flex-1">Documentation</span>
            <ArrowUpRight className="size-4 text-muted-foreground" aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={() => { setOpen(false); onFeedback() }}
            className="flex min-h-10 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-hover focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Megaphone className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
            <span className="min-w-0 flex-1">Send feedback</span>
            <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
          </button>
        </div>

        <section className="border-t border-border px-4 py-4" aria-label="What's new">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-section text-sm">What&apos;s new</h3>
            {unread > 0 ? (
              <span className="text-xs text-muted-foreground">{unread} new</span>
            ) : null}
          </div>
          {recentUpdates.length === 0 ? (
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              New releases will appear here.
            </p>
          ) : (
            <div className="mt-2 space-y-0.5">
              {recentUpdates.map((entry) => (
                <Link
                  key={entry.id}
                  to={paths.updateArticle(entry.id)}
                  onClick={() => setOpen(false)}
                  className="group flex items-start gap-2 rounded-md px-1 py-2 hover:bg-hover focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.6} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-section text-foreground group-hover:text-primary">{entry.title}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{formatUpdateDay(entry.publishedAt)}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
          <Link
            to={paths.updates}
            onClick={() => setOpen(false)}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-section text-primary hover:underline"
          >
            View all updates <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </section>

        <section className="border-t border-border px-4 py-4" aria-label="About this build">
          <div className="flex items-center gap-2 text-xs font-section">
            <Info className="size-4 text-muted-foreground" strokeWidth={1.6} aria-hidden="true" />
            About this build
          </div>
          <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 text-xs">
            <dt className="text-muted-foreground">Running code</dt>
            <dd className="font-mono tabular-nums">{runningCommit ? runningCommit.slice(0, 8) : checkedBuild ? 'Unavailable' : 'Checking…'}</dd>
            <dt className="text-muted-foreground">Client built</dt>
            <dd className="text-right">{buildTime()}</dd>
            <dt className="text-muted-foreground">Deployment time</dt>
            <dd className="text-muted-foreground">Not provided</dd>
          </dl>
        </section>
      </PopoverContent>
    </Popover>
  )
}
