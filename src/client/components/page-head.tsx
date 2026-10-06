// The shared head of a place page: cover, mark, title with its fact, description.
// A system page's mark is not pickable; a folder's is.

import { type ComponentPropsWithoutRef } from "react"


import { type LucideIcon } from "../lib/icons.js"
import { resolveCover } from "./folder-cover.js"
import { T_FAST } from "./task-row.js"
// Covers are stored through `lib/page-identity.js`; its names are aliased here.
import { usePageIdentity as useFolderIdentity } from "../lib/page-identity.js"
import { cn } from "./ui/utils.js"

// A long trail keeps the root and the nearest parents; the middle folds into "…".
export function crumbTrail<T>(crumbs: readonly T[], keep = 4): (T | null)[] {
  if (crumbs.length <= keep) return [...crumbs]
  return [crumbs[0] as T, null, ...crumbs.slice(crumbs.length - (keep - 2))]
}

// Asks the same question as `PageCover`: a stored key that resolves to nothing is
// not a drawn cover.
export function usePageHasCover(storageName: string) {
  const identity = useFolderIdentity(storageName)
  return Boolean(
    resolveCover(identity.cover, storageName, identity.coverPos ?? 50),
  )
}

// The page mark. A folder's opens the icon picker; a system page's is not a control.
export function PageMark({
  icon: Icon,
  hasCover,
  color,
  interactive = false,
  className,
  ...rest
}: {
  icon: LucideIcon
  hasCover: boolean
  // A folder's chosen colour; a system page passes nothing.
  color?: string
  interactive?: boolean
} & Omit<ComponentPropsWithoutRef<"button">, "color">) {
  const body = (
    <>
      {interactive ? (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 rounded-full bg-accent opacity-0 transition-opacity group-hover/mark:opacity-100 group-focus-visible/mark:opacity-100",
            T_FAST,
          )}
        />
      ) : null}
      <Icon
        className={cn("relative", hasCover ? "size-10" : "size-8")}
        style={color ? { color } : undefined}
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </>
  )

  const shape = cn(
    "relative flex shrink-0 items-center justify-center text-foreground",
    hasCover ? "z-40 -ml-1.5 -mt-9 size-14" : "-ml-1.5 size-10",
    className,
  )

  if (!interactive) return <div className={shape}>{body}</div>

  return (
    <button type="button" className={cn("group/mark rounded-full", shape)} {...rest}>
      {body}
    </button>
  )
}

