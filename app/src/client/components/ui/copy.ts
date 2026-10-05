// Fixed component copy from spec section 9: design may restyle, not reword. Page copy
// and toasts live in the page layer and `api/queryClient.ts`.

/** Spec 9.4: abandon from My Day. */
export const ABANDON_CONFIRM =
  'Drop this task? It stops appearing in Today but stays everywhere else.'

/** Every row's and form's overflow menu. */
export const MORE_ACTIONS = 'More actions'

/** Two names, so each state of the icon-only toggle tells a screen reader something true. */
export const COMPLETE_TASK = 'Complete task'
export const MARK_AS_NOT_DONE = 'Mark as not done'

/** The sidebar's rail control, with a name per state. */
export const COLLAPSE_SIDEBAR = 'Collapse sidebar'
export const EXPAND_SIDEBAR = 'Expand sidebar'
/** The same control on a phone, where the sidebar is a drawer and it closes it. */
export const CLOSE_SIDEBAR = 'Close sidebar'

/**
 * The failed-read line, never the write-failure toast: nothing was being saved. AC-183
 * asserts it as one text run.
 */
export const READ_FAILED = "Couldn't load this. Nothing was changed."
export const TRY_AGAIN = 'Try again'
