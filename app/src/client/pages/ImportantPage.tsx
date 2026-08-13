/*
9.5's Important page: a single list per Q4, one region, no quick-add.

The designer's `src/screens/important-screen.tsx`, ported at P8R session R6.
9.1 puts the inline quick-add at the bottom of Tasks groups, the Planned list
and the folder page's open list, and this page is none of them; 9.1's region
table says Important carries one section and needs no name. So this page is the
plain case, and it is here to be the plain case: whatever a page needs beyond
rows and a state, it declares itself.

**The star points outward here and nowhere else.** Q4 gives this page the
outward tooltip, "Also in Planned, due ..." and "Also in Tasks, in Work", and
`presenters.ts` composes it; the star's accessible name stays "Important",
which is what AC-055 and AC-099 address it by. The mode is a page-level fact
passed down, because a component that read the route would behave differently
depending on where it was mounted.
*/
import { Star } from 'lucide-react'

import { useImportantView } from '../api/queries.js'
import { useRowActions } from '../parts/useRowActions.js'
import { PageBody } from '../states/PageStates.js'
import { IMPORTANT_EMPTY } from './empty-states.js'
import { PageHeading } from './page-heading.js'
import { ConfirmDialog, TaskRows, useConfirm, useRowBasis } from './task-rows.js'

export function ImportantPage(): React.JSX.Element {
  const view = useImportantView()
  const actions = useRowActions()
  const confirm = useConfirm()
  const basis = useRowBasis()

  return (
    <div className="space-y-7">
      <PageHeading icon={Star} title="Important" subtitle="Starred tasks" />
      <PageBody
        query={view}
        isEmpty={(view.data?.rows.length ?? 0) === 0}
        emptyCopy={IMPORTANT_EMPTY}
        emptyIcon={Star}
        truncated={view.data?.truncated ?? false}
      >
        <TaskRows
          tasks={view.data?.rows ?? []}
          context={{ ...basis, starTooltip: actions.starTooltipMode }}
          actions={actions}
          onAsk={confirm.ask}
        />
      </PageBody>
      <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </div>
  )
}
