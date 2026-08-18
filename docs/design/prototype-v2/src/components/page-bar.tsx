import type { LucideIcon } from "@/lib/icons"
import { RefreshCw } from "@/lib/icons"

import { Button } from "@/components/ui/button"

export function PageBar({
  title,
  icon: Icon,
  iconColor,
  showUpdate = false,
}: {
  title: string
  icon?: LucideIcon
  iconColor?: string
  showUpdate?: boolean
}) {
  return (
    <header
      className={showUpdate
        ? "flex h-[var(--control-height)] shrink-0 items-center border-b border-[var(--color-graphite-200)] bg-[var(--color-graphite-25)]"
        : "flex h-[var(--shell-pagebar-height)] shrink-0 items-center border-b border-[var(--color-graphite-200)] bg-[var(--color-graphite-25)]"}
    >
      <div
        data-static-page-tab
        className="relative -mt-px -mb-px -ml-px flex min-w-48 max-w-64 self-stretch items-center gap-2 border-x border-t border-[var(--color-graphite-200)] bg-card px-3"
        aria-label={`Open page: ${title}`}
      >
        {Icon ? (
          <Icon
            className="size-3.5 shrink-0"
            style={iconColor ? { color: iconColor } : undefined}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        ) : null}
        <span className="truncate text-xs leading-4 font-medium text-[var(--color-graphite-800)]">
          {title}
        </span>
      </div>
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
