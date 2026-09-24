/*
The notifications bell of 9.12.

The accessible name is the record: "Notifications", suffixed ", N unread"
while any are (9.1, AC-218). The trigger shows only a dot; no count is drawn.

A row is a pointer (9.12): pressing it marks it read and opens its subject. A
post opens its thread at the post: a task on its Discussion tab
(`?tab=discussion`), a Discussion by id, otherwise the folder. Posts in one
thread and one read state fold into one row (`notifications-grouping.ts`);
mentions never fold. "Mark all read" is the only other verb.

Actors resolve through the connections roster already cached, by id; one this
client cannot resolve reads "Someone".

Live while the app is open (r7): the list re-reads every twenty seconds while
the tab is visible (TanStack pauses the interval in a hidden tab), on focus as
every read does, and at once when the bell is opened, so it never opens on
stale rows. A row is two lines: who and what ("Bilal posted · 2 new"), then
where and the words ("in "Launch" · “Bakery yes…”").
*/
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from '../api/mutations.js'
import { useConnections, useMe, useNotifications } from '../api/queries.js'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip.js'
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
import { actorsPhrase, groupNotifications, isPost, placeOf, type BellGroup } from './notifications-grouping.js'

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
  mentioned: 'mentioned',
}

/**
 * The subject's address (9.12): a task via /app/tasks/:id, a folder or shelf
 * at its page, a post at its thread with `#post-<id>` bringing it into view.
 * A comment with no folder cannot happen (4.15), but Today beats a dead control.
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
      /* The same parameter a Dana Link to a task's post uses (`dana-link.ts`). */
      if (row.task_id !== null) {
        return `${paths.task(row.task_id)}?tab=discussion#post-${event.subject_id}`
      }
      if (event.folder_id === null) return paths.today
      if (row.discussion_id !== undefined && row.discussion_id !== null) {
        return `${paths.folder(event.folder_id)}?discussion=${row.discussion_id}#post-${event.subject_id}`
      }
      return `${paths.folder(event.folder_id)}?conversation=open`
  }
}

/** "in "X"", from either stored form of a post's or a mention's detail. */
function placeLine(row: NotificationLine): string | null {
  const detail = row.event.detail ?? ''
  const mentioned = /^mentioned you ins+(.+)$/.exec(detail.trim())?.[1]
  const place = mentioned ?? placeOf(row.event.detail)
  return place === null ? null : `in ${place}`
}

/** The second line: where, then the words, either of which may be absent. */
function whereAndWords(place: string | null, quote: string | null): string | null {
  const words = quote === null || quote === '' ? null : `“${quote}”`
  if (place === null) return words
  return words === null ? place : `${place} · ${words}`
}

/**
 * A single row's sentence (9.12: actor, act, thing). An assignment reaches
 * only its assignee, so it reads "assigned you"; a post or a mention in a
 * thread quotes the post on its own line.
 */
function sentenceOf(row: NotificationLine): { readonly act: string; readonly quote: string | null } {
  const event = row.event
  const detail = event.detail ?? ''
  if (event.verb === 'mentioned') {
    return event.subject_kind === 'comment'
      ? { act: 'mentioned you', quote: whereAndWords(placeLine(row), event.subject_name) }
      : { act: `mentioned you in "${event.subject_name}"`, quote: null }
  }
  if (event.subject_kind === 'comment') {
    return { act: 'posted', quote: whereAndWords(placeLine(row), event.subject_name) }
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
  side = 'top',
  className,
}: {
  /** Where the list opens: above the sidebar's foot row. */
  readonly side?: 'right' | 'bottom' | 'top'
  /** Extra classes for the square trigger. */
  readonly className?: string
} = {}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const notifications = useNotifications(true)
  /* Opening the bell always shows the truth, never the last poll's rows. */
  const { refetch } = notifications
  useEffect(() => {
    if (open) void refetch()
  }, [open, refetch])
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

  function nameOf(actorId: string): string {
    return people.get(actorId)?.name ?? 'Someone'
  }

  /* Reads every unread row in the group and opens it. One post opens at
     that post; several open the thread with no `#post-`, so the thread lands
     on its own first unread post (and draws "New" there), not the newest. */
  function openGroup(group: BellGroup): void {
    for (const row of group.rows) if (row.read_at === null) markRead.mutate(row.id)
    setOpen(false)
    const newest = group.rows[0]
    if (newest === undefined) return
    const path = subjectPath(newest)
    void navigate(group.rows.length > 1 && isPost(newest) ? path.replace(/#post-.*$/, '') : path)
  }

  /* One person or several, "posted in" the place, and how many are new. */
  function lineOf(group: BellGroup): { readonly actor: string; readonly act: string; readonly quote: string | null } {
    const newest = group.rows[0] as NotificationLine
    if (group.rows.length === 1 || !isPost(newest)) {
      return { actor: nameOf(newest.event.actor_id), ...sentenceOf(newest) }
    }
    const names = [...new Set(group.rows.map((row) => row.event.actor_id))].map(nameOf)
    const fresh = group.read ? '' : ` · ${group.rows.length} new`
    return { actor: actorsPhrase(names), act: `posted${fresh}`, quote: whereAndWords(placeLine(newest), newest.event.subject_name) }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
      <PopoverTrigger
        render={
          <TooltipTrigger
            render={
          <button
            type="button"
            data-popup-open={open ? '' : undefined}
            className={cn(
              'relative flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground data-popup-open:bg-sidebar-accent data-popup-open:text-foreground [&_svg]:size-4',
              className,
            )}
            aria-label={bellName(unread)}
          />
            }
          />
        }
      >
        <Bell strokeWidth={1.75} aria-hidden="true" />
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 size-1.5 rounded-full bg-foreground ring-2 ring-sidebar"
          />
        ) : null}
      </PopoverTrigger>
      <TooltipContent side="top">Notifications</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="start"
        side={side}
        className="w-[min(360px,calc(100vw-16px))] p-1"
      >
        {unread > 0 ? (
          <div className="flex h-8 items-center justify-end px-2">
            <button
              type="button"
              onClick={() => {
                markAllRead.mutate()
              }}
              className="rounded-sm px-1.5 py-0.5 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-foreground"
            >
              Mark all read
            </button>
          </div>
        ) : null}
        {rows.length === 0 ? (
          /* 9.12's empty state, word for word. */
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            Nothing new. When someone assigns you a task or answers you, it
            lands here.
          </p>
        ) : (
          groupNotifications(rows).map((group) => {
            const newest = group.rows[0] as NotificationLine
            const person = people.get(newest.event.actor_id) ?? null
            const face = person?.name ?? 'Someone'
            const { actor, act, quote } = lineOf(group)
            return (
              <button
                key={group.key}
                type="button"
                onClick={() => {
                  openGroup(group)
                }}
                className="flex w-full items-start gap-2.5 rounded-sm px-2 py-2 text-left outline-none hover:bg-accent"
              >
                <PersonFace
                  className="mt-0.5 shrink-0"
                  id={newest.event.actor_id}
                  name={face}
                  initials={initialsOf(face)}
                  image={person?.image ?? null}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-sm',
                        group.read ? 'text-muted-foreground' : 'text-foreground',
                      )}
                    >
                      <span className="font-medium">{actor}</span> {act}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatAgo(newest.created_at, Date.now())}
                    </span>
                  </span>
                  {quote === null ? null : (
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {quote}
                    </span>
                  )}
                </span>
                {group.read ? null : (
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
