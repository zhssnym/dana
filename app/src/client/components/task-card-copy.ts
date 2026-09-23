/*
The names and copy the v2 card's chip strip renders.

Same discipline as `ui/copy.ts` and `task-form/copy.ts`: a string section 9
writes is transcribed character for character, and a string section 9 does
not write is named here once so that one file decides it.

**The five chip names are 9.3's own field names.** 9.1's addressing
paragraph is why: "every control
this section names is reachable by its accessible role and by its normative
name", and a strip whose chips did not say which field they were would be
five values and no questions.

A chip announces its field and then reads its value, which is why the two
appear together in its accessible name. That is a control whose visible text
is data rather than a label, and the announcement is what a screen reader
needs before the value means anything.
*/

/** The five fields of 9.3's v2 table that the header strip carries. */
export const CHIP_DUE = 'Due date'
export const CHIP_FOLDER = 'Folder'
export const CHIP_ASSIGNEE = 'Assignee'
export const CHIP_REMINDER = 'Reminder'
export const CHIP_REPEAT = 'Repeat'

/** The pickers that open as their own surface, named for a reader. */
export const PICKER_DUE = 'Due date'
export const PICKER_REMINDER = 'Reminder'
export const PICKER_REPEAT = 'Repeat'

/** The reminder picker's one control: 9.3's "a time on that day". */
export const REMINDER_TIME = 'Reminder time'

/** What the reminder chip reads with none set. */
export const REMINDER_NONE = 'None'

/**
 * The due time a v1 task may still carry.
 *
 * 9.3's v2 due row: "a day; the pickers offer no time of day (a stored
 * due_time from v1 is displayed and clearable, never settable)". So there is
 * no control that sets one, and there is a control that removes one, and both
 * halves of that sentence need words.
 */
export const DUE_TIME_SHOWN = 'Due time'
export const DUE_TIME_CLEAR = 'Remove the time'

/**
 * The operands a repeat preset asks for, labelled.
 *
 * 9.3 enumerates the presets and their operands and writes no copy for the
 * labels, the same way it writes none for the date picker's own affordances,
 * so these are the design's and are named once here.
 */
export const REPEAT_ON = 'Repeat on'
export const REPEAT_EVERY = 'Repeat every'
export const REPEAT_ON_DAY = 'Repeat on day'
export const REPEAT_ENDS_ON = 'Ends on'

/**
 * 9.3's v2 assignee row: "Unassigned", offered last after a separator, which
 * is the way out the v1 dropdown never had.
 */
export const UNASSIGNED = 'Unassigned'


