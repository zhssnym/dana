/*
The names and copy the v2 card's chip strip renders.

Same discipline as `ui/copy.ts` and `task-form/copy.ts`: a string section 9
writes is transcribed character for character, and a string section 9 does
not write is named here once so that one file decides it.

**The five chip names are deliberately not the ten field names of 9.3's v1
table.** That table is still implemented by the fields below the strip and
its names are still normative there, so a chip called "Due date" would put
two controls of one name on one surface and the suite's `formField` helper,
which addresses a field by its label, would resolve both. Each name below
therefore says the same thing in the strip's own voice: it announces the
field, it is unique in the document, and it is what a screen reader reads
before the value. This is an interim of the reunion 9.3's v2 opening asks for
and is recorded as such in `chips.tsx`.
*/

/** The strip's five chips, each announced before its value. */
export const CHIP_DUE = 'Due'
export const CHIP_FOLDER = 'In folder'
export const CHIP_ASSIGNEE = 'Assigned to'
export const CHIP_REMINDER = 'Task reminder'
export const CHIP_REPEAT = 'Repeats'

/** The two pickers that open as their own surface, named for a reader. */
export const PICKER_DUE = 'Due date'
export const PICKER_REMINDER = 'Reminder'

/** The reminder picker's one control: 9.3's "a time on that day". */
export const REMINDER_TIME = 'Reminder time'

/** What the reminder chip reads with none set. */
export const REMINDER_NONE = 'None'

/**
 * 9.3's v2 assignee row: "Unassigned", offered last after a separator, which
 * is the way out the v1 dropdown never had (DES-194, section 13 item 28).
 */
export const UNASSIGNED = 'Unassigned'

/** 9.3's "On disable, helper" column, shared with the fields below. */
export { DATE_DEPENDENT_HELPER } from '../task-form/copy.js'
