import * as React from "react"

import { cn } from "./utils.js"

// The one tab strip. Roving tabindex: only the active tab is a Tab stop; arrows,
// Home and End move along the strip. A Tab's own onKeyDown runs first and may call
// preventDefault to take over the arrows.

function tabsOf(list: HTMLElement): HTMLElement[] {
  return Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])')).filter(
    (tab) => tab.closest('[role="tablist"]') === list
  )
}

function TabList({
  label,
  className,
  onKeyDown,
  ...props
}: Omit<React.ComponentProps<"div">, "role"> & { label: string }) {
  return (
    <div
      role="tablist"
      aria-label={label}
      data-slot="tabs"
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.defaultPrevented) return
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
        const tabs = tabsOf(event.currentTarget)
        const at = tabs.indexOf(globalThis.document.activeElement as HTMLElement)
        if (at < 0 || tabs.length === 0) return
        event.preventDefault()
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : (at + (event.key === "ArrowLeft" ? -1 : 1) + tabs.length) % tabs.length
        tabs[next]?.focus()
      }}
      className={cn(
        "flex min-w-0 items-end gap-4 overflow-x-auto overflow-y-hidden border-b border-border [scrollbar-width:none]! [&::-webkit-scrollbar]:hidden",
        className
      )}
      {...props}
    />
  )
}

function Tab({
  selected,
  className,
  type = "button",
  ...props
}: Omit<React.ComponentProps<"button">, "role"> & { selected: boolean }) {
  return (
    <button
      type={type}
      role="tab"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      data-slot="tab"
      data-selected={selected ? "true" : undefined}
      className={cn(
        "-mb-px inline-flex h-[var(--control-height)] shrink-0 items-center gap-1.5 border-b-2 border-transparent text-sm font-medium whitespace-nowrap text-muted-foreground select-none hover:text-foreground disabled:pointer-events-none disabled:opacity-50 data-selected:border-foreground data-selected:text-foreground [&_svg]:size-4 [&_svg]:shrink-0",
        className
      )}
      {...props}
    />
  )
}

type TabItem<T extends string> = {
  value: T
  label: React.ReactNode
  /** Accessible name when the label is not plain text. */
  ariaLabel?: string
  disabled?: boolean
}

function Tabs<T extends string>({
  label,
  value,
  items,
  onValueChange,
  className,
}: {
  label: string
  value: T
  items: readonly TabItem<T>[]
  onValueChange: (next: T) => void
  className?: string
}) {
  return (
    <TabList label={label} className={className}>
      {items.map((item) => (
        <Tab
          key={item.value}
          selected={item.value === value}
          disabled={item.disabled}
          aria-label={item.ariaLabel}
          onClick={() => onValueChange(item.value)}
        >
          {item.label}
        </Tab>
      ))}
    </TabList>
  )
}

export { Tabs, TabList, Tab, type TabItem }
