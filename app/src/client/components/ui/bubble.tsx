import * as React from "react"

import { cn } from "./utils.js"

/* A message's body. Variants are tone, never hue (DES-143). */
function Bubble({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & { variant?: "default" | "muted" }) {
  return (
    <div
      data-slot="bubble"
      data-variant={variant}
      className={cn(
        "group/bubble inline-block max-w-[85%] rounded-lg transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
        variant === "muted"
          ? "bg-muted text-foreground"
          : "bg-foreground text-background",
        /* In a run, only the ends keep full corners on the run's side. */
        "group-data-[align=end]/message:[&:not(:first-child)]:rounded-tr-sm",
        "group-data-[align=end]/message:[&:not(:last-child)]:rounded-br-sm",
        "group-data-[align=start]/message:[&:not(:first-child)]:rounded-tl-sm",
        "group-data-[align=start]/message:[&:not(:last-child)]:rounded-bl-sm",
        className,
      )}
      {...props}
    />
  )
}

function BubbleContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="bubble-content"
      className={cn(
        "px-3 py-1.5 text-sm whitespace-pre-wrap",
        className,
      )}
      {...props}
    />
  )
}

/* Several bubbles from one person, in a run. */
function BubbleGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="bubble-group"
      className={cn("flex flex-col gap-0.5", className)}
      {...props}
    />
  )
}

/* Reactions, inside the bubble's own box. */
function BubbleReactions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="bubble-reactions"
      className={cn("flex flex-wrap items-center gap-1 px-3 pb-1.5", className)}
      {...props}
    />
  )
}

export { Bubble, BubbleContent, BubbleGroup, BubbleReactions }
