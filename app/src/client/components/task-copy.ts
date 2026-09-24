/*
The strings 9.3 writes word for word and the task surface renders.

Transcribed character for character from the numbered section beside each,
the same discipline `components/ui/copy.ts` keeps and for the same reason:
section 9's rule is "design may restyle, not reword", so a paraphrase here is
a specification change nobody recorded.

Two of these are names rather than copy, and 9.1's control table fixes them:
"Save" for the form's commit control and "Add subtask" for the subtasks editor's
append control. They sit here because this directory renders them and because
the table's own paragraph warns that three of its eight names begin with
"add"; a loose spelling puts the collision straight back.
*/

/** 9.3, and 8.4's own sentence: the warning before the cascade. */
export const CLEAR_DATE_WARNING =
  'Clearing the date also ends the repeat and removes the reminder.'

/** 9.3 validation copy: empty title. */
export const TITLE_REQUIRED = 'Give it a title'

/** 9.3 validation copy: over-limit fields. N is 10.3's number for the field. */
export function tooLong(limit: number): string {
  return `Too long: limit ${String(limit)} characters`
}

/** 9.3's cap notice. */
export const STEP_CAP_NOTICE = 'Limit 50 subtasks'

/** 9.3: the assignee dropdown's last entry, which opens the sharing flow. */
export const INVITE_BY_EMAIL = 'Invite by email'
export const DATE_CLEAR = 'Clear'

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
