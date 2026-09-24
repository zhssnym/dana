/*
The entry point for the designer's presentational components, ported at P8R
session R3, and the second importer of the single token file of 11.4.

Two things this file does, and the second is the one that will bite if it is
removed.

It re-exports the ported set, so a page imports from one place and this
directory can be reorganised without touching a page. His primitives under
`ui/` are deliberately not re-exported here for the reason `ui/index.ts`
records: his `Button` and the retiring P8 `Button` cannot both answer to one
name while both exist, so his twenty are imported by path, which is how that
distribution is meant to be consumed and how they already import each other.

And **it imports `styles/tokens.css`**, which is how that file reaches the
built stylesheet. Until R3 the only importer was `ui/index.ts`, whose export
list shrinks to nothing as R3 to R10 replace the markup that calls it, so a
page that imported only from here and no longer from there would have built a
client with no tokens at all and no error anywhere saying so. Vite treats a
CSS import as a side effect and emits one stylesheet for the entry chunk, so
importing it twice costs nothing and covers both entry points while both
exist.

That is still a first pass rather than a rule. The tidier arrangement is one
line in `main.tsx` beside the query client and the router, which is the
Frontend Architect's file and is requested in `README.md`; if it lands, both
imports come out and nothing else changes.
*/
import '../styles/tokens.css'

export { FolderGroupDialog } from './folder-group-dialog.js'
export { OfflineBanner } from './state-patterns.js'
