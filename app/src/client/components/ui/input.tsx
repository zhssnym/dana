import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "./utils.js"

/* `bare`: a field inside something that already draws the box. */
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
        "w-full min-w-0 text-sm text-foreground outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-foreground placeholder:text-quiet-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        bare
          ? "bg-transparent"
          : "h-8 px-2 rounded-sm border border-input bg-background transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
