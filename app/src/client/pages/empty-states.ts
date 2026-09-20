/*
The empty copy of section 6, one string per page, transcribed.

Copy in these sections is normative ("design may restyle, not reword"), so
each string below is character for character its query's own. They are
collected here rather than written into the pages so that the page reads as
structure and the copy reads as a contract, and so that a reviewer comparing
them to section 6 has one file to compare.
*/

/* The two strings below moved with issue #216 and #217, in section 6 and
   here in the same change, because both described a page whose membership is
   a due date and neither page's is any more. Q1 admits a task from the day
   its Schedule begins and Q3 holds everything carrying either date, so the
   old copy told a person the one thing they could do to reach the page was
   the one thing they might not have to do. */

/** Q1, both My Day groups empty. */
export const MY_DAY_EMPTY =
  'Nothing on your day. Tasks assigned to you appear here when they start ' +
  'or come due, or pull anything in yourself.'

/** Q2. */
export const TASKS_EMPTY = 'No undated tasks. Anything you capture without a date lands here.'

/** Q3. */
export const PLANNED_EMPTY =
  'Nothing scheduled. Give any task a start or due date and it moves here.'

/** Q4. */
export const IMPORTANT_EMPTY = 'Nothing marked important. Star any task and it shows up here.'

/** Q5. */
export const ALL_EMPTY = 'Nothing here yet. Add your first task with the + button.'

/** Q6. */
export const DONE_EMPTY = 'Nothing completed yet. Finished tasks build your history here.'

/** Q7, both open sections empty. */
export const FOLDER_EMPTY = 'No tasks yet. Add one below.'

/** Q8. */
export const SEARCH_EMPTY = 'No matches for that search.'

/*
The two strings below are not section 6's, and the difference is stated rather
than blurred.

Every string above is a query's own empty state, transcribed. Assignments and
Abandoned have none, because neither is a query: section 6's v2 preamble says
so of Assignments in terms, and Abandoned is a client-side narrowing of Q5 by
status. Section 9 writes no copy for either, and a page that arrives empty
with nothing to say is the state the other eight all have words for.

So these are this package's, written in the register of the eight above (what
the page holds, then how something gets here), and recorded as change control
in RFC 0005 rather than slipped in. They are the only copy S10 authored.
*/

/** 9.5's Assignments, which is a composition rather than a query. */
export const ASSIGNMENTS_EMPTY =
  'Nothing assigned yet. Open tasks appear here under whoever is carrying them.'

/** 9.5's Abandoned, likewise. */
export const ABANDONED_EMPTY =
  'Nothing abandoned. Tasks you decide not to do wait here in case you change your mind.'
