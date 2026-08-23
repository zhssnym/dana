import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

/*
`bare` mirrors `Textarea`'s, and exists for the same case: a field sitting
*inside* something that already draws the box — a search overlay's header row,
a link picker's framed row — where a second border would be a box in a box.
It keeps the type, the placeholder colour and the disabled behaviour and drops
only the frame, so the two are the same control at two depths rather than one
control and one hand-written span pretending to be one.
*/
function Input({
  className,
  type,
  bare = false,
  ...props
}: React.ComponentProps<"input"> & { bare?: boolean }) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "w-full min-w-0 text-sm outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs/relaxed file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-xs/relaxed",
        bare
          ? "bg-transparent"
          : "h-7 rounded-md border border-input bg-input/20 px-2 py-0.5 transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
