/*
The strings section 9 writes word for word and this component set renders.

Transcribed character for character from the numbered section named beside
each one. Section 9's own rule is "design may restyle, not reword", and the
persona that owns this directory exists partly to keep that true: a paraphrase
here is a specification change nobody recorded.

Copy that belongs to a page rather than to a component stays where the page
layer put it: the eight empty states of section 6 are `pages/empty-states.ts`,
and the toasts of 9.1 are decided once in `api/queryClient.ts`. This file is
only what a component in this directory renders.

The two confirmation controls are not here because they are not copy in the
same sense: "Continue" and "Cancel" are the accessible *names* 9.1's control
table fixes for every confirmation of 9.3 to 9.9, so they live with the
dialog that carries them, in `ConfirmDialog.tsx`, and are exact there.
*/

/** 9.4: abandon from My Day. */
export const ABANDON_CONFIRM =
  'Abandon this task? It stops appearing in My Day but stays everywhere else.'

/** 9.3: delete, which 9.4 also puts in a row's overflow menu. */
export const DELETE_TASK_CONFIRM = "Delete this task? This can't be undone."

/**
 * The same confirmation for a selection, S23a. 9.3 writes the singular and
 * nothing in section 9 writes a plural, because the bar that deletes several
 * at once arrived with item 44's ruling rather than with the section; the
 * sentence keeps 9.3's shape and changes only its count. Recorded at RFC
 * 0005 change control item 52.
 */
export function deleteTasksConfirm(count: number): string {
  return `Delete these ${count} tasks? This can't be undone.`
}

/**
 * 9.4: the un-pull control on a row whose inclusion came from an entry.
 *
 * The v2 section renames the page and the control together, "the control
 * reading 'Remove from Today'", and AC-165 was amended to quote the new string
 * at RFC 0005's change control item 8. The constant is renamed with its value
 * rather than left holding a name the string no longer matches.
 */
export const REMOVE_FROM_TODAY = 'Remove from Today'

/** 9.1's control table: every row's and every form's overflow menu. */
export const MORE_ACTIONS = 'More actions'

/** 9.1's control table: the inline quick-add input of 9.1. */
export const ADD_A_TASK = 'Add a task'

/**
 * 9.1's control table, added there at the P8R mid-package change control on
 * 2026-08-13: the quick-add's escalation control.
 *
 * A fixed string and never interpolated with the folder the quick-add sits
 * beside, which is that table's own sentence: "a name in this table is a
 * fixed string and the region rule below is what tells two instances apart".
 * Deliberately not "More options", which 9.3 spends on the task form's
 * expander; the form is a dialog over the page, so both are in one document
 * whenever the escalation is used.
 */
export const OPEN_FULL_FORM = 'Open full form'

/**
 * 9.1's control table: a task row's completion checkbox and the task form's
 * completion control, which are one control pointed at one object from two
 * places. Two names rather than one for 9.5's reason at the star: the control
 * is an icon-only toggle, so each state owes a screen reader something true.
 */
export const COMPLETE_TASK = 'Complete task'
export const MARK_AS_NOT_DONE = 'Mark as not done'

/**
 * 9.1's control table: the sidebar's rail control, two names for the same
 * reason the completion control has two.
 */
export const COLLAPSE_SIDEBAR = 'Collapse sidebar'
export const EXPAND_SIDEBAR = 'Expand sidebar'

/**
 * 9.5, closed at the P8 change control on 2026-08-11: off Important the
 * star's name is its own state, and that name is also its tooltip. Two
 * strings rather than one because the star is an icon-only toggle, so each
 * state owes a screen reader something true.
 */
export const STAR_ON = 'Important'
export const STAR_OFF = 'Mark as important'

/** 9.5: an abandoned row's chip and its restore control. */
export const ABANDONED_CHIP = 'Abandoned'
export const RESTORE = 'Restore'

/**
 * 9.1's inline state copy: the line a page shows beside a read that failed,
 * and the control 9.1's names table puts next to it.
 *
 * Never the global error toast, restated by RFC 0002 at the change control of
 * 2026-08-13 because the designer's prototype renders the toast string here
 * and annotates the substitution as an open decision on its own states page.
 * It is not open. The two answer different questions: the toast reports that
 * a write did not land, and this line reports that a read did not arrive, so
 * a page showing "Nothing was saved" where nothing was being saved tells a
 * person something false about their own data. AC-183 asserts this string as
 * one text run, character for character.
 *
 * The other two strings of that table, the 404 line and the truncation
 * notice, are page states rather than component states and stay with the page
 * layer, which is the rule this file's header states.
 */
export const READ_FAILED = "Couldn't load this. Nothing was changed."
export const TRY_AGAIN = 'Try again'
