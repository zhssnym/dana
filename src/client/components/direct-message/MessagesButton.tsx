import { useState } from 'react'

import { MessageCircle } from '../../lib/icons.js'
import { PersonFace } from '../person-face.js'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '../ui/popover.js'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip.js'
import { useDirectMessageCenter } from './DirectMessageCenter.js'

export function MessagesButton({ className }: { readonly className: string }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const center = useDirectMessageCenter()
  return <Popover open={open} onOpenChange={setOpen}>
    <Tooltip>
      <PopoverTrigger render={<TooltipTrigger render={<button type="button" className={`relative ${className}`}
        aria-label={center.unread > 0 ? `Messages, ${center.unread} unread` : 'Messages'} />} />}>
        <MessageCircle strokeWidth={1.75} aria-hidden="true" />
        {center.unread > 0 ? <span aria-hidden="true"
          className="absolute top-[var(--direct-message-dot-offset)] right-[var(--direct-message-dot-offset)] size-[var(--direct-message-dot)] rounded-full bg-primary ring-2 ring-sidebar" /> : null}
      </PopoverTrigger>
      <TooltipContent side="top">Messages</TooltipContent>
    </Tooltip>
    <PopoverContent side="top" align="start" className="w-[var(--direct-message-inbox-width)] max-w-[var(--direct-message-max-width)] p-[var(--space-inline)]">
      <PopoverTitle className="px-[var(--space-inline)] py-[var(--space-inline)]">Messages</PopoverTitle>
      {center.conversations.length === 0 ? <p className="px-[var(--space-inline)] py-[var(--person-card-padding)] text-sm text-muted-foreground">
        Private messages with Team members appear here.
      </p> : <div className="max-h-[var(--direct-message-inbox-height)] overflow-y-auto">
        {center.conversations.map((row) => <button key={row.id} type="button"
          className="flex w-full items-center gap-[var(--person-card-padding)] rounded-md px-[var(--space-inline)] py-[var(--space-inline)] text-left hover:bg-accent"
          onClick={() => {
            center.open({ conversationId: row.id, memberId: row.member_id, memberName: row.member_name, memberImage: row.member_image })
            setOpen(false)
          }}>
          <PersonFace id={row.member_id} name={row.member_name} image={row.member_image} className="size-[var(--row-height)] data-[size=sm]:size-[var(--row-height)]" />
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-sm text-foreground ${row.unread > 0 ? 'font-section' : ''}`}>{row.member_name}</span>
            <span className="block truncate text-xs text-muted-foreground">{row.latest_body}</span>
          </span>
          {row.unread > 0 ? <span className="rounded-full bg-primary px-[var(--space-inline)] text-xs text-primary-foreground" aria-label={`${row.unread} unread`}>{row.unread}</span> : null}
        </button>)}
      </div>}
    </PopoverContent>
  </Popover>
}
