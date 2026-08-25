/*
The notifications bell of 9.12, ported at S12 from the designer's
`notifications-bell.tsx` (DES-226).

His composition and his class strings, on real rows. The differences from
his file are the ones every port in this client records rather than hides:

**The name is the badge said aloud.** 9.1's names table fixes the bell at
"Notifications", suffixed ", N unread" while any are, and AC-218 reads the
count out of the accessible name rather than off the visual badge, which is
the point of putting it there: the badge is aria-hidden and the name is the
record.

**The sentence is the event's own.** His fixtures carried a hand-written
sentence per row; the wire carries 4.13's verb and, where the chokepoint
recorded one, a human phrase in `detail` ("assigned to Imran"). The row
renders the actor emphasised, the act, the thing's name, and `formatAgo`'s
elapsed time, which is 9.12's anatomy on the columns 7.12 actually answers.

**Actors resolve through the roster already in the cache.** An actor who can
reach the viewer's notifications shares a folder with them, so the
connections read the People screen and the sharing panel already use carries
their name; a face this client cannot resolve says "Someone" rather than
leaking an id. The map is by id, never by name (11.15's v2 hazard).

**A row is a pointer, not a task** (9.12): pressing it marks that row read
and navigates to the subject's address, a task at /app/tasks/:id, a folder
or a shelf at its page, a comment at the folder that holds its thread. No
per-row actions, no hand deletion; "Mark all read" is the surface's only
other verb and renders only while something is unread.

**Unread is told by tone and a dot, never by hue** — DES-143's rule
generalized, his classes carried whole, the badge on `bg-foreground
text-background` because roles invert with the theme and values went
white-on-white in his own first gate run.

D3's liveness: the list refetches on focus like every read, and polls only
while the popover is open (`useNotifications(open)`), which is the polite
poll the pricing session bought and nothing more.
*/
import { useState } from 'react'
import { useNavigate } from 'react-router'

import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from '../api/mutations.js'
import { useConnections, useMe, useNotifications } from '../api/queries.js'
import { Button } from '../components/ui/button.js'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../components/ui/popover.js'
import { Bell } from '../lib/icons.js'
import { formatAgo } from '../parts/format-dates.js'
import { cn } from '../components/ui/utils.js'
import type { NotificationLine } from '../../shared/events.js'
import { paths } from '../routes.js'

/** 9.1's names table: the fixed string, and the suffix while any are unread. */
function bellName(unread: number): string {
  return unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'
}

/** 4.13's verbs as the lowercase act a sentence reads. */
const VERB_SENTENCE: Record<string, string> = {
  created: 'created',
  renamed: 'renamed',
  edited: 'edited',
  moved: 'moved',
  completed: 'completed',
  reopened: 'reopened',
  abandoned: 'abandoned',
  restored: 'restored',
  duplicated: 'duplicated',
  removed: 'removed',
  deleted: 'deleted',
  left: 'left',
}

/**
 * The subject's address (9.12): a task in the viewer's preferred surface via
 * /app/tasks/:id, a folder or shelf at its page, a comment at the folder
 * whose thread holds it. A comment with no folder cannot happen (4.15 scopes
 * every comment), but a fallback to Desk beats a dead control.
 */
function subjectPath(event: NotificationLine['event']): string {
  switch (event.subject_kind) {
    case 'task':
      return paths.task(event.subject_id)
    case 'folder':
      return paths.folder(event.subject_id)
    case 'shelf':
      return paths.shelf(event.subject_id)
    case 'comment':
      return event.folder_id === null ? paths.desk : paths.folder(event.folder_id)
  }
}

export function NotificationsBell(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const notifications = useNotifications(open)
  const connections = useConnections()
  const me = useMe()
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()

  const rows = notifications.data?.notifications ?? []
  const unread = rows.filter((row) => row.read_at === null).length

  const names = new Map<string, string>()
  for (const connection of connections.data ?? []) {
    const name = connection.user.display_name
    if (name !== null) names.set(connection.user.id, name)
  }
  const myName = me.data?.user.display_name
  if (me.data !== undefined && myName !== null && myName !== undefined) {
    names.set(me.data.user.id, myName)
  }

  function openRow(row: NotificationLine): void {
    if (row.read_at === null) markRead.mutate(row.id)
    setOpen(false)
    navigate(subjectPath(row.event))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            className="relative size-[var(--shell-sidebar-item-height)] text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-900)] group-data-[collapsible=icon]:order-2 group-data-[collapsible=icon]:size-[var(--shell-sidebar-row-height)]"
            aria-label={bellName(unread)}
          />
        }
      >
        <Bell className="!size-4" strokeWidth={1.75} aria-hidden="true" />
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-foreground px-0.5 text-[9px] leading-none font-semibold text-background"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="start" side="right" className="w-[360px] p-1.5">
        <div className="flex items-center justify-between px-2 pt-1 pb-1.5">
          <p className="text-[12px] leading-4 font-medium text-[var(--color-graphite-500)]">
            Notifications
          </p>
          {unread > 0 ? (
            <button
              type="button"
              onClick={() => {
                markAllRead.mutate()
              }}
              className="rounded-md px-1.5 py-0.5 text-[12px] leading-4 text-[var(--color-graphite-500)] transition-colors outline-none hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)] focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)]"
            >
              Mark all read
            </button>
          ) : null}
        </div>
        {rows.length === 0 ? (
          /* 9.12's empty state, word for word. */
          <p className="px-2 py-6 text-center text-[13px] leading-5 text-[var(--color-graphite-500)]">
            Nothing new. When someone assigns you a task or answers you, it
            lands here.
          </p>
        ) : (
          rows.map((row) => {
            const read = row.read_at !== null
            const actor = names.get(row.event.actor_id) ?? 'Someone'
            const act = VERB_SENTENCE[row.event.verb] ?? row.event.verb
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => {
                  openRow(row)
                }}
                className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors outline-none hover:bg-[var(--color-graphite-50)] focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)]"
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block text-[13px] leading-5',
                      read
                        ? 'text-[var(--color-graphite-500)]'
                        : 'text-[var(--color-graphite-800)]',
                    )}
                  >
                    <span
                      className={cn(
                        'font-medium',
                        read
                          ? 'text-[var(--color-graphite-600)]'
                          : 'text-[var(--color-graphite-900)]',
                      )}
                    >
                      {actor}
                    </span>{' '}
                    {act} {row.event.subject_name}
                    {row.event.detail === null ? '' : `, ${row.event.detail}`}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-[var(--color-graphite-400)]">
                    {formatAgo(row.created_at, Date.now())}
                  </span>
                </span>
                {read ? null : (
                  <span
                    aria-hidden="true"
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground"
                  />
                )}
              </button>
            )
          })
        )}
      </PopoverContent>
    </Popover>
  )
}
