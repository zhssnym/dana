/*
What is left of the provisional task row.

The shell session wrote this file as "the least that lets a page render" and
said in its header and in `src/client/README.md` that it should shrink toward
nothing when the component library landed. It has: the row is now
`components/ui/TaskRow.tsx`, with the adornments, the states and the
accessibility 9.4 and section 6 enumerate, and this file is the import path
the pages already use pointing at it.

It is a re-export and not a wrapper, so nothing can drift between the two.

**What is owed here is a deletion nobody in this package may make.** The five
pages that import from this path are the Frontend Architect's files, and
repointing their imports at `components/ui` is the one change that removes
this file; it is requested in `components/README.md`. Until then this line is
what keeps the pages working without an edit outside this role's paths.
*/
export { TaskList, TaskRow } from '../components/ui/index.js'
export type { TaskListProps, TaskRowProps } from '../components/ui/index.js'
