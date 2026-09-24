import * as React from "react"

import { cn } from "./utils.js"

/*
r5-primitives: the one tab strip, for moving between panels (page tabs,
task Work/Discussion, Discussion Open/Closed). 28px (--control-height),
14px, weight 500; the active tab is ink with a 2px underline on the
strip's one hairline, the rest are muted. Roving tabindex: only the active
tab is a Tab stop, ←/→/Home/End move focus along the strip.

Two ways in:
  <Tabs label="Page tabs" value={id} onValueChange={setId}
        items={[{ value: "work", label: "Work" }, ...]} />
or, when a tab needs its own handlers (drag, rename, a count):
  <TabList label="Page tabs">
    <Tab selected={id === "work"} onClick={...}>Work</Tab>
  </TabList>
A Tab's own onKeyDown runs first; call event.preventDefault() in it to
take over the arrow keys.
*/

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
