/*
The strings 9.3 writes word for word and the task surface renders.

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

/**
 * The ten field names of 9.3's dependency table, first column.
 *
 * Names rather than copy, and they are here because the RFC 0002 change control
 * of 2026-08-13 made them normative: "Each field is announced by its own name,
 * which is the name in the first column and not a synonym for it... a field
 * labelled 'Task name' is the title field wearing a different word, and the
 * difference is invisible to everyone except a screen reader and a test." The
 * designer's prototype labels the first one "Task name" and renders the third
 * as a button called "Mark important"; both are corrected here, which is what
 * that paragraph was written for. Sentence case is not a rewording, which the
 * suite's own `formField` helper states in as many words.
 */
export const FIELD_TITLE = 'Title'
export const FIELD_DUE_DATE = 'Due date'
export const FIELD_IMPORTANT = 'Important'
export const FIELD_NOTES = 'Notes'
export const FIELD_FOLDER = 'Folder'
export const FIELD_ASSIGNEE = 'Assignee'
export const FIELD_DUE_TIME = 'Due time'
export const FIELD_REMINDER = 'Reminder'
export const FIELD_REPEAT = 'Repeat'
export const FIELD_STEPS = 'Steps'

/**
 * The three presets his date picker offers beside the calendar, ported at R7.
 *
 * They are affordances rather than copy: 9.3 fixes that the form carries an
 * inline quick-set for the due date and spells no control, so these are the
 * design's and are adopted with it. "Clear" is offered only while a date is
 * set, which is his behaviour, and it runs the same 8.4 warning any other way
 * of emptying the field runs.
 */
export const DATE_TODAY = 'Today'
export const DATE_TOMORROW = 'Tomorrow'
export const DATE_CLEAR = 'Clear'

/**
 * The form's dismiss control, named "Close" rather than the prototype's
 * "Cancel", and the reason is a collision rather than a preference.
 *
 * 9.1's names table gives every confirmation of 9.3 to 9.9 the two controls
 * "Continue" and "Cancel", and three of this form's own actions are
 * confirmations: the 8.4 clear-date warning, the delete confirm and 9.5's
 * un-complete confirm. A dismiss control also called "Cancel" would put two
 * controls of that name in one document exactly when a person is being asked
 * to decline something, which is the collision that table's own paragraph
 * exists to prevent. Section 9 names this control nowhere, so the shortest
 * true word is what it takes.
 */
export const CLOSE = 'Close'

/** 9.3's edit-mode delete, which lives in the form's overflow menu. */
export const DELETE_TASK = 'Delete task'

/**
 * The read-only history block of 9.3, added at the RFC 0002 change control on
 * 2026-08-13. Its two line labels and the block's own name are the designer's;
 * section 9 writes no copy for them, describing the block's contents instead.
 */
export const TASK_HISTORY = 'Task history'
export const CREATED = 'Created'
export const COMPLETED = 'Completed'

/**
 * 9.5's confirm before an un-complete that takes the G-SERIES successor, which
 * 9.3 takes "unchanged" for the form's completion control. Copy is normative:
 * the parenthesis is the part the person cannot see, 5.1 deleting the successor
 * with any edits already made to it.
 */
export const UNCOMPLETE_SERIES_CONFIRM =
  'This removes the next scheduled occurrence (including any edits to it). Continue?'

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
