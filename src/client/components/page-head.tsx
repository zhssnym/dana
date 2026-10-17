// Helpers for a place page head: the breadcrumb trail, the cover state and the cover line.
import { Image as ImageIcon } from "../lib/icons.js"
import { Button } from "./ui/button.js"
import { resolveCover } from "./folder-cover.js"
// Covers are stored through `lib/page-identity.js`; its names are aliased here.
import { usePageIdentity as useFolderIdentity } from "../lib/page-identity.js"

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

/** The hidden height of a page's "Add cover" line. A head without a cover control draws it,
 * so every title starts at one height. */
export function CoverLine() {
  return (
    <div aria-hidden="true" className="[@media(hover:none)]:hidden">
      <Button variant="ghost" size="sm" tabIndex={-1} className="invisible">
        <ImageIcon />
        Add cover
      </Button>
    </div>
  )
}
