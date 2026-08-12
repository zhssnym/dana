/*
The two strings 9.9 and section 6 write for this overlay, transcribed
character for character from the sections named beside them.

The footer is the one thing on the page that tells a person the scope they are
searching, which is Q8's ACCESSIBLE(V) rather than the folder they were
looking at, so it is copy in the strongest sense section 9 means: restyle,
never reword.

The empty state is Q8's own, and it lives here rather than in
`pages/empty-states.ts` because the overlay is not a page and does not go
through `PageBody`: 9.9 gives it no loading skeleton and no inline retry, and
a search that has not been typed yet is not an empty result.
*/

/** 9.9's footer. */
export const SEARCH_FOOTER = 'Showing matches from every folder you can access.'

/** 6 Q8's empty state. */
export const SEARCH_EMPTY = 'No matches for that search.'
