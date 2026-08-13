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

**What this barrel deliberately does not carry, as of package P8R session
R2.** The twenty shadcn primitives that landed beside it are absent from every
line below, and their absence is the decision rather than an oversight. Two of
them would collide outright: his `button.tsx` exports `Button`, which is the
name this file already gives the P8 client's own button, now at
`LegacyButton.tsx`. Re-exporting his under a second name would invent an alias
no section and no distribution uses, and would leave the two indistinguishable
at the call site, which is the one thing a reader needs to be able to tell
while both exist.

So his primitives are imported by path, `components/ui/button.js` and its
nineteen siblings, which is how shadcn components are meant to be consumed,
how his own prototype consumes them, and how they already import each other.
The exports below are the P8 set, and they shrink to nothing as R3 to R10
replace the markup that calls them; when the last consumer goes, so does this
file's list.
*/
import '../../styles/tokens.css'

export { Button, IconButton } from './LegacyButton.js'
export { Chip, initialsOf } from './Chip.js'
export type { ChipTone } from './Chip.js'
export { ConfirmDialog } from './ConfirmDialog.js'
export { OverflowMenu } from './OverflowMenu.js'
export type { MenuEntry } from './OverflowMenu.js'
export { QuickAddRow } from './QuickAddRow.js'
export type { QuickAddDefaults } from './QuickAddRow.js'
export { StarButton, starTooltip } from './StarButton.js'
export type { StarTooltipMode } from './StarButton.js'
export { TaskList, TaskRow } from './TaskRow.js'
export type { TaskListProps, TaskRowProps } from './TaskRow.js'
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
