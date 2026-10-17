import { useState } from 'react'

import { ArrowUpRight, BookOpen, CircleHelp, Keyboard } from '../../lib/icons.js'
import { paths } from '../../routes.js'
import { openShortcuts } from '../../shell/overlays.js'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '../ui/popover.js'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip.js'

const EXTERNAL_LINK = 'rounded-md outline-none focus-visible:outline-2 focus-visible:outline-primary'
const ROW = 'flex min-h-8 items-center gap-2.5 px-2 py-1.5 text-sm hover:bg-hover'

export function HelpMenu({ className }: { readonly className: string }): React.JSX.Element {
  const [open, setOpen] = useState(false)

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
        className="w-[min(240px,calc(100vw-24px))] max-h-[min(520px,calc(100dvh-32px))] overflow-y-auto border border-border p-1"
      >
        <PopoverTitle className="flex h-(--row-height) items-center px-2 text-sm font-medium text-foreground">Help</PopoverTitle>
        <a href={paths.help} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}
          className={ROW + ' ' + EXTERNAL_LINK}>
          <BookOpen className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          <span className="min-w-0 flex-1">Help center</span>
          <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </a>
        <button type="button" onClick={() => { setOpen(false); openShortcuts() }}
          className={ROW + ' w-full text-left ' + EXTERNAL_LINK}>
          <Keyboard className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          <span className="min-w-0 flex-1">Keyboard shortcuts</span>
          <kbd className="flex size-4 shrink-0 items-center justify-center font-sans text-sm leading-none text-muted-foreground">?</kbd>
        </button>
      </PopoverContent>
    </Popover>
  )
}
