/*
 * The sidebar's width and collapsed state, in localStorage (AC-182 reads both across a reload). Not a cookie:
 * it would ride every API request, and the CSRF token must stay the only readable cookie. Every access is
 * guarded: localStorage throws when storage is disabled or full.
 */

/** One key each. Never rename them. */
const WIDTH_KEY = 'dana.sidebar-width'
const COLLAPSED_KEY = 'dana.sidebar-collapsed'

/** Drag bounds. The default width is `--shell-sidebar-width` in `tokens.css`, unset here until the viewer drags. */
export const SIDEBAR_MIN_WIDTH = 224
export const SIDEBAR_MAX_WIDTH = 360

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width))
}

/** The width this viewer chose, or null while they have chosen none. */
export function readSidebarWidth(): number | null {
  try {
    const stored = window.localStorage.getItem(WIDTH_KEY)
    if (stored === null) return null
    const width = Number(stored)
    return Number.isFinite(width) ? clampSidebarWidth(width) : null
  } catch {
    return null
  }
}

export function writeSidebarWidth(width: number): void {
  try {
    window.localStorage.setItem(WIDTH_KEY, String(clampSidebarWidth(width)))
  } catch {
    // Storage refused: the preference is lost at the next load, nothing else.
  }
}

/** Forgets the chosen width, so the sidebar falls back to the design's. */
export function clearSidebarWidth(): void {
  try {
    window.localStorage.removeItem(WIDTH_KEY)
  } catch {
    // As above.
  }
}

export function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, String(collapsed))
  } catch {
    // As above.
  }
}
