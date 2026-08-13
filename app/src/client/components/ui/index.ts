/*
The component library of 11.4, as one entry point.

Two things this file does, and the second is the load-bearing one.

It re-exports the set, so a page imports from one place and the directory
underneath can be reorganised without touching a page.

And **it imports the token file**, which is how `styles/tokens.css` reaches
the built stylesheet at all. Nothing else in this client imports CSS: the
entry point (`main.tsx`) belongs to the Frontend Architect and this role does
not edit it, so the single token file of 11.4 is pulled in by the single
component entry point of 11.4, which every page reaches through the rows it
renders. Vite treats a CSS import as a side effect and emits one stylesheet
for the entry chunk, so the tokens are global regardless of which page is
open, and a page that renders no row still gets them.

That is a first pass rather than a rule. The tidier arrangement is one line in
`main.tsx`, beside the query client and the router, and it is requested in
`components/README.md`; if it lands, this import comes out and nothing else
changes.

**What this barrel deliberately does not carry.** The twenty shadcn
primitives are imported by path, `components/ui/button.js` and its siblings,
which is how shadcn components are meant to be consumed, how his own
prototype consumes them, and how they already import each other.

The P8 export list this file once held shrank exactly as its own note said it
would: the polish pass after R11 retired the last legacy components
(`LegacyButton`, `Chip`, `StarButton`, the P8 `TaskRow`, `QuickAddRow` and
`OverflowMenu`), their consumers all rebuilt on the primitives. What remains
is the one shared dialog every confirmation uses and the copy module.
*/
import '../../styles/tokens.css'

export { ConfirmDialog } from './ConfirmDialog.js'
export {
  ABANDONED_CHIP,
  ABANDON_CONFIRM,
  ADD_A_TASK,
  COLLAPSE_SIDEBAR,
  COMPLETE_TASK,
  DELETE_TASK_CONFIRM,
  EXPAND_SIDEBAR,
  MARK_AS_NOT_DONE,
  MORE_ACTIONS,
  OPEN_FULL_FORM,
  READ_FAILED,
  REMOVE_FROM_MY_DAY,
  RESTORE,
  STAR_OFF,
  STAR_ON,
  TRY_AGAIN,
} from './copy.js'
