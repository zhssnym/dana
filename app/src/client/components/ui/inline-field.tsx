import * as React from "react"

import { cn } from "./utils.js"

/* A field that renders as the text it edits: hover ground, ring only on focus. */
const inlineFieldClass =
  "-mx-1 w-[calc(100%+0.5rem)] min-w-0 rounded-sm bg-transparent px-1 outline-none transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] placeholder:text-quiet-foreground hover:bg-accent focus:bg-background focus:ring-1 focus:ring-primary"

function InlineInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="inline-input"
      className={cn(inlineFieldClass, className)}
      {...props}
    />
  )
}

function InlineTextarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="inline-textarea"
      className={cn(
        inlineFieldClass,
        "block resize-none [field-sizing:content]",
        className,
      )}
      {...props}
    />
  )
}

export { InlineInput, InlineTextarea, inlineFieldClass }
