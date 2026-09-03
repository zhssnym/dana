/*
The read paths of frozen 7.10, one entry point.

Every function here answers one endpoint's body from one section 6 query, and
none of them writes: this package has no mutation, no transaction and no
state machine, so the whole of what it can get wrong is an ordering, a
predicate, a scope or a cursor. The router validates and serializes; the
predicates and orders live behind this barrel so a reader comparing them to
section 6 opens one directory.
*/
export { plannedCalendarView } from './calendar.js'
export { completedPage as doneView } from './done.js'
export { folderCompletedView, folderOpenView } from './folder.js'
export {
  allView,
  importantView,
  plannedView,
  tasksView,
} from './lists.js'
export { myDayView } from './my-day.js'
export { searchPattern, searchView } from './search.js'
