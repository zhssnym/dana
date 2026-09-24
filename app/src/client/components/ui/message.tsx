import * as React from "react"

import { cn } from "./utils.js"

/* One turn in a conversation; `Message` owns the side and its parts read it. */
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

/* Consecutive messages from one person, as one run. */
function MessageGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-group"
      className={cn("flex w-full flex-col gap-0.5", className)}
      {...props}
    />
  )
}

/* The face slot; the surface picks the avatar. */
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

/* Who is speaking, on the author's side above the bubble. */
function MessageHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-header"
      className={cn(
        "flex items-center gap-2 self-start text-xs text-quiet-foreground group-data-[align=end]/message:self-end",
        className,
      )}
      {...props}
    />
  )
}

/* Time, "edited", delivery state, actions; follows the message's side. */
function MessageFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-footer"
      className={cn(
        "flex items-center gap-1 text-xs text-quiet-foreground",
        className,
      )}
      {...props}
    />
  )
}

/* A thread-wide line that is not a message: a date, "3 earlier messages". */
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
        "text-xs text-muted-foreground",
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
