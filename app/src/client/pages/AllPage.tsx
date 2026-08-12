/*
9.5's All page: two labeled sections in one scroll, "Planned" then "Tasks",
each rendered by its home page's rules. "No third scheme exists" is Q5's own
sentence, and it is why this file composes the other two pages' renderings
rather than laying rows out again.

9.1's region table gives All its two names and adds that the second carries
the Tasks page's own regions inside it, so the Inbox block and each folder
group are regions here too, nested inside the "Tasks" one. That nesting is
what lets a test say which quick-add row it means on a page that now has
several.

Section headers are static labels, not links (9.5).
*/
import { Layers3 } from 'lucide-react'

import { useAllView, useMe, useMultiMemberFolderIds } from '../api/queries.js'
import { TaskList } from '../components/ui/index.js'
import { useRowActions } from '../parts/useRowActions.js'
import { PageSection } from '../states/PageSection.js'
import { PageBody } from '../states/PageStates.js'
import { ALL_EMPTY } from './empty-states.js'
import { TasksGroups } from './TasksPage.js'

export function AllPage(): React.JSX.Element {
  const view = useAllView()
  const me = useMe()
  const actions = useRowActions()
  const multiMember = useMultiMemberFolderIds()
  const viewerId = me.data?.user.id ?? null
  const data = view.data

  return (
    <div className="space-y-6">
      <header className="page-header">
        <h1 className="page-title">All</h1>
      </header>
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
        <div className="space-y-6">
        <PageSection name="Planned" heading="Planned">
          <div className="list-card">
            <TaskList
              tasks={data?.planned ?? []}
              viewerId={viewerId}
              multiMemberFolders={multiMember}
              {...actions}
            />
          </div>
        </PageSection>
        <PageSection name="Tasks" heading="Tasks">
          <TasksGroups
            query={view}
            view={
              data === undefined
                ? undefined
                : { inbox: data.tasks_inbox, groups: data.tasks_groups, truncated: data.truncated }
            }
            viewerId={viewerId}
            actions={actions}
            emptyCopy={null}
          />
        </PageSection>
        </div>
      </PageBody>
    </div>
  )
}
