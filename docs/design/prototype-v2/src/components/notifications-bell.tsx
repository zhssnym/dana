/*
The bell (DES-226): where a person learns what happened to them.

It sits in the sidebar header beside Search because awareness is global
chrome — the window bar belongs to the active tab, a page you must visit is
a feed that fails its job, and the sidebar header is where Dana already
keeps its one other everywhere-control. The badge is monochrome (a graphite
disc, white count, capped at 9+), unread rows are told by tone with a
graphite dot, and the accent enters nowhere: the rules of
`lib/notifications.ts`, drawn.
*/

import { useState } from "react"

import { Bell } from "@/lib/icons"

import { Face } from "@/components/person-face"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  NOTIFICATION_FIXTURES,
  isRead,
  markAllRead,
  markRead,
  useUnreadCount,
  type PrototypeNotification,
} from "@/lib/notifications"
import { cn } from "@/lib/utils"

function openTarget(target: PrototypeNotification["target"]) {
  const url = new URL(window.location.href)
  url.search = ""
  url.hash = ""
  if (target.kind === "task") {
    /* The task's own address (DES-201): it opens in the viewer's preferred
       surface over wherever the URL lands, which is the point of having one. */
    url.searchParams.set("task", target.id)
  } else {
    url.searchParams.set("state", "folder")
    url.searchParams.set("folder", target.name)
  }
  window.location.assign(url)
}

export function NotificationsBell() {
  const unread = useUnreadCount()
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            className="relative size-[var(--shell-sidebar-item-height)] text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-900)] group-data-[collapsible=icon]:order-2 group-data-[collapsible=icon]:size-[var(--shell-sidebar-row-height)]"
            aria-label={
              unread > 0
                ? `Notifications, ${unread} unread`
                : "Notifications"
            }
          />
        }
      >
        <Bell className="!size-4" strokeWidth={1.75} aria-hidden="true" />
        {unread > 0 ? (
          <span
            aria-hidden="true"
            /* Roles, not values (the standing colour rule, and this file's
               own first bug): foreground-on-background inverts with the
               theme, while graphite-900-under-white went white-on-white the
               moment dark flipped the ramp. */
            className="absolute top-1 right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-foreground px-0.5 text-[9px] leading-none font-semibold text-background"
          >
            {unread > 9 ? "9+" : unread}
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
              onClick={() => markAllRead()}
              className="rounded-md px-1.5 py-0.5 text-[12px] leading-4 text-[var(--color-graphite-500)] transition-colors outline-none hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)] focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)]"
            >
              Mark all read
            </button>
          ) : null}
        </div>
        {NOTIFICATION_FIXTURES.length === 0 ? (
          <p className="px-2 py-6 text-center text-[13px] leading-5 text-[var(--color-graphite-500)]">
            Nothing new. When someone assigns you a task or answers you, it
            lands here.
          </p>
        ) : (
          NOTIFICATION_FIXTURES.map((notification) => {
            const read = isRead(notification.id)
            return (
              <button
                key={notification.id}
                type="button"
                onClick={() => {
                  markRead(notification.id)
                  setOpen(false)
                  openTarget(notification.target)
                }}
                className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors outline-none hover:bg-[var(--color-graphite-50)] focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)]"
              >
                <Face person={notification.actor} className="mt-0.5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-[13px] leading-5",
                      /* Tone, never hue: the unread sentence reads at full
                         strength, the read one recedes (DES-143's rule,
                         generalized). */
                      read
                        ? "text-[var(--color-graphite-500)]"
                        : "text-[var(--color-graphite-800)]",
                    )}
                  >
                    <span
                      className={cn(
                        "font-medium",
                        read
                          ? "text-[var(--color-graphite-600)]"
                          : "text-[var(--color-graphite-900)]",
                      )}
                    >
                      {notification.actor.name}
                    </span>{" "}
                    {notification.sentence}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-[var(--color-graphite-400)]">
                    {notification.when}
                  </span>
                </span>
                {!read ? (
                  <span
                    aria-hidden="true"
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground"
                  />
                ) : null}
              </button>
            )
          })
        )}
      </PopoverContent>
    </Popover>
  )
}
