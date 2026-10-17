import { useEffect, useState } from 'react'
import { z } from 'zod'

import { getPlain } from '../../api/http.js'
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CircleHelp,
  Info,
  Megaphone,
} from '../../lib/icons.js'
import { paths } from '../../routes.js'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '../ui/popover.js'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip.js'

declare const __DANA_BUILD_TIME__: string

const buildResponse = z.object({ commit: z.string().regex(/^[a-f0-9]{40}$/) })

function buildTime(): string {
  const value = new Date(__DANA_BUILD_TIME__)
  if (!Number.isFinite(value.getTime())) return 'Unavailable'
  return new Intl.DateTimeFormat('en', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(value)
}

const EXTERNAL_LINK = 'rounded-md outline-none focus-visible:outline-2 focus-visible:outline-primary'

export function HelpMenu({
  className,
  onFeedback,
}: {
  readonly className: string
  readonly onFeedback: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [runningCommit, setRunningCommit] = useState<string | null>(null)
  const [checkedBuild, setCheckedBuild] = useState(false)

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
            aria-label="Help"
            className={'relative ' + className}
          />
        } />}>
          <CircleHelp strokeWidth={1.75} aria-hidden="true" />
        </PopoverTrigger>
        <TooltipContent side="top">Help</TooltipContent>
      </Tooltip>
      <PopoverContent side="top" align="end" sideOffset={8}
        className="w-[min(344px,calc(100vw-24px))] max-h-[min(520px,calc(100dvh-32px))] overflow-y-auto border border-border p-0"
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <img src="/dana-mark.svg" alt="" className="size-6 shrink-0" />
          <PopoverTitle className="font-title text-sm">Help</PopoverTitle>
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
