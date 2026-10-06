// The system pages as the lifted surfaces read them: a view of `navPages` in
// `routes.ts`, keyed by display name, not a second list.
import type { LucideIcon } from './icons.js'
import { navPages } from '../routes.js'


export type NavPageName = string

/** The page's own mark, or undefined for a name that is no page. */
export function pageGlyph(name: NavPageName): LucideIcon | undefined {
  return navPages.find((page) => page.name === name)?.icon
}
