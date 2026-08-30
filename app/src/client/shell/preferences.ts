/*
9.1's sidebar view preferences, and the only place this client stores one.

The section's own sentence, added by RFC 0002: "the sidebar's width and
whether it is collapsed to an icon rail are the viewer's, persisted
client-side, and change nothing about what the sidebar holds. This section
fixes the contents and their order; it fixes no width, and a persisted width
is a preference rather than a layout." AC-182 reads both across a full
document load.

**RFC 0005 rewrote 9.1 and that sentence did not survive it**, which is worth
saying here rather than leaving a quotation of something the contract no
longer carries. What is unchanged is everything this file does: both
preferences are still the viewer's, still persisted client-side, and AC-182
still reads both across a reload. What went with the sentence is its second
clause, the claim that the rail holds exactly what the open sidebar holds,
and `app-sidebar.tsx`'s rail paragraph records what stands in its place and
which criterion is escalated over it.

**localStorage rather than a cookie, and the choice is not a style.** The
designer's prototype keeps the width in localStorage and the shadcn primitive
under it writes the collapsed state into a `sidebar_state` cookie, because
that distribution is built for a server-rendered host that reads the cookie
before it paints. We have no such host: 11.1 gives the server a landing page
and the built client, and nothing on the server has ever read a preference.
What a cookie would buy here is nothing, and what it costs is real. It rides
every request the document makes, including every call to the section 7 API,
which puts a view preference on the wire that the frozen contract does not
give any endpoint. And 11.6's double-submit leaves exactly one readable
cookie in the browser, the CSRF token, which is a property the acceptance
suite reads directly when it picks that token out by being the only one; a
second readable cookie appearing the first time somebody collapses the
sidebar would break that read somewhere far from here. So both preferences
are localStorage, per origin, never sent, and `app-shell.tsx` clears the
cookie the primitive writes.

Every access is guarded. `localStorage` throws rather than returning null
when storage is disabled or a quota is exhausted, and a sidebar that cannot
render because a person turned off site data would be a worse failure than
one that forgets its width.
*/

/** One key each, namespaced so nothing else in this origin collides. */
const WIDTH_KEY = 'dana.sidebar-width'
const COLLAPSED_KEY = 'dana.sidebar-collapsed'

/**
 * The bounds a drag is clamped to.
 *
 * These are the designer's, read off `app-shell.tsx` in the prototype, and
 * they are behaviour rather than paint: what they fix is how far a person may
 * drag, not how anything is drawn. The width a person lands on is their own
 * datum, which is why it is written as a number here and never into
 * `tokens.css`, on the same reading 11.4 already gives a folder's colour.
 *
 * The default is deliberately absent: it is `--shell-sidebar-width` in
 * `tokens.css`, and the shell leaves the custom property unset until a person
 * has chosen a width of their own, so the design's value stays in the one
 * file 11.4 puts it in.
 */
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
    // Storage refused. The preference is lost at the next load and the
    // sidebar is otherwise unaffected, which is the whole cost.
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

/** Whether this viewer left the sidebar collapsed to its rail. */
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
