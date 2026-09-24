/*
The notifications bell of 9.12.

**The name is the badge said aloud.** 9.1's names table fixes the bell at
"Notifications", suffixed ", N unread" while any are, and AC-218 reads the
count out of the accessible name rather than off the visual badge, which is
the point of putting it there: the badge is aria-hidden and the name is the
record.

**The sentence is the event's own.** The wire carries 4.13's verb and, where the chokepoint
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

**Unread is told by tone and a dot, never by hue**, the badge on
`bg-foreground text-background` because roles invert with the theme and fixed
values go white-on-white.

Liveness: the list refetches on focus like every read, and polls only
while the popover is open (`useNotifications(open)`), and nothing more.

**Each row leads with the actor's face**, so a feed about what people did to
you shows them as well as naming them. The roster this file already reads for
the name supplies the initials, so it costs a component and no request.

It lives in `components/`, the reusable layer, rather than `shell/`, the app
frame.
*/
import { useState } from 'react'
import { useNavigate } from 'react-router'

import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from '../api/mutations.js'
import { useConnections, useMe, useNotifications } from '../api/queries.js'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover.js'
import { Bell } from '../lib/icons.js'
import { formatAgo } from '../parts/format-dates.js'
import { initialsOf } from '../parts/presenters.js'
import { PersonFace } from './person-face.js'
import { cn } from './ui/utils.js'
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
function subjectPath(row: NotificationLine): string {
  const event = row.event
  switch (event.subject_kind) {
    case 'task':
      return paths.task(event.subject_id)
    case 'folder':
      return paths.folder(event.subject_id)
    case 'shelf':
      return paths.shelf(event.subject_id)
    case 'comment':
      /* A comment lands on its thread, opened: the task
         when it sits on one, the folder page otherwise, each told to expand
         its conversation by the query the page reads. */
      if (row.task_id !== null) return `${paths.task(row.task_id)}?${CONVERSATION_PARAM}=open`
      return event.folder_id === null
        ? paths.desk
        : `${paths.folder(event.folder_id)}?${CONVERSATION_PARAM}=open`
  }
}

/** The query a page reads to open its conversation on arrival. */
export const CONVERSATION_PARAM = 'conversation'

/**
 * The row's sentence (9.12: actor, act, thing).
 *
 * Two acts are said for the reader rather than for the record: an assignment
 * reaches only its assignee, so "assigned to X" reads "assigned you"; and a
 * comment's detail already names its place, so the snippet goes on its own
 * line, quoted. Everything else keeps the verb and the thing's name.
 */
function sentenceOf(row: NotificationLine): { readonly act: string; readonly quote: string | null } {
  const event = row.event
  const detail = event.detail ?? ''
  if (event.subject_kind === 'comment') {
    return { act: detail.startsWith('commented') ? detail : 'commented', quote: event.subject_name }
  }
  if (detail.startsWith('assigned to ')) {
    return { act: `assigned you "${event.subject_name}"`, quote: null }
  }
  const verb = VERB_SENTENCE[event.verb] ?? event.verb
  return {
    act: `${verb} "${event.subject_name}"${detail === '' ? '' : `, ${detail}`}`,
    quote: null,
  }
}

export function NotificationsBell({
  side = 'right',
  className,
}: {
  /** Where the list opens: right of the sidebar on a laptop, below on a phone. */
  readonly side?: 'right' | 'bottom'
  /** The row treatment the sidebar gives every entry. */
  readonly className?: string
} = {}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const notifications = useNotifications(open)
  const connections = useConnections()
  const me = useMe()
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()

  const rows = notifications.data?.notifications ?? []
  const unread = rows.filter((row) => row.read_at === null).length

  const people = new Map<string, { name: string; image: string | null }>()
  for (const connection of connections.data ?? []) {
    const name = connection.user.display_name
    if (name !== null) {
      people.set(connection.user.id, { name, image: connection.user.avatar_url })
    }
  }
  const myName = me.data?.user.display_name
  if (me.data !== undefined && myName !== null && myName !== undefined) {
    people.set(me.data.user.id, { name: myName, image: me.data.user.avatar_url })
  }

  function openRow(row: NotificationLine): void {
    if (row.read_at === null) markRead.mutate(row.id)
    setOpen(false)
    void navigate(subjectPath(row))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            data-popup-open={open ? '' : undefined}
            className={cn(
              'flex w-full items-center outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
              className,
            )}
            aria-label={bellName(unread)}
          />
        }
      >
        <Bell strokeWidth={1.75} aria-hidden="true" />
        <span className="flex-1 text-left">Notifications</span>
        {unread > 0 ? (
          <span aria-hidden="true" className="text-xs font-medium text-foreground tabular-nums">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side={side}
        className="w-[min(360px,calc(100vw-16px))] p-1"
      >
        <div className="flex h-8 items-center justify-between px-2">
          <p className="text-xs font-medium text-muted-foreground">Notifications</p>
          {unread > 0 ? (
            <button
              type="button"
              onClick={() => {
                markAllRead.mutate()
              }}
              className="rounded-sm px-1.5 py-0.5 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              Mark all read
            </button>
          ) : null}
        </div>
        {rows.length === 0 ? (
          /* 9.12's empty state, word for word. */
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            Nothing new. When someone assigns you a task or answers you, it
            lands here.
          </p>
        ) : (
          rows.map((row) => {
            const read = row.read_at !== null
            const person = people.get(row.event.actor_id) ?? null
            const actor = person?.name ?? 'Someone'
            const { act, quote } = sentenceOf(row)
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => {
                  openRow(row)
                }}
                className="flex w-full items-start gap-2.5 rounded-sm px-2 py-2 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                <PersonFace
                  className="mt-0.5 shrink-0"
                  name={actor}
                  initials={initialsOf(actor)}
                  image={person?.image ?? null}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block text-sm',
                      read ? 'text-muted-foreground' : 'text-foreground',
                    )}
                  >
                    <span className="font-medium">{actor}</span> {act}
                  </span>
                  {quote === null ? null : (
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      “{quote}”
                    </span>
                  )}
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {formatAgo(row.created_at, Date.now())}
                  </span>
                </span>
                {read ? null : (
                  <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground" />
                )}
              </button>
            )
          })
        )}
      </PopoverContent>
    </Popover>
  )
}
