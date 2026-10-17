import { useState } from 'react'

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

const EXTERNAL_LINK = 'rounded-md outline-none focus-visible:outline-2 focus-visible:outline-primary'

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
        <nav aria-label="Help pages">
          {helpArticles.map((article) => (
            <a key={article.slug} href={paths.helpArticle(article.slug)} target="_blank" rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className={'flex min-h-8 items-center px-2 py-1.5 text-sm hover:bg-hover ' + EXTERNAL_LINK}>
              {article.title}
            </a>
          ))}
        </nav>
      </PopoverContent>
    </Popover>
  )
}
