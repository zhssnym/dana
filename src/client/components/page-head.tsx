// Helpers for a place page head: the breadcrumb trail and the cover state.
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
