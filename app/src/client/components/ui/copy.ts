/*
The strings section 9 writes word for word and this component set renders.

Transcribed character for character from the numbered section named beside each
one. Section 9's own rule is "design may restyle, not reword": a paraphrase here
is a specification change nobody recorded.

Copy that belongs to a page rather than to a component stays where the page
layer put it: the eight empty states of section 6 are `pages/empty-states.ts`,
and the toasts of 9.1 are decided once in `api/queryClient.ts`. This file is
only what a component in this directory renders.

The two confirmation controls are not here because they are not copy in the same
sense: "Continue" and "Cancel" are the accessible *names* 9.1's control table
fixes for every confirmation of 9.3 to 9.9, so they live with the dialog that
carries them, in `ConfirmDialog.tsx`, and are exact there.
*/

/** 9.4: abandon from My Day. */
export const ABANDON_CONFIRM =
  'Abandon this task? It stops appearing in Today but stays everywhere else.'

/**
 * 9.3: delete, which 9.4 also puts in a row's overflow menu. The task moves to
 * Trash, where it stays for thirty days, so the sentence does not say it cannot
 * be undone.
 */
export const DELETE_TASK_CONFIRM = 'Move this task to Trash? It stays there for 30 days.'

/**
 * The same confirmation for a selection. 9.3 writes the singular; this keeps
 * 9.3's shape and changes only its count.
 */
export function deleteTasksConfirm(count: number): string {
  return `Move ${count} tasks to Trash? They stay there for 30 days.`
}

/** The two controls of the task's delete confirms, naming what each does. */
export const DELETE_CONFIRM_LABEL = 'Delete'
export function keepLabel(count: number): string {
  return count === 1 ? 'Keep it' : 'Keep them'
}

/** 9.1's control table: every row's and every form's overflow menu. */
export const MORE_ACTIONS = 'More actions'

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
 * 9.1's inline state copy: the line a page shows beside a read that failed, and
 * the control 9.1's names table puts next to it.
 *
 * Never the global error toast. The two answer different questions: the toast
 * reports that a write did not land, and this line reports that a read did not
 * arrive, so a page showing "Nothing was saved" where nothing was being saved
 * tells a person something false about their own data. AC-183 asserts this
 * string as one text run, character for character.
 *
 * The other two strings of that table, the 404 line and the truncation notice,
 * are page states rather than component states and stay with the page layer,
 * which is the rule this file's header states.
 */
export const READ_FAILED = "Couldn't load this. Nothing was changed."
export const TRY_AGAIN = 'Try again'
