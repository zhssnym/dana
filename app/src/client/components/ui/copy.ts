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

/** 9.4: the un-pull control on a row whose inclusion came from an entry. */
export const REMOVE_FROM_MY_DAY = 'Remove from My Day'

/** 9.1's control table: every row's and every form's overflow menu. */
export const MORE_ACTIONS = 'More actions'

/** 9.1's control table: the inline quick-add input of 9.1. */
export const ADD_A_TASK = 'Add a task'

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
