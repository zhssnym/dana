import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"

import { Separator } from "./separator.js"
import { cn } from "./utils.js"

/*
r5-primitives: the one row. Settings, Trash, People, member lists and
menu-like lists are built from it.

  [icon]  Label                               meta  [control]
          Muted one-line description

At least --row-height tall, 14px label (weight 400; `danger` turns it
danger ink), 12px muted description, 12px muted `meta` before the control,
the control on the right, all vertically centred. Rows in a group touch;
the hover tint (clickable rows only) separates them, never a border.

- Clickable row: pass `onClick` (it becomes a keyboard button) or `render`
  (`render={<a href=… />}`, `render={<Link to=… />}`). Do not put a
  `control` inside a clickable row; a row is either a target or a holder.
- `selected`: the selection tint (--selected), not a ring, and the row
  shows focus its own way (`data-focus="self"`).
*/
type RowProps = Omit<useRender.ComponentProps<"div">, "children"> & {
  label: React.ReactNode
  description?: React.ReactNode
  meta?: React.ReactNode
  control?: React.ReactNode
  icon?: React.ReactNode
  danger?: boolean
  selected?: boolean
}

function Row({
  label,
  description,
  meta,
  control,
  icon,
  danger = false,
  selected = false,
  className,
  render,
  onClick,
  ...props
}: RowProps) {
  const clickable = onClick !== undefined || render !== undefined
  const keyboardButton = onClick !== undefined && render === undefined
  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">(
      {
        className: cn(
          "flex min-h-[var(--row-height)] items-center gap-[var(--space-inline)] rounded-md px-2 py-1 text-left text-sm",
          clickable && "cursor-pointer hover:bg-accent active:bg-press",
          selected && "bg-selected hover:bg-selected",
          className
        ),
        onClick,
        ...(keyboardButton
          ? {
              role: "button",
              tabIndex: 0,
              onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
                if (event.target !== event.currentTarget) return
                if (event.key !== "Enter" && event.key !== " ") return
                event.preventDefault()
                event.currentTarget.click()
              },
            }
          : {}),
        ...(selected ? { "data-focus": "self", "aria-current": "true" as const } : {}),
        children: (
          <>
            {icon ? (
              <span className="flex shrink-0 text-muted-foreground [&_svg:not([class*='size-'])]:size-4">
                {icon}
              </span>
            ) : null}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={cn("truncate", danger ? "text-destructive" : "text-foreground")}>
                {label}
              </span>
              {description ? (
                <span className="text-xs text-muted-foreground">{description}</span>
              ) : null}
            </span>
            {meta ? <span className="shrink-0 text-xs text-muted-foreground">{meta}</span> : null}
            {control ? (
              <span className="flex shrink-0 items-center gap-[var(--space-inline)]">{control}</span>
            ) : null}
          </>
        ),
      },
      props
    ),
    state: { slot: "row" },
  })
}

/*
A group of rows under one heading (14px, section weight 500, muted
description under it). Groups are separated by --space-group; pass
`divider` when space is not enough and the one Separator goes above.
*/
function RowGroup({
  title,
  description,
  divider = false,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"section">, "title"> & {
  title?: React.ReactNode
  description?: React.ReactNode
  divider?: boolean
}) {
  return (
    <section
      data-slot="row-group"
      className={cn(
        "flex flex-col gap-[var(--space-row)] [&+&]:mt-[var(--space-group)]",
        className
      )}
      {...props}
    >
      {divider ? <Separator className="mb-[var(--space-inline)]" /> : null}
      {title ? (
        <div className="flex flex-col px-2 pb-1">
          <h2 className="text-sm font-section text-foreground">{title}</h2>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export { Row, RowGroup, type RowProps }
