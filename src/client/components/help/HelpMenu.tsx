import { useEffect, useState } from 'react'
import { z } from 'zod'

import { getPlain } from '../../api/http.js'
import { CircleHelp } from '../../lib/icons.js'
import { helpArticles } from '../../help/content.js'
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
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(value)
}

const EXTERNAL_LINK = 'rounded-md outline-none focus-visible:outline-2 focus-visible:outline-primary'

export function HelpMenu({ className }: { readonly className: string }): React.JSX.Element {
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
        className="w-[min(240px,calc(100vw-24px))] max-h-[min(520px,calc(100dvh-32px))] overflow-y-auto border border-border p-0"
      >
        <PopoverTitle className="sr-only">Help</PopoverTitle>
        <nav aria-label="Help pages" className="p-1">
          {helpArticles.map((article) => (
            <a key={article.slug} href={paths.helpArticle(article.slug)} target="_blank" rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className={'flex min-h-8 items-center px-2.5 py-1.5 text-sm hover:bg-hover ' + EXTERNAL_LINK}>
              {article.title}
            </a>
          ))}
        </nav>
        <p className="border-t border-border px-3.5 py-2 text-xs tabular-nums text-muted-foreground">
          Build {runningCommit ? runningCommit.slice(0, 8) : checkedBuild ? 'unavailable' : '…'} · {buildTime()}
        </p>
      </PopoverContent>
    </Popover>
  )
}
