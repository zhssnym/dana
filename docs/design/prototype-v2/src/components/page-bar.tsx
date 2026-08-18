/*
The page bar, grown into what it always drew itself as: a tab strip.

The strip has rendered the current page as a browser-style tab since v1 —
border on three sides, lifted onto the card ground — while being the only tab
there could ever be. Imran's direction, 2026-08-18: a task opened full screen
can become a tab, so the strip now holds the page tab plus any task tabs, and
the drawing finally means what it says.

Front-end truths, considered rather than discovered:

- **The page tab is the home tab.** It cannot be closed, and selecting it
  returns to the page the URL names. Task tabs sit after it, close on their
  X or middle-click, and the strip returns to the page when the active one
  closes.
- **Task tabs survive navigation.** They live in sessionStorage (the shell
  navigates by full page load), so switching to My Day does not eat the tab
  a person opened from a folder's board. Session-scoped on purpose: tabs are
  working state, not data, and a fresh visit starts clean.
- **The active tab owns the ground.** One tab is visually "up" at a time —
  the page tab when the page shows, a task tab when its task does.

Lane 1: presentation over existing state. The tab model ships nothing the
shell does not already hold in memory.
*/

import type { LucideIcon } from "@/lib/icons"
import { RefreshCw, X } from "@/lib/icons"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"

export interface PageTab {
  id: string
  title: string
}

export function PageBar({
  title,
  icon: Icon,
  iconColor,
  showUpdate = false,
  taskTabs = [],
  activeTaskTab = null,
  onSelectTab,
  onCloseTab,
}: {
  title: string
  icon?: LucideIcon
  iconColor?: string
  showUpdate?: boolean
  taskTabs?: PageTab[]
  activeTaskTab?: string | null
  onSelectTab?: (id: string | null) => void
  onCloseTab?: (id: string) => void
}) {
  const pageActive = activeTaskTab === null

  return (
    <header
      className={showUpdate
        ? "flex h-[var(--control-height)] shrink-0 items-center border-b border-[var(--color-graphite-200)] bg-[var(--color-graphite-25)]"
        : "flex h-[var(--shell-pagebar-height)] shrink-0 items-center border-b border-[var(--color-graphite-200)] bg-[var(--color-graphite-25)]"}
    >
      <button
        type="button"
        data-static-page-tab
        onClick={() => onSelectTab?.(null)}
        className={cn(
          "relative -mt-px -mb-px -ml-px flex min-w-48 max-w-64 items-center gap-2 self-stretch px-3 text-left transition-colors",
          T_FAST,
          pageActive
            ? "border-x border-t border-[var(--color-graphite-200)] bg-card"
            : "border-x border-t border-transparent text-[var(--color-graphite-500)] hover:bg-[var(--color-graphite-50)]",
        )}
        aria-label={`Open page: ${title}`}
        aria-current={pageActive ? "page" : undefined}
      >
        {Icon ? (
          <Icon
            className="size-3.5 shrink-0"
            style={iconColor ? { color: iconColor } : undefined}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        ) : null}
        <span
          className={cn(
            "truncate text-xs leading-4 font-medium",
            pageActive
              ? "text-[var(--color-graphite-800)]"
              : "text-[var(--color-graphite-500)]",
          )}
        >
          {title}
        </span>
      </button>

      {taskTabs.map((tab) => {
        const active = activeTaskTab === tab.id
        return (
          <div
            key={tab.id}
            className={cn(
              "group/tab relative -mt-px -mb-px flex min-w-32 max-w-56 items-center self-stretch transition-colors",
              T_FAST,
              active
                ? "border-x border-t border-[var(--color-graphite-200)] bg-card"
                : "border-x border-t border-transparent hover:bg-[var(--color-graphite-50)]",
            )}
          >
            <button
              type="button"
              onClick={() => onSelectTab?.(tab.id)}
              onAuxClick={(event) => {
                if (event.button === 1) onCloseTab?.(tab.id)
              }}
              aria-current={active ? "page" : undefined}
              className="min-w-0 flex-1 py-1 pr-6 pl-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-inset"
            >
              <span
                className={cn(
                  "block truncate text-xs leading-4 font-medium",
                  active
                    ? "text-[var(--color-graphite-800)]"
                    : "text-[var(--color-graphite-500)]",
                )}
              >
                {tab.title}
              </span>
            </button>
            <button
              type="button"
              aria-label={`Close tab: ${tab.title}`}
              onClick={() => onCloseTab?.(tab.id)}
              className={cn(
                "absolute right-1 flex size-4 items-center justify-center rounded text-[var(--color-graphite-400)] opacity-0 transition-opacity group-hover/tab:opacity-100 focus-visible:opacity-100 hover:bg-[var(--color-graphite-200)] hover:text-[var(--color-graphite-700)]",
                T_FAST,
                active && "opacity-100",
              )}
            >
              <X className="size-3 data-[size=sm]:size-3" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        )
      })}

      {showUpdate ? (
        <Button
          variant="ghost"
          className="ml-auto h-[var(--control-height)] px-3 text-sm text-[var(--color-graphite-700)] hover:bg-[var(--color-graphite-100)]"
          onClick={() => window.location.reload()}
        >
          <RefreshCw
            data-icon="inline-start"
            className="size-4"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          Update available, reload
        </Button>
      ) : null}
    </header>
  )
}
