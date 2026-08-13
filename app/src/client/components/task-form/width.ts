/*
9.3's form width, which that section made a view preference at the RFC 0002
change control on 2026-08-13: "The form's width is the viewer's, persisted
client-side, on the sidebar's rule in 9.1: this section fixes what the form
holds and in what order, and fixes no width." AC-182 reads it across a full
document load.

This is `shell/preferences.ts` for the other handle, deliberately kept beside
the surface it belongs to rather than folded into that file: 9.1's sentence
governs the sidebar and 9.3's governs the form, the two are different keys with
different bounds, and `shell/` is the Frontend Architect's directory while this
one is this role's.

**localStorage rather than a cookie**, for the reason `shell/preferences.ts`
records at length and which holds identically here: 11.6's double-submit leaves
exactly one readable cookie in the browser, and the acceptance suite picks the
CSRF token out by being the only one, so a second readable cookie appearing the
first time somebody drags this handle would break a read far from here.

Every access is guarded, on the same ground: `localStorage` throws rather than
answering null when site data is disabled or a quota is exhausted, and a task
form that would not open because a person turned off storage is a worse failure
than one that forgets its width.
*/

const WIDTH_KEY = 'dana.task-form-width'

/**
 * The bounds a drag is clamped to and the width a viewer who has chosen none
 * gets, all three the designer's, read off `task-form.tsx` in the prototype.
 *
 * They are behaviour rather than paint: what they fix is how far a person may
 * drag, not how anything is drawn, and the width a person lands on is their own
 * datum. That is why they are numbers here and not entries in `tokens.css`, on
 * the same reading 11.4 already gives a folder's colour. The default is
 * duplicated in `tokens.css` as the fallback of `var(--task-form-width, 540px)`,
 * which is the value that applies before this module has an answer.
 */
export const TASK_FORM_DEFAULT_WIDTH = 540
export const TASK_FORM_MIN_WIDTH = 480
export const TASK_FORM_MAX_WIDTH = 720

export function clampTaskFormWidth(width: number): number {
  return Math.min(TASK_FORM_MAX_WIDTH, Math.max(TASK_FORM_MIN_WIDTH, width))
}

/** The width this viewer chose, or the design's while they have chosen none. */
export function readTaskFormWidth(): number {
  try {
    const stored = window.localStorage.getItem(WIDTH_KEY)
    if (stored === null) return TASK_FORM_DEFAULT_WIDTH
    const width = Number(stored)
    return Number.isFinite(width) ? clampTaskFormWidth(width) : TASK_FORM_DEFAULT_WIDTH
  } catch {
    return TASK_FORM_DEFAULT_WIDTH
  }
}

export function writeTaskFormWidth(width: number): void {
  try {
    window.localStorage.setItem(WIDTH_KEY, String(clampTaskFormWidth(width)))
  } catch {
    // Storage refused. The preference is lost at the next load and the form is
    // otherwise unaffected, which is the whole cost.
  }
}
