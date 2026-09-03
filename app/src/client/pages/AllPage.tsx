/*
9.5's All, at /app/all: "locks nothing — Q5's union rendered whole, with
completed work carried in a collapsed section at the foot. Section labels are
static."

**The two halves stay and their names change, which is the rename AC-093 was
waiting for.** 6 Q5 is untouched by RFC 0005 and still says how this page is
drawn: "two stacked sections in one scroll, 'Planned' rendered exactly as Q3
orders it, then 'Tasks' rendered exactly as Q2 groups it. No third scheme
exists." What RFC 0005 moved is the names of the pages those two halves belong
to, Planned becoming Scheduled and Tasks becoming Anytime, and 9.1's regions
table says All's halves take "their two halves' regions as their home pages
define them". So the sections are "Scheduled" and "Anytime", and the region
holding the undated capture is addressable at last: AC-093's All row is that
capture, and it was owed to this package because naming it before the page was
redrawn would have been addressing the implementation.

**The completed section is new here and is 9.5's own sentence.** It is Q6, the
same query Done pages, collapsed at the foot and not fetched until it is
opened, which is the rule Q7's third section already follows. Nothing about
Q5 changes: its predicate is the open statuses and it stays that way.

**The undated half keeps Q2's grouping and the Anytime page does not**, which
looks like a disagreement and is two normative sentences about two surfaces:
Q5 fixes this page's second half as Q2 *groups* it, and 9.5 fixes the Anytime
page as Q2's rows *ungrouped*. Each is followed where it is the authority.

**A grouping asked for through the filter replaces both halves at once**
(DES-156), because a page grouped by folder is that page in folders, not two
sections each in folders. Returning Group by to Nothing gives the two halves
back untouched.
*/

import { CalendarDays, Layers3, ListTodo } from '../lib/icons.js'

import type { GetTasksViewResponse } from '../../shared/views.js'
import { useAllView, useMultiMemberFolderIds } from '../api/queries.js'

import { QuickAdd } from '../components/quick-add.js'
import { folderMark } from '../parts/presenters.js'
import type { Folder } from '../../shared/folders.js'
import type { RowContext } from '../parts/presenters.js'
import { useRowActions } from '../parts/useRowActions.js'
import type { RowActions } from '../parts/useRowActions.js'
import { groupRows } from '../views/grouping.js'
import { PLACES } from '../views/place-pages.js'
import { TaskBoard } from '../views/TaskBoard.js'
import { PlaceChrome, PlaceHead, usePlace } from '../views/usePlace.js'
import type { Place } from '../views/usePlace.js'
import { CompletedFoot } from '../components/page/CompletedFoot.js'
import { PageSection } from '../components/page/PageSection.js'
import { PageBody } from '../components/page/PageStates.js'
import type { PageQueryState } from '../components/page/PageStates.js'
import { ALL_EMPTY } from './empty-states.js'
import { ConfirmDialog, TaskRows, useConfirm, useRowBasis } from './task-rows.js'
import { groupHeadingMedia } from '../views/group-mark.js'

const SPINE = PLACES.all

/**
 * The glyph a folder group heading carries, tinted with that folder's own
 * colour, which is data on the wire rather than a design value (11.4).
 */
/*
The mark on a folder group's heading.

It drew a literal folder in the folder's colour until S17a, which is the
parity audit's "only the heading marks are missing" on a surface it otherwise
scored PORTED. It draws that folder's own glyph now, through the one resolver
every other surface asks (`parts/presenters.ts`), so a folder heading here and
that folder's Library row and its task chips cannot disagree.
*/
function FolderGlyph({ folder }: { readonly folder: Folder | undefined }): React.JSX.Element {
  const mark = folderMark(folder)
  return (
    <mark.icon
      className="size-4 shrink-0"
      style={{ color: mark.color }}
      strokeWidth={1.75}
      aria-hidden="true"
    />
  )
}

/**
 * Q2 as Q5 renders it inside All: the ungrouped default-folder block, then one
 * region per folder that has rows, each with a quick-add adding into that
 * folder, undated.
 *
 * **The Desk block is a named region with no visible heading**, which does not
 * contradict Q2 calling it ungrouped: a region's name is announced and
 * addressed, not rendered, so the block still reads as a plain list on top
 * with no label above it. Naming it is what separates its rows and its
 * quick-add from the folder groups beneath, and it is what lets a test say
 * which of several identically named quick-adds it means.
 *
 * **It carries a quick-add like every group on the page**, closed at the P8
 * change control: 9.1 places the control at the bottom of these groups and Q2
 * calls the first block ungrouped, which had left the one folder every account
 * has as the only one that could not be captured into.
 */
function UndatedGroups({
  query,
  view,
  context,
  actions,
  onAsk,
  place,
}: {
  readonly query: PageQueryState
  readonly view: GetTasksViewResponse | undefined
  readonly context: RowContext
  readonly actions: RowActions
  readonly onAsk: (message: string, run: () => void) => void
  readonly place: Place
}): React.JSX.Element {
  const inboxFolderId = view?.inbox[0]?.folder.id
  const inboxName = view?.inbox[0]?.folder.name ?? 'Desk'

  return (
    <div className="space-y-7">
      {/* polish: places F12. Every undated group is a folder and reads as
          one; Desk's group had no heading and looked like a group called
          "Anytime" beside groups called by their folders. */}
      <PageSection
        name={inboxName}
        heading={inboxName}
        headingMedia={<FolderGlyph folder={context.folders.find((entry) => entry.id === inboxFolderId)} />}
      >
        <PageBody
          query={query}
          isEmpty={false}
          emptyCopy=""
          emptyIcon={ListTodo}
        >
          <TaskRows tasks={view?.inbox ?? []} context={context} actions={actions} onAsk={onAsk} />
        </PageBody>
        {/* All's undated capture, 9.3's first entry row: Desk and undated.
            The folder is omitted rather than guessed before the default
            folder's id is known, because 7.6 defaults folder_id to it. */}
        <QuickAdd
          folderName={inboxName}
          onAdd={(title) => {
            place.capture(
              title,
              inboxFolderId === undefined ? undefined : { folder_id: inboxFolderId },
            )
          }}
          onOpenFullForm={(title) => {
            place.openFull(
              inboxFolderId === undefined ? undefined : { folder_id: inboxFolderId },
              title,
            )
          }}
        />
      </PageSection>
      {(view?.groups ?? []).map((group) => (
        <PageSection
          key={group.folder.id}
          name={group.folder.name}
          heading={group.folder.name}
          headingMedia={
            <FolderGlyph
              folder={context.folders.find((entry) => entry.id === group.folder.id)}
            />
          }
        >
          <TaskRows tasks={group.rows} context={context} actions={actions} onAsk={onAsk} />
          <QuickAdd
            folderName={group.folder.name}
            onAdd={(title) => {
              place.capture(title, { folder_id: group.folder.id })
            }}
            onOpenFullForm={(title) => {
              place.openFull({ folder_id: group.folder.id }, title)
            }}
          />
        </PageSection>
      ))}
    </div>
  )
}

export function AllPage(): React.JSX.Element {
  const view = useAllView()
  const actions = useRowActions()
  const confirm = useConfirm()
  const basis = useRowBasis()
  const multiMemberFolderIds = useMultiMemberFolderIds()
  const data = view.data

  const planned = data?.planned ?? []
  const undated = [
    ...(data?.tasks_inbox ?? []),
    ...(data?.tasks_groups ?? []).flatMap((group) => group.rows),
  ]
  const place = usePlace(SPINE, [...planned, ...undated])
  const narrowedPlanned = place.narrow(planned)
  const columns = groupRows(
    place.narrow([...planned, ...undated]),
    place.groupBy,
    place.today,
    place.viewerId,
  )

  /* The narrowed halves of Q2's own shape, so the grouping the response
     carries survives the filter rather than being rebuilt from a flat list. */
  const narrowedTasksView: GetTasksViewResponse | undefined =
    data === undefined
      ? undefined
      : {
          inbox: [...place.narrow(data.tasks_inbox)],
          groups: data.tasks_groups.map((group) => ({
            folder: group.folder,
            rows: [...place.narrow(group.rows)],
          })),
          truncated: data.truncated,
        }


  return (
    <div className="space-y-7">
      <PlaceChrome place={place} />
      <PlaceHead place={place} />
      <PageBody
        query={view}
        isEmpty={planned.length === 0 && undated.length === 0}
        emptyCopy={ALL_EMPTY}
        emptyIcon={Layers3}
        // One flag for both halves: the cap is per response, so All's arrays
        // share it and the notice belongs above the pair.
        truncated={data?.truncated ?? false}
      >
        <div className="space-y-8">
          {place.mode === 'board' || place.groupBy !== 'none' ? (
            place.mode === 'board' ? (
              <TaskBoard
                place={place}
                columns={columns}
                context={{ ...basis, multiMemberFolderIds }}
                actions={actions}
              />
            ) : (
              <div className="space-y-6">
                {columns.map((column) => (
                  <PageSection
                    key={column.key}
                    name={column.name}
                    heading={column.name}
                    headingMedia={groupHeadingMedia(column.mark, basis.folders)}
                    count={column.rows.length}
                  >
                    <TaskRows
                      tasks={column.rows}
                      context={{ ...basis, multiMemberFolderIds }}
                      actions={actions}
                      onAsk={confirm.ask}
                    />
                  </PageSection>
                ))}
              </div>
            )
          ) : (
            <>
              <PageSection
                name="Scheduled"
                heading="Scheduled"
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
                  tasks={narrowedPlanned}
                  context={{ ...basis, multiMemberFolderIds }}
                  actions={actions}
                  onAsk={confirm.ask}
                />
              </PageSection>
              <PageSection
                name="Anytime"
                heading="Anytime"
                tone="page"
                headingMedia={
                  <ListTodo
                    className="size-4 text-[var(--color-graphite-500)]"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                }
              >
                <UndatedGroups
                  query={view}
                  view={narrowedTasksView}
                  // Q2 gives an undated row no folder label on its home page,
                  // the group heading above it being the folder, and this half
                  // is rendered by that page's rules.
                  context={{ ...basis, showFolder: false }}
                  actions={actions}
                  onAsk={confirm.ask}
                  place={place}
                />
              </PageSection>
            </>
          )}

          {/* 9.5: "with completed work carried in a collapsed section at the
              foot". Q6's rows, not fetched until the section is opened.

              Written inline here until S17b, when Important and Scheduled were
              about to acquire a fourth and a fifth copy of it and the shared
              one was extracted instead. This page passes no predicate, which
              is the case `CompletedFoot` records as the reason the predicate
              is optional at all: Q5's union is the whole account, so All's
              foot is Q6 unnarrowed and a filter here would remove nothing. */}
          <CompletedFoot
            context={{ ...basis, multiMemberFolderIds }}
            actions={actions}
            onAsk={confirm.ask}
          />
        </div>
      </PageBody>
      <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </div>
  )
}
