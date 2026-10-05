import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "./utils.js"

// `bare`: a field inside something that already draws the box.
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
          : "h-[var(--control-height)] px-2 rounded-md border border-input bg-background focus-visible:border-ring aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
