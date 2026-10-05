// The system pages as the lifted surfaces read them: a view of `navPages` in
// `routes.ts`, keyed by display name, not a second list.
import type { LucideIcon } from './icons.js'
import { DEFAULT_PINNED_KEYS, navPages } from '../routes.js'
import type { NavPage } from '../routes.js'

export type NavPageName = string

export interface NavPageModel {
  name: NavPageName
  icon: LucideIcon
  /** In the default pinned set. */
  pinned: boolean
  /** `false` for the one page a person may not unpin. */
  hideable: boolean
  /** The stable key the pin list stores. */
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

/** The page's question, or undefined for a name that is no page. */
export function pageQuestion(name: NavPageName): string | undefined {
  return navPages.find((page) => page.name === name)?.question
}

/** The page's own mark, or undefined for a name that is no page. */
export function pageGlyph(name: NavPageName): LucideIcon | undefined {
  return navPages.find((page) => page.name === name)?.icon
}
