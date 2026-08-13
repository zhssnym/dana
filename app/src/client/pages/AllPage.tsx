/*
9.5's All page: two labeled sections in one scroll, "Planned" then "Tasks",
each rendered by its home page's rules. "No third scheme exists" is Q5's own
sentence, and it is why this file composes the other two pages' renderings
rather than laying rows out again.

The designer's `src/screens/all-screen.tsx`, ported at P8R session R6. His two
titled bands with a rule beneath each, his nested folder groups, and his
quick-add per group; the rows and the states are the shared ones.

9.1's region table gives All its two names and adds that the second carries the
Tasks page's own regions inside it, so the Inbox block and each folder group
are regions here too, nested inside the "Tasks" one. That nesting is what lets
a test say which quick-add it means on a page that has several.

Section headers are static labels, not links (9.5).
*/
import { CalendarDays, Layers3, ListTodo } from 'lucide-react'

import { useAllView, useMultiMemberFolderIds } from '../api/queries.js'
import { useRowActions } from '../parts/useRowActions.js'
import { PageSection } from '../states/PageSection.js'
import { PageBody } from '../states/PageStates.js'
import { ALL_EMPTY } from './empty-states.js'
import { PageHeading } from './page-heading.js'
import { ConfirmDialog, TaskRows, useConfirm, useRowBasis } from './task-rows.js'
import { TasksGroups } from './TasksPage.js'

export function AllPage(): React.JSX.Element {
  const view = useAllView()
  const actions = useRowActions()
  const confirm = useConfirm()
  const basis = useRowBasis()
  const multiMemberFolderIds = useMultiMemberFolderIds()
  const data = view.data

  return (
    <div className="space-y-7">
      <PageHeading icon={Layers3} title="All" subtitle="Every open task" />
      <PageBody
        query={view}
        isEmpty={
          (data?.planned.length ?? 0) === 0 &&
          (data?.tasks_inbox.length ?? 0) === 0 &&
          (data?.tasks_groups.length ?? 0) === 0
        }
        emptyCopy={ALL_EMPTY}
        emptyIcon={Layers3}
        // One flag for both sections: the cap is per response, so All's two
        // arrays share it and the notice belongs above the pair.
        truncated={data?.truncated ?? false}
      >
        <div className="space-y-8">
          <PageSection
            name="Planned"
            heading="Planned"
            tone="page"
            headingMedia={
              <CalendarDays
                className="size-4 text-[var(--color-graphite-500)]"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            }
          >
            <TaskRows
              tasks={data?.planned ?? []}
              context={{ ...basis, multiMemberFolderIds }}
              actions={actions}
              onAsk={confirm.ask}
            />
          </PageSection>
          <PageSection
            name="Tasks"
            heading="Tasks"
            tone="page"
            headingMedia={
              <ListTodo
                className="size-4 text-[var(--color-graphite-500)]"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            }
          >
            <TasksGroups
              query={view}
              view={
                data === undefined
                  ? undefined
                  : {
                      inbox: data.tasks_inbox,
                      groups: data.tasks_groups,
                      truncated: data.truncated,
                    }
              }
              // Q2 gives a Tasks row no folder label on its home page, and
              // this section is rendered by that page's rules.
              context={{ ...basis, showFolder: false }}
              actions={actions}
              onAsk={confirm.ask}
              emptyCopy={null}
            />
          </PageSection>
        </div>
      </PageBody>
      <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </div>
  )
}
