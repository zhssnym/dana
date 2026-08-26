import * as React from "react"

import { cn } from "@/lib/utils"

/*
One turn in a conversation: who said it, what they said, and what happened to
it afterwards.

shadcn's messaging structure, in Dana's tokens — the reference Imran sent, and
then checked against the published component rather than remembered, which
corrected three things the first pass had wrong: there is a `MessageHeader`
(the sender's name, *above*) distinct from `MessageFooter` (status, below);
consecutive messages from one person group at the **message** level, not the
bubble level; and the avatar anchors to the message's **bottom** rather than
its top.

`Message` owns the *side*, and everything under it reads that side from one
place rather than each part deciding for itself. That was the real fault in
the thread this replaces: alignment was re-decided in six nested spans, each
with its own `mine && "flex-row-reverse"`, so changing one left the others
facing the wrong way.

Two of upstream's rules are worth restating because they look like mistakes
until you see them working:

- **The header stays start-aligned whichever side the message is on.** A name
  is a label for the run below it, and a label that swaps sides with its
  content is a label you have to find again each time.
- **The avatar sits at the bottom** of the message and rises when a footer
  appears, so it stays level with the message surface rather than drifting
  down beside a timestamp. In a run it appears once, at the last message,
  which is why the earlier ones reserve its width and draw nothing.
*/
function Message({
  className,
  align = "start",
  ...props
}: React.ComponentProps<"div"> & { align?: "start" | "end" }) {
  return (
    <div
      data-slot="message"
      data-align={align}
      className={cn(
        "group/message flex w-full items-end gap-2",
        align === "end" && "flex-row-reverse",
        className,
      )}
      {...props}
    />
  )
}

/*
Consecutive messages from one person, as one run.

The avatar belongs to the run rather than to each message in it, so the
earlier ones hold its width and draw nothing — which is what keeps three quick
messages reading as one thought instead of three separate arrivals.
*/
function MessageGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-group"
      className={cn("flex w-full flex-col gap-0.5", className)}
      {...props}
    />
  )
}

/* The face. A slot rather than an avatar, so a surface picks the size of face
   it wants and this file never learns what a person is. */
function MessageAvatar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-avatar"
      className={cn("shrink-0", className)}
      {...props}
    />
  )
}

function MessageContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-content"
      className={cn(
        "flex min-w-0 flex-col gap-0.5",
        "group-data-[align=end]/message:items-end",
        "group-data-[align=start]/message:items-start",
        className,
      )}
      {...props}
    />
  )
}

/* Who is speaking. Start-aligned on both sides, deliberately — see above. */
function MessageHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-header"
      className={cn(
        "flex items-center gap-2 self-start text-[12px] leading-4 text-[var(--color-graphite-400)]",
        className,
      )}
      {...props}
    />
  )
}

/* What happened to it: a time, "edited", a delivery state, the actions.
   Follows the message's side. */
function MessageFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-footer"
      className={cn(
        "flex items-center gap-1 text-[12px] leading-4 text-[var(--color-graphite-400)]",
        className,
      )}
      {...props}
    />
  )
}

/*
A line that is not a message: "recording…", a date, "3 earlier messages". It
spans the thread rather than taking a side, because it belongs to the
conversation and not to anybody in it.
*/
function Marker({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="marker"
      className={cn("flex w-full items-center justify-center py-1", className)}
      {...props}
    />
  )
}

function MarkerContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="marker-content"
      className={cn(
        "text-[12px] leading-4 text-[var(--color-graphite-500)]",
        className,
      )}
      {...props}
    />
  )
}

export {
  Marker,
  MarkerContent,
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageGroup,
  MessageHeader,
}
