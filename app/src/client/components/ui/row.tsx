import * as React from "react"

import { cn } from "./utils.js"

/*
r4-system: the one row. A label (with an optional short muted description)
on the left, its control on the right, vertically centred, at least
--row-height tall. Settings, lists and menu-like lists are built from it.
Pass `onClick` for a clickable row (hover tint).
*/
function Row({
  label,
  description,
  control,
  icon,
  className,
  onClick,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  label: React.ReactNode
  description?: React.ReactNode
  control?: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div
      data-slot="row"
      onClick={onClick}
      className={cn(
        "flex min-h-[var(--row-height)] items-center gap-[var(--space-inline)] rounded-md px-2 py-1 text-sm",
        onClick && "cursor-pointer hover:bg-accent",
        className
      )}
      {...props}
    >
      {icon ? <span className="flex shrink-0 text-muted-foreground">{icon}</span> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-foreground">{label}</div>
        {description ? (
          <div className="text-xs text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {control ? <div className="flex shrink-0 items-center gap-2">{control}</div> : null}
    </div>
  )
}

/* A group of rows under one heading; groups are separated by --space-group. */
function RowGroup({
  title,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"section">, "title"> & { title?: React.ReactNode }) {
  return (
    <section
      data-slot="row-group"
      className={cn(
        "flex flex-col gap-[var(--space-row)] [&+&]:mt-[var(--space-group)]",
        className
      )}
      {...props}
    >
      {title ? (
        <h2 className="px-2 pb-1 text-sm font-medium text-foreground">{title}</h2>
      ) : null}
      {children}
    </section>
  )
}

export { Row, RowGroup }
