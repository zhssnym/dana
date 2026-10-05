// The notifications bell. Its accessible name carries the unread count (AC-218);
// the trigger shows only a dot. Pressing a row marks it read and opens its subject.
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
import { Button } from './ui/button.js'
import { formatAgo } from '../parts/format-dates.js'
import { initialsOf } from '../parts/presenters.js'
import { PersonFace } from './person-face.js'
import { cn } from './ui/utils.js'
import type { NotificationLine } from '../../shared/events.js'
import { paths } from '../routes.js'
import { actorsPhrase, groupNotifications, isPost, placeOf, type BellGroup } from './notifications-grouping.js'

function bellName(unread: number): string {
  return unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'
}

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

/** A comment always has a folder, but Today beats a dead control. */
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
      if (event.folder_id === null) return paths.today
      if (row.discussion_id !== undefined && row.discussion_id !== null) {
        return `${paths.folder(event.folder_id)}?discussion=${row.discussion_id}#post-${event.subject_id}`
      }
      return `${paths.folder(event.folder_id)}?conversation=open`
  }
}

function placeLine(row: NotificationLine): string | null {
  const detail = row.event.detail ?? ''
  const mentioned = /^mentioned you in\s+(.+)$/.exec(detail.trim())?.[1]
  const place = mentioned ?? placeOf(row.event.detail)
  return place === null ? null : `in ${place}`
}

function whereAndWords(place: string | null, quote: string | null): string | null {
  const words = quote === null || quote === '' ? null : `“${quote}”`
  if (place === null) return words
  return words === null ? place : `${place} · ${words}`
}

/** An assignment reaches only its assignee, so it reads "assigned you". */
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
  readonly side?: 'right' | 'bottom' | 'top'
  readonly className?: string
} = {}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const notifications = useNotifications(true)
  // Opening the bell always refetches, never shows the last poll's rows.
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

  // Several posts open the thread without `#post-`, so it lands on the first unread post.
  function openGroup(group: BellGroup): void {
    for (const row of group.rows) if (row.read_at === null) markRead.mutate(row.id)
    setOpen(false)
    const newest = group.rows[0]
    if (newest === undefined) return
    const path = subjectPath(newest)
    void navigate(group.rows.length > 1 && isPost(newest) ? path.replace(/#post-.*$/, '') : path)
  }

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
        {/* The list's one heading, with its one verb at the right. */}
        <div className="flex h-(--row-height) items-center gap-(--space-inline) pr-1 pl-2">
          <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">Notifications</h2>
          {unread > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                markAllRead.mutate()
              }}
            >
              Mark all read
            </Button>
          ) : null}
        </div>
        {rows.length === 0 ? (
          // The empty-state copy is fixed by spec 9.12.
          <p className="px-2 pt-1 pb-3 text-sm text-muted-foreground">
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
