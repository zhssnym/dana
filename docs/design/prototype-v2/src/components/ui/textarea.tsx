import * as React from "react"

import { cn } from "@/lib/utils"

/*
The primitive that was missing.

shadcn ships a Textarea and this project never installed one, so every
multi-line field in the prototype was a bare `<textarea>` with its own class
string: the comment composer, the reply editor, a task's notes, a folder's
description, a section's paragraph. Six fields, six spellings of the same
border, radius, ring and placeholder — and the conversation was the one Imran
noticed, because a composer sits at eye level next to messages that *are*
styled by the system.

Written in the house's own shape rather than copied from upstream: `data-slot`
for the same reason `Input` carries one, `field-sizing: content` so a field
grows with what is typed into it without a resize handle or a scroll bar
(which is what the hand-rolled ones were each reinventing), and `resize-none`
for the same reason. The border, ring and placeholder tokens are `Input`'s,
because a one-line field and a many-line field are the same control with a
different number of lines and should not disagree about what focus looks like.

`bare` is the composer's case and is deliberately narrow: a textarea sitting
*inside* something that already draws the box — the composer's own bordered
row, with the send and attach buttons beside it — must not draw a second one.
It gets the same type, colour and growth behaviour and skips only the frame.
*/
function Textarea({
  className,
  bare = false,
  ...props
}: React.ComponentProps<"textarea"> & { bare?: boolean }) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "w-full min-w-0 resize-none text-sm text-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-xs/relaxed",
        bare
          ? "bg-transparent"
          : "rounded-md border border-input bg-input/20 px-2 py-1 transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
