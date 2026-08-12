/*
The strings 9.3 writes word for word and this form renders.

Transcribed character for character from the numbered section beside each,
the same discipline `components/ui/copy.ts` keeps and for the same reason:
section 9's rule is "design may restyle, not reword", so a paraphrase here is
a specification change nobody recorded.

Two of these are names rather than copy, and 9.1's control table fixes them:
"Save" for the form's commit control and "Add step" for the steps editor's
append control. They sit here because this directory renders them and because
the table's own paragraph warns that three of its eight names begin with
"add"; a loose spelling puts the collision straight back.
*/

/** 9.3, and 8.4's own sentence: the warning before the cascade. */
export const CLEAR_DATE_WARNING =
  'Clearing the date also ends the repeat and removes the reminder.'

/** 9.3's "On disable, helper" column, which all three dependents share. */
export const DATE_DEPENDENT_HELPER = 'Set a due date first'

/** 9.3 validation copy: empty title. */
export const TITLE_REQUIRED = 'Give it a title'

/** 9.3 validation copy: over-limit fields. N is 10.3's number for the field. */
export function tooLong(limit: number): string {
  return `Too long: limit ${String(limit)} characters`
}

/** 9.3's cap notice, spelled at the P8 change control on 2026-08-11. */
export const STEP_CAP_NOTICE = 'Limit 50 steps'

/** 9.3: the expander seven of the ten fields sit behind. */
export const MORE_OPTIONS = 'More options'

/** 9.1's control table: the form's save control. */
export const SAVE = 'Save'

/** 9.1's control table: the steps editor's append control. */
export const ADD_STEP = 'Add step'

/** 9.3: the assignee dropdown's last entry, which opens the sharing flow. */
export const INVITE_BY_EMAIL = 'Invite by email'

/** 9.5: the banner a ghost's current occurrence opens with. */
export const UPCOMING_OCCURRENCE = 'Upcoming occurrence of a repeating task'

/**
 * 9.3's edit-mode warning when a move would strand the assignee.
 *
 * The section writes it with an example ("Moving will unassign Sara; she
 * isn't a member of Home."), so the name and the folder are the datum and
 * the rest is the copy. The pronoun is the one thing this specification
 * cannot supply from a row: 7.0's person shape carries a display name and no
 * gender, so "they" is used, which is the only rendering that is never wrong
 * about a person Dana has never asked.
 */
export function moveWouldUnassign(who: string, folder: string): string {
  return `Moving will unassign ${who}; they aren't a member of ${folder}.`
}
