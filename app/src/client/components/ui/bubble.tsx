import * as React from "react"

import { cn } from "./utils.js"

/*
A message's body, in the shape it is spoken.

shadcn's own messaging primitives, in Dana's tokens. Imran sent them as the
reference for the thread, and they are the right shape: the bubble, the group
of bubbles one person sent in a row, and the reactions hanging off one, all
named, so the thread reads as an assembly of parts rather than as a wall of
divs holding a class string each.

**The two variants are tone, never hue** (DES-143). Mine sits on graphite-900
with light text; everyone else's sits on the graphite-50 wash. Colour is not
how you tell whose message this is, because colour in Dana means something
else and there are only so many meanings to go round.

`BubbleGroup` is why consecutive messages from one person do not each grow a
full set of corners: the run is one shape with the ends rounded and the joins
squared, which is what every messaging surface people already use does, and
what makes three quick messages read as one thought.
*/
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
        "group/bubble inline-block max-w-[85%] rounded-[14px] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
        variant === "muted"
          ? "bg-[var(--color-graphite-50)] text-[var(--color-graphite-800)]"
          : "bg-[var(--color-graphite-900)] text-[var(--color-graphite-0)]",
        /* Inside a group, only the ends of the run keep their full corners on
           the side the run is on. The group sets the side. */
        "group-data-[align=end]/message:[&:not(:first-child)]:rounded-tr-[6px]",
        "group-data-[align=end]/message:[&:not(:last-child)]:rounded-br-[6px]",
        "group-data-[align=start]/message:[&:not(:first-child)]:rounded-tl-[6px]",
        "group-data-[align=start]/message:[&:not(:last-child)]:rounded-bl-[6px]",
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
        "px-3 py-1.5 text-sm leading-5 whitespace-pre-wrap md:text-xs/relaxed",
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

/*
Reactions, attached to the bubble rather than floating under it.

They sit inside the bubble's own box and take its ground, so a like belongs to
a message visibly rather than by proximity, which matters in a thread where
the next message is eight pixels away.
*/
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
