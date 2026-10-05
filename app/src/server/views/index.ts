/* The 7.10 read paths, one entry point. Nothing here writes. */
export { plannedCalendarView } from './calendar.js'
export { completedPage as doneView } from './done.js'
export { folderCompletedView, folderOpenView } from './folder.js'
export { focusView } from './focus.js'
export {
  allView,
  importantView,
  plannedView,
  tasksView,
} from './lists.js'
export { myDayView } from './my-day.js'
export { searchPattern, searchView } from './search.js'
