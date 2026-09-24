import * as React from "react"

import { cn } from "./utils.js"

/* Grows with its content. `bare`: inside something that already draws the box. */
function Textarea({
  className,
  bare = false,
  ...props
}: React.ComponentProps<"textarea"> & { bare?: boolean }) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "w-full min-w-0 resize-none text-sm text-foreground outline-none [field-sizing:content] placeholder:text-quiet-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        bare
          ? "bg-transparent"
          : "px-2 py-1.5 rounded-md border border-input bg-background focus-visible:border-ring aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
