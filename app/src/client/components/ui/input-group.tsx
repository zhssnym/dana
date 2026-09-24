import * as React from "react"

import { Button } from "./button.js"
import { cn } from "./utils.js"

/*
A field with controls living inside its frame.

The composer was this shape written by hand: a bordered `<div>` with
`focus-within` styling, a textarea, and three buttons packed in beside it,
all held together by a class string. shadcn has a component for exactly that
and this project never installed it, which is what Imran meant by the chat
"still not following the shadcn UI code or structure": the thread was using
system *pieces* while its main assembly was bespoke.

Same names and `data-slot`s as upstream, so the structure reads the way the
reference does and anything written against shadcn's docs works here.

`align` is the whole idea. Addons sit `inline-start` / `inline-end` beside a
single-line field, or `block-start` / `block-end` above and below a multi-line
one, which is what a message composer wants: the text on its own line and the
controls on a row underneath, rather than a growing textarea shoving buttons
around as it grows.
*/
function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        "group/input-group relative flex w-full flex-col rounded-sm border border-input bg-background transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] outline-none",
        "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20",
        "has-[[data-align=block-end]]:pb-1 has-[[data-align=block-start]]:pt-1",
        /* An inline addon floats over the field's own line, so the field is
           padded out of its way rather than the two sharing a flex row,
           which is what lets the field keep growing without shoving the
           buttons sideways. Upstream does the same with `has-`. */
        "has-[[data-align=inline-start]]:[&_[data-input-group-control]]:pl-9",
        "has-[[data-align=inline-end]]:[&_[data-input-group-control]]:pr-9",
        className,
      )}
      {...props}
    />
  )
}

/*
A row of controls attached to the field.

`inline-*` addons share the field's line; `block-*` addons take a line of
their own. A block addon is `min-h-8` so a row of icon buttons keeps the same
height whether it holds one or four, which is what stops the composer growing
and shrinking as its controls appear.
*/
function InputGroupAddon({
  className,
  align = "inline-start",
  ...props
}: React.ComponentProps<"div"> & {
  align?: "inline-start" | "inline-end" | "block-start" | "block-end"
}) {
  return (
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn(
        "flex items-center gap-0.5 text-muted-foreground",
        align === "block-start" || align === "block-end"
          ? "min-h-8 w-full px-1"
          : "absolute inset-y-0 z-10 shrink-0 px-1",
        /* Bottom-anchored, not centred: in a field that grows with its text,
           a centred control drifts down the side as the text wraps. Level
           with the last line is where the eye expects to press. */
        align === "inline-start" && "start-0 items-end pb-1",
        align === "inline-end" && "end-0 items-end pb-1",
        className,
      )}
      {...props}
    />
  )
}

/* The field itself. One line. */
function InputGroupInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input-group-input"
      data-input-group-control=""
      className={cn(
        "w-full min-w-0 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground md:text-xs/relaxed",
        className,
      )}
      {...props}
    />
  )
}

/* The field itself. Many lines, growing with what is typed into it. */
function InputGroupTextarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="input-group-textarea"
      data-input-group-control=""
      className={cn(
        "w-full min-w-0 resize-none bg-transparent px-3 py-2 text-sm outline-none [field-sizing:content] placeholder:text-muted-foreground md:text-xs/relaxed",
        className,
      )}
      {...props}
    />
  )
}

/* A control inside the group. It is the system's Button, narrowed to the
   sizes that fit in a field, so a composer's buttons and a dialog's buttons
   are the same component and cannot drift apart. */
function InputGroupButton({
  className,
  variant = "ghost",
  size = "xs",
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      data-slot="input-group-button"
      variant={variant}
      size={size}
      className={cn("shrink-0", className)}
      {...props}
    />
  )
}

/* A label or a unit riding inside the field, upstream's `InputGroupText`.
   Present so the set is complete and anything written against shadcn's docs
   works here without discovering a gap. */
function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="input-group-text"
      className={cn(
        "shrink-0 text-xs leading-4 text-muted-foreground",
        className,
      )}
      {...props}
    />
  )
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
}
