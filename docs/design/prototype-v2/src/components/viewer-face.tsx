/*
The viewer's own face, drawn once.

Four surfaces show it — the sidebar's account button, the Settings row, the
sharing panel's owner line and a folder page's member group — and before the
picture existed all four were spelling out an `Avatar` with the initials "IW"
by hand. Adding a picture to that arrangement means adding it four times and
forgetting one, which is [[DES-154]] at its smallest scale and exactly as
certain.
*/

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { useViewer } from "@/lib/viewer"

export function ViewerFace({
  className,
  size,
}: {
  className?: string
  size?: "sm"
}) {
  const viewer = useViewer()
  return (
    <Avatar size={size} className={className}>
      {viewer.image ? <AvatarImage src={viewer.image} alt="" /> : null}
      <AvatarFallback
        className={cn(
          "bg-[var(--color-graphite-200)] text-xs font-medium text-[var(--color-graphite-700)]",
        )}
      >
        {viewer.initials}
      </AvatarFallback>
    </Avatar>
  )
}
