import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

import { usePatchBundle } from '../../api/mutations.js'
import { useBundle } from '../../api/queries.js'
import { getPlain, readPublicUpdatesFeed } from '../../api/http.js'
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CircleHelp,
  Info,
  Megaphone,
} from '../../lib/icons.js'
import { paths } from '../../routes.js'
import { productUpdates } from '../../updates/index.js'
import type { ProductUpdate } from '../../updates/index.js'
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
const updatesResponse = z.object({
  version: z.literal(1),
  entries: z.array(z.object({
    id: z.string().regex(/^pr-[1-9]\d*$/),
    publishedAt: z.iso.date(),
    historical: z.boolean(),
    kind: z.enum(['feature', 'improvement', 'fix']),
    title: z.string(),
    summary: z.string(),
    pr: z.number().int().positive(),
    commit: z.string().regex(/^[a-f0-9]{40}$/),
  })),
})

/** The public, deployed feed is fresher than an already-open PWA's bundled copy. */
async function recentPublishedUpdates(): Promise<ProductUpdate[] | null> {
  const response = updatesResponse.safeParse(await readPublicUpdatesFeed())
  return response.success ? response.data.entries : null
}

function buildTime(): string {
  const value = new Date(__DANA_BUILD_TIME__)
  if (!Number.isFinite(value.getTime())) return 'Unavailable'
  return new Intl.DateTimeFormat('en', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(value)
}

const EXTERNAL_LINK = 'rounded-md outline-none focus-visible:outline-2 focus-visible:outline-primary'

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
  const publicFeed = useQuery({
    queryKey: ['updates', 'published-feed'],
    queryFn: recentPublishedUpdates,
    staleTime: 0,
    refetchOnWindowFocus: 'always',
    refetchInterval: 60_000,
  })

  const entries: readonly ProductUpdate[] = publicFeed.data ?? productUpdates
  const recent = entries.slice(0, 3)
  const unreadIds = bundle.data === undefined
    ? []
    : unreadUpdateIds(entries, bundle.data.updates_seen_ids)
  const unread = unreadIds.length

  // Opening the release list acknowledges all published announcements, not old
  // backfill. Server-side union preserves acknowledgements made on other devices.
  useEffect(() => {
    if (!open || unreadIds.length === 0) return
    const unattempted = unreadIds.filter((id) => !attempted.current.has(id)).slice(0, 100)
    if (unattempted.length === 0) return
    for (const id of unattempted) attempted.current.add(id)
    patchBundle.mutate(
      { updates_seen_ids: unattempted },
      { onError: () => {
        for (const id of unattempted) attempted.current.delete(id)
      } },
    )
  }, [open, unreadIds.join(',')])

  useEffect(() => {
    if (!open) return
    let active = true
    setCheckedBuild(false)
    void getPlain(buildResponse, '/build')
      .then(({ commit }) => { if (active) setRunningCommit(commit) })
      .catch(() => { if (active) setRunningCommit(null) })
      .finally(() => { if (active) setCheckedBuild(true) })
    return () => { active = false }
  }, [open])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <PopoverTrigger render={<TooltipTrigger render={
          <button
            type="button"
            aria-label={unread > 0 ? 'Help & Updates, ' + unread + ' new updates' : 'Help & Updates'}
            className={'relative ' + className}
          />
        } />}>
          <CircleHelp strokeWidth={1.75} aria-hidden="true" />
          {unread > 0 ? (
            <span aria-hidden="true"
              className="absolute top-[var(--direct-message-dot-offset)] right-[var(--direct-message-dot-offset)] size-[var(--direct-message-dot)] rounded-full bg-primary ring-2 ring-sidebar"
            />
          ) : null}
        </PopoverTrigger>
        <TooltipContent side="top">Help & Updates</TooltipContent>
      </Tooltip>
      <PopoverContent side="top" align="end" sideOffset={8}
        className="w-[min(344px,calc(100vw-24px))] max-h-[min(520px,calc(100dvh-32px))] overflow-y-auto border border-border p-0"
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <img src="/dana-mark.svg" alt="" className="size-6 shrink-0" />
          <PopoverTitle className="font-title text-sm">Help & Updates</PopoverTitle>
        </div>

        <div className="border-t border-border px-2 py-2">
          <a href={paths.help} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}
            className={'flex min-h-9 items-center gap-3 px-3 py-2 text-sm hover:bg-hover ' + EXTERNAL_LINK}>
            <BookOpen className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
            <span className="min-w-0 flex-1">Help Center</span>
            <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </a>
          <button type="button" onClick={() => { setOpen(false); onFeedback() }}
            className="flex min-h-9 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-hover focus-visible:outline-2 focus-visible:outline-primary">
            <Megaphone className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
            <span className="min-w-0 flex-1">Send feedback</span>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </div>

        <section className="border-t border-border px-4 py-3" aria-labelledby="footer-whats-new">
          <div className="flex items-center justify-between gap-2">
            <h3 id="footer-whats-new" className="font-section text-sm">What&apos;s New</h3>
            {unread > 0 ? (
              <span className="text-xs tabular-nums text-muted-foreground">{unread} new</span>
            ) : null}
          </div>
          <div className="mt-2 space-y-0.5">
            {recent.map((entry) => (
              <a key={entry.id} href={paths.updateArticle(entry.id)} target="_blank"
                rel="noopener noreferrer" onClick={() => setOpen(false)}
                className={'group flex min-h-9 items-center justify-between gap-3 px-2 py-2 hover:bg-hover ' + EXTERNAL_LINK}>
                <span className="min-w-0 text-xs leading-5 text-foreground group-hover:text-primary">{entry.title}</span>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </a>
            ))}
          </div>
          <a href={paths.updates} target="_blank" rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className={'mt-2 inline-flex items-center gap-2 text-xs font-section text-primary hover:underline ' + EXTERNAL_LINK}>
            View all updates <ArrowUpRight className="size-4" aria-hidden="true" />
          </a>
        </section>

        <section className="border-t border-border px-4 py-3" aria-label="About this build">
          <h3 className="flex items-center gap-2 text-xs font-section">
            <Info className="size-4 text-muted-foreground" strokeWidth={1.6} aria-hidden="true" />
            About this build
          </h3>
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
            <dt className="text-muted-foreground">Version (build)</dt>
            <dd className="text-right font-mono tabular-nums">
              {runningCommit ? runningCommit.slice(0, 8) : checkedBuild ? 'Unavailable' : 'Checking…'}
            </dd>
            <dt className="text-muted-foreground">Client built</dt>
            <dd className="text-right">{buildTime()}</dd>
          </dl>
        </section>
      </PopoverContent>
    </Popover>
  )
}
