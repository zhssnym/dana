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

import { FolderMark } from "@/components/folder-mark"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"

/*
What an inactive tab does when you touch it — F5, 2026-08-22, the last of the
shell pass Imran listed.

It used to go **darker**: the strip's ground is graphite-50 and hover painted
graphite-100 over it. That is backwards, and at a 24px tab it was actively
confusing. Pressing a tab makes it white — so hover, which is the preview of
that press, has to move toward white, not away from it. Going darker says
"recessed", which is the one thing a click will not do, and it left hover and
active reading as two filled tabs one step apart in opposite directions.

So hover is the tab three-fifths of the way up to the card ground, with the
label darkening the same distance. It is unmistakably on its way to being the
active tab, and never mistakable for one.
*/
const TAB_HOVER =
  "hover:bg-[color-mix(in_oklab,var(--color-graphite-0)_60%,var(--color-graphite-50))]"

export interface PageTab {
  id: string
  title: string
  /* The folder the task is in. A tab's mark says what kind of thing it holds
     and, for a task, *where* it lives — an unfiled one resolves to Desk in
     the one resolver rather than here. */
  folder?: { name?: string; color?: string }
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
        ? "flex h-[var(--control-height)] shrink-0 items-center bg-sidebar"
        : "flex h-[var(--shell-pagebar-height)] shrink-0 items-center bg-sidebar"}
    >
      <button
        type="button"
        data-static-page-tab
        onClick={() => onSelectTab?.(null)}
        className={cn(
          /* The active tab is the sheet reaching up into the chrome: it is
             simply white, continuous with the page below it, and needs no
             outline to say so. The inactive ones are nothing at all until you
             touch them, when they take the chrome's own hover wash. Three
             borders and a negative-margin stack used to draw this; the tonal
             step draws it now (Imran, 2026-08-22). */
          "group/tab relative flex min-w-48 max-w-64 items-center gap-2 self-stretch rounded-t-lg px-3 text-left transition-colors",
          T_FAST,
          pageActive ? "bg-card" : cn("text-[var(--color-graphite-500)]", TAB_HOVER),
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
            "truncate text-xs leading-4 font-medium transition-colors",
            T_FAST,
            pageActive
              ? "text-[var(--color-graphite-800)]"
              : "text-[var(--color-graphite-500)] group-hover/tab:text-[var(--color-graphite-700)]",
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
              "group/tab relative flex min-w-32 max-w-56 items-center self-stretch rounded-t-lg transition-colors",
              T_FAST,
              active ? "bg-card" : TAB_HOVER,
            )}
          >
            <button
              type="button"
              onClick={() => onSelectTab?.(tab.id)}
              onAuxClick={(event) => {
                if (event.button === 1) onCloseTab?.(tab.id)
              }}
              aria-current={active ? "page" : undefined}
              className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-6 pl-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-inset"
            >
              {/*
              A tab says what kind of thing it holds, and a task tab says
              which folder it came out of — Imran's point 17.

              It wore a generic tick, which was the fault DES-155 named one
              level up: an identity only some surfaces honour is a decoration
              on one screen. The mark comes from the one resolver, so a folder
              somebody has dressed follows its tasks into the tab strip, and
              one nobody has dressed answers the plain folder exactly as
              before.

              Emphasis rides opacity rather than the hue, the same arithmetic
              the sidebar's folder row settled at F5: the colour is the
              folder's identity and has to survive, so an inactive tab's mark
              fades rather than greys.
              */}
              <span
                className={cn(
                  "flex size-3.5 shrink-0 items-center justify-center transition-opacity",
                  T_FAST,
                  active ? "opacity-100" : "opacity-[0.62] group-hover/tab:opacity-100",
                )}
              >
                <FolderMark
                  name={tab.folder?.name}
                  color={tab.folder?.color}
                  className="size-3.5"
                />
              </span>
              <span
                className={cn(
                  "block truncate text-xs leading-4 font-medium transition-colors",
                  T_FAST,
                  active
                    ? "text-[var(--color-graphite-800)]"
                    : "text-[var(--color-graphite-500)] group-hover/tab:text-[var(--color-graphite-700)]",
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
