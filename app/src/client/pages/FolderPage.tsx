/*
9.6's folder page, over Q7's three sections.

The two quick-add rows are the reason 9.1 gained named regions on 2026-08-11.
They have one accessible name between them, "Add a task", and 9.3 gives them
different defaults: the Scheduled section's opens with due date today and the
Unscheduled section's with it empty. Nothing about either input distinguishes
them, so the region does, and AC-093 addresses each within its own.

The floating add button is not one of the two. It sits on the page rather than
in a section, so it opens with the due date empty, which is what having no
section context means everywhere else in 9.3's table; the layout decides that,
because the button is chrome.

Q7's empty rule is read as the rows being absent rather than the sections:
"sections 1 and 2 absent when empty with a single line 'No tasks yet. Add one
below.' when both are empty". The single line is what the person reads, and
"add one below" is an instruction that needs the row it points at, so both
regions and both quick-add rows stay and only the lists go. Recorded here
because it is a reading, and it is the reading AC-093 and AC-158 are both
written against.

The Completed section is collapsed on arrival and does not fetch until it is
opened, which is what makes the collapse real rather than cosmetic.
*/
import { useState } from 'react'
import { useParams } from 'react-router'

import {
  useFolder,
  useFolderCompletedTasks,
  useFolderOpenTasks,
  useMe,
  useMultiMemberFolderIds,
} from '../api/queries.js'
import { todayInBrowserZone } from '../api/tz.js'
import { QuickAddRow } from '../parts/QuickAddRow.js'
import { TaskList } from '../parts/TaskRow.js'
import { useRowActions } from '../parts/useRowActions.js'
import { CollapsibleSection, PageSection } from '../states/PageSection.js'
import { PageBody } from '../states/PageStates.js'
import { FOLDER_EMPTY } from './empty-states.js'

export function FolderPage(): React.JSX.Element {
  const { id = '' } = useParams<{ id: string }>()
  const folder = useFolder(id)
  const open = useFolderOpenTasks(id)
  const me = useMe()
  const actions = useRowActions()
  const multiMember = useMultiMemberFolderIds()
  const [completedOpen, setCompletedOpen] = useState(false)
  const completed = useFolderCompletedTasks(id, completedOpen)
  const viewerId = me.data?.user.id ?? null

  const scheduled = open.data?.scheduled ?? []
  const unscheduled = open.data?.unscheduled ?? []
  const bothEmpty = scheduled.length === 0 && unscheduled.length === 0

  return (
    <div>
      {/* The header is the folder read, so a folder the viewer cannot see
          renders 10.2's answer here: nonexistent, never forbidden. */}
      <PageBody query={folder} isEmpty={false} emptyCopy="">
        <h1>{folder.data?.name}</h1>
        <p>
          {folder.data?.counts.completed ?? 0} of{' '}
          {(folder.data?.counts.completed ?? 0) + (folder.data?.counts.pending ?? 0)} done
        </p>
        <ul>
          {(folder.data?.members ?? []).map((member) => (
            <li key={member.user.id}>{member.user.display_name ?? 'Someone'}</li>
          ))}
        </ul>
        {/* The sharing panel of 9.6 and the overflow menu's rename, label,
            leave and delete are confirmations and dialogs, which belong to the
            Complex Interaction engineer; both are recorded as owed. */}
        <button type="button">Share</button>

        <PageSection name="Scheduled" heading="Scheduled">
          <PageBody query={open} isEmpty={bothEmpty} emptyCopy={FOLDER_EMPTY}>
            <TaskList
              tasks={scheduled}
              viewerId={viewerId}
              multiMemberFolders={multiMember}
              {...actions}
            />
          </PageBody>
          <QuickAddRow
            defaults={{ folder_id: id, due_date: todayInBrowserZone() }}
          />
        </PageSection>

        <PageSection name="Unscheduled" heading="Unscheduled">
          <TaskList
            tasks={unscheduled}
            viewerId={viewerId}
            multiMemberFolders={multiMember}
            {...actions}
          />
          <QuickAddRow defaults={{ folder_id: id }} />
        </PageSection>

        {/* Q7 hides the third section while it is empty. Whether it is empty is
            only known once it has been fetched, and it is only fetched once it
            is opened, so the control is rendered on the strength of the
            folder's own completed count. */}
        {(folder.data?.counts.completed ?? 0) === 0 ? null : (
          <CollapsibleSection
            name="Completed"
            defaultOpen={false}
            onOpenChange={setCompletedOpen}
          >
            {(completed.data?.days ?? []).map((day) => (
              <PageSection key={day.date} name={day.date} heading={day.date}>
                <TaskList tasks={day.rows} viewerId={viewerId} {...actions} />
              </PageSection>
            ))}
          </CollapsibleSection>
        )}
      </PageBody>
    </div>
  )
}
