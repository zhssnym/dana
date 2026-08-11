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
import { useNavigate, useParams } from 'react-router'

import { useDeleteFolder } from '../api/mutations.js'
import {
  useFolder,
  useFolderCompletedTasks,
  useFolderOpenTasks,
  useMe,
  useMultiMemberFolderIds,
} from '../api/queries.js'
import { todayInBrowserZone } from '../api/tz.js'
import { ConfirmDialog, OverflowMenu } from '../components/ui/index.js'
import { paths } from '../routes.js'
import { QuickAddRow } from '../parts/QuickAddRow.js'
import { TaskList } from '../parts/TaskRow.js'
import { useRowActions } from '../parts/useRowActions.js'
import { CollapsibleSection, PageSection } from '../states/PageSection.js'
import { PageBody } from '../states/PageStates.js'
import { FOLDER_EMPTY } from './empty-states.js'

/**
 * 9.6's delete confirm, word for word, with the folder and its three counts.
 *
 * The section writes the counts as "28 open, 12 completed, and 3 abandoned",
 * which is a shape rather than a value, and it is the only place a person is
 * told the deletion reaches every member rather than only their own view.
 */
function folderDeleteConfirm(
  name: string,
  open: number,
  completed: number,
  abandoned: number,
): string {
  return (
    `Delete ${name}? This permanently deletes ${String(open)} open, ` +
    `${String(completed)} completed, and ${String(abandoned)} abandoned tasks for every member.`
  )
}

export function FolderPage(): React.JSX.Element {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const folder = useFolder(id)
  const open = useFolderOpenTasks(id)
  const me = useMe()
  const actions = useRowActions()
  const multiMember = useMultiMemberFolderIds()
  const remove = useDeleteFolder()
  const [completedOpen, setCompletedOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const completed = useFolderCompletedTasks(id, completedOpen)
  const viewerId = me.data?.user.id ?? null

  const scheduled = open.data?.scheduled ?? []
  const unscheduled = open.data?.unscheduled ?? []
  const bothEmpty = scheduled.length === 0 && unscheduled.length === 0
  /*
  The third count of 9.6's confirm, which 8.11 does not compute.

  The folder object carries pending and completed and says so outright:
  "counts are 8.11's pending and completed tallies, abandoned rows on neither
  side". The copy names all three, so the third is counted off the rows this
  page already holds: Q3 and Q2 both admit pending and abandoned, so the open
  sections carry every abandoned row in the folder and nothing else does.
  Recorded as a reading in `src/client/README.md`, with the recommendation
  that 7.4's counts carry the number the copy asks for.
  */
  const abandoned = [...scheduled, ...unscheduled].filter(
    (task) => task.status === 'abandoned',
  ).length

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
        {/* The sharing panel of 9.6 is still owed; the overflow menu's delete
            and its confirm are here, added by the Complex Interaction session
            this file's own comment assigned them to. Rename, label and leave
            stay owed: each needs a mutation this client does not carry, and
            9.6's own division makes them separate controls rather than one.
            A menu offers only what it can perform, which is why the entries
            are conditional rather than greyed. */}
        <OverflowMenu
          entries={
            folder.data?.is_owner === true && !folder.data.is_default
              ? [{ label: 'Delete folder', onSelect: () => setConfirmDelete(true) }]
              : []
          }
        />
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
        {confirmDelete ? (
          <ConfirmDialog
            message={folderDeleteConfirm(
              folder.data?.name ?? '',
              folder.data?.counts.pending ?? 0,
              folder.data?.counts.completed ?? 0,
              abandoned,
            )}
            onContinue={() => {
              setConfirmDelete(false)
              // 8.8's cascade takes the page with it, so the navigation is
              // part of the action rather than something the person does
              // next: staying would render 10.2's answer for a folder that
              // has just been deleted, which reads as an error.
              remove.mutate(id, { onSuccess: () => navigate(paths.myDay) })
            }}
            onCancel={() => setConfirmDelete(false)}
          />
        ) : null}
      </PageBody>
    </div>
  )
}
