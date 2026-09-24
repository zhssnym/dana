import * as React from "react"

import { cn } from "./utils.js"

/*
r5-primitives: the one segmented control, for choosing one of a few values
in place (view switcher, Theme, Clock). A muted track, the chosen value on
a page-coloured pill; 28px (--control-height) overall, 14px, weight 500.
It is a radiogroup: one Tab stop (the chosen value), ←/→ (and ↑/↓) move
the choice, as a native radio group does.

  <Segmented label="View" value={mode} onValueChange={setMode}
             options={[{ value: "linear", label: "Linear" }, ...]} />
*/

type SegmentedOption<T extends string> = {
  value: T
  label: React.ReactNode
  /** Accessible name when the label is an icon. */
  ariaLabel?: string
  disabled?: boolean
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onValueChange,
  className,
}: {
  label: string
  value: T
  options: readonly SegmentedOption<T>[]
  onValueChange: (next: T) => void
  className?: string
}) {
  const enabled = options.filter((option) => !option.disabled)
  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-slot="segmented"
      className={cn(
        "inline-flex h-[var(--control-height)] shrink-0 items-stretch gap-0.5 rounded-md bg-muted p-0.5",
        className
      )}
      onKeyDown={(event) => {
        const back = event.key === "ArrowLeft" || event.key === "ArrowUp"
        const forward = event.key === "ArrowRight" || event.key === "ArrowDown"
        if (!back && !forward) return
        event.preventDefault()
        const at = enabled.findIndex((option) => option.value === value)
        const next = enabled[(at + (back ? -1 : 1) + enabled.length) % enabled.length]
        if (next === undefined) return
        onValueChange(next.value)
        const radio = event.currentTarget.querySelector<HTMLElement>(
          `[data-value="${CSS.escape(next.value)}"]`
        )
        radio?.focus()
      }}
    >
      {options.map((option) => {
        const checked = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.ariaLabel}
            disabled={option.disabled}
            tabIndex={checked ? 0 : -1}
            data-value={option.value}
            data-checked={checked ? "" : undefined}
            onClick={() => onValueChange(option.value)}
            className="inline-flex items-center justify-center gap-1.5 rounded-sm px-2 text-sm font-medium whitespace-nowrap text-muted-foreground select-none hover:text-foreground disabled:pointer-events-none disabled:opacity-50 data-checked:bg-background data-checked:text-foreground [&_svg]:size-4 [&_svg]:shrink-0"
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export { Segmented, type SegmentedOption }
