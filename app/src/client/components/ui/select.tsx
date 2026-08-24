"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "../../lib/icons.js"

import { cn } from "./utils.js"

function Select<Value>({ ...props }: SelectPrimitive.Root.Props<Value>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectValue({ ...props }: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  children,
  ...props
}: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "flex h-[var(--control-height)] w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors hover:bg-[var(--color-graphite-50)] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 data-popup-open:bg-[var(--color-graphite-50)] data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="min-w-0 flex-1 truncate text-left">{children}</span>
      <SelectPrimitive.Icon>
        <ChevronDownIcon
          className="size-4 shrink-0 text-[var(--color-graphite-500)]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  align = "start",
  side = "bottom",
  sideOffset = 4,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<SelectPrimitive.Positioner.Props, "align" | "side" | "sideOffset">) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        className="isolate z-[70] outline-none"
        align={align}
        side={side}
        sideOffset={sideOffset}
        alignItemWithTrigger={false}
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-hidden rounded-[10px] bg-popover text-popover-foreground shadow-[var(--elevation-1)] ring-1 ring-[var(--color-graphite-200)] duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        >
          <SelectPrimitive.ScrollUpArrow className="flex h-6 cursor-default items-center justify-center bg-popover text-muted-foreground">
            <ChevronUpIcon className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </SelectPrimitive.ScrollUpArrow>
          <SelectPrimitive.List className="max-h-[min(320px,var(--available-height))] overflow-y-auto p-1">
            {children}
          </SelectPrimitive.List>
          <SelectPrimitive.ScrollDownArrow className="flex h-6 cursor-default items-center justify-center bg-popover text-muted-foreground">
            <ChevronDownIcon className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </SelectPrimitive.ScrollDownArrow>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex min-h-9 cursor-default items-center gap-2 rounded-md py-1.5 pr-9 pl-2 text-[13px] leading-5 outline-none select-none data-highlighted:bg-[var(--color-graphite-100)] data-highlighted:text-[var(--color-graphite-900)] data-selected:font-medium data-disabled:pointer-events-none data-disabled:opacity-45",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="min-w-0 flex-1 truncate">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2 flex size-5 items-center justify-center text-[var(--color-graphite-800)]">
        <CheckIcon className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
