/*
The page block as the lifted surfaces read it: `prototype-v2`'s
`lib/nav-model.ts`, rewritten over `routes.ts` (RFC 0004's S27).

**The one table stays `routes.ts`'s and this is a view of it.** The prototype
keys every page by its display name and declares `NAV_PAGES` with `name`,
`icon`, `pinned` and `hideable`, then answers `pageQuestion(name)` and
`pageGlyph(name)` from that array; `settings-page-content.tsx` and
`search-overlay.tsx` both import exactly those four names and nothing else
of the module. This client already holds the same facts in `routes.ts`, keyed
by 9.1's stable key and carrying the path a route needs, and 9.1 fixes the
order there. So the seam is a mapping and not a second list: a view added to
`navPages` appears in the pin list and among the places search offers without
anyone editing this file, which is DES-153's whole argument and the reason
the prototype reads a model rather than three switches.

**`pinned` is 9.1's default set and `hideable` is `pinnable`**, the two
vocabularies naming one fact each. The prototype's `hideable: false` is Desk
alone, as is this client's `pinnable: false`, and the reasoning is on the
`NavPage` interface in `routes.ts` rather than repeated here.

The name remains the lookup key on this side of the seam because the lifted
files hand one back, and 9.1 fixes the names as the strings a criterion
addresses, so they are as stable as the keys they stand for.
*/
import type { LucideIcon } from './icons.js'
import { DEFAULT_PINNED_KEYS, navPages } from '../routes.js'
import type { NavPage } from '../routes.js'

export type NavPageName = string

export interface NavPageModel {
  name: NavPageName
  icon: LucideIcon
  /** Shipped in the sidebar, 9.1's default set. */
  pinned: boolean
  /** `false` for the one page a person may not unpin. */
  hideable: boolean
  /** The 9.1 key, which is what 4.19's pin list stores. */
  key: NavPage['key']
  path: string
}

export const NAV_PAGES: readonly NavPageModel[] = navPages.map((page) => ({
  name: page.name,
  icon: page.icon,
  pinned: DEFAULT_PINNED_KEYS.includes(page.key),
  hideable: page.pinnable,
  key: page.key,
  path: page.path,
}))

/** The page's DES-152 question, or undefined for a name that is no page. */
export function pageQuestion(name: NavPageName): string | undefined {
  return navPages.find((page) => page.name === name)?.question
}

/** The page's own mark, or undefined for a name that is no page. */
export function pageGlyph(name: NavPageName): LucideIcon | undefined {
  return navPages.find((page) => page.name === name)?.icon
}

/** The page by name, for the seams that need its key or path. */
export function navPageNamed(name: NavPageName): NavPageModel | undefined {
  return NAV_PAGES.find((page) => page.name === name)
}
