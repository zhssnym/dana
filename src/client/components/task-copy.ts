// Fixed task copy from spec 9.3: design may restyle, not reword.

/** The warning before clearing a date also ends repeat and reminder. */
export const CLEAR_DATE_WARNING =
  'Clearing the date also ends the repeat and removes the reminder.'

export const TITLE_REQUIRED = 'Give it a title'

/** N is the field's limit. */
export function tooLong(limit: number): string {
  return `Too long: limit ${String(limit)} characters`
}

/** The assignee menu's last entry. */
export const INVITE_BY_EMAIL = 'Invite by email'

/** The confirm before un-completing removes the next occurrence and its edits. */
export const UNCOMPLETE_SERIES_CONFIRM =
  'This removes the next scheduled occurrence (including any edits to it). Continue?'

/** The banner a ghost's current occurrence opens with. */
export const UPCOMING_OCCURRENCE = 'Upcoming occurrence of a repeating task'
