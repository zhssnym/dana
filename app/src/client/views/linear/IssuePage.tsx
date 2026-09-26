/*
One task as a GitHub issue page, opened from the Linear view (m3 issue;
scratchpad m3/RESEARCH-ISSUE.md). The peek and the task page stay the task
surface's; this is the Linear view's reading of the same task.

- The header: the title (the one bold thing, renamed in place with the
  pencil) and the state pill. Who opened it and when is the body box's own
  header, so it is not said twice. No back link: the view's own navigation
  does that.
- One timeline on a vertical line, oldest first: the body box (the task's own
  document, editable in place as a GitHub description is, with its steps),
  then comment boxes and event rows, each event with a round badge for its
  kind (`issue/timeline.ts`, `issue/EventRow.tsx`).
- "Add a comment", with "Close issue ▾" (completed, or not planned, which
  is abandoned) or "Reopen issue", and "Comment" (`issue/IssueComposer.tsx`).
- The sidebar: Assignee, Labels, Milestone, Dates, Relationships and
  Participants (`issue/IssueSidebar.tsx`); after the thread on a phone.
*/
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'

import type { PageView } from '../../../shared/pages.js'
import type { TaskCard } from '../../../shared/tasks.js'
import { useTaskThreadLive } from '../../api/consultation.js'
import { usePostComment, useUpdateTask } from '../../api/mutations.js'
import { useFolders, useMe, useSubjectEvents, useTaskDependencies, useTask } from '../../api/queries.js'
import type { Person } from '../../components/person-face.js'
import { openTask } from '../../components/task-open.js'
import { cn } from '../../components/ui/utils.js'
import { folderGates, mayDraw } from '../../lib/folder-authority.js'
import { Pencil } from '../../lib/icons.js'
import type { RowActions } from '../../parts/useRowActions.js'
import { Subtasks } from './Subtasks.js'
import { StatePill } from './IssueParts.js'
import { issueState, sectionReader, usePeople } from './issues.js'
import { CommentBox, IssueBox } from './issue/CommentBox.js'
import { EventRow } from './issue/EventRow.js'
import { IssueComposer, postBody } from './issue/IssueComposer.js'
import type { StateMay } from './issue/IssueComposer.js'
import { IssueSidebar } from './issue/IssueSidebar.js'
import { bodyEditedAt, buildTimeline } from './issue/timeline.js'

const TaskComposer = lazy(() => import('../../components/page/canvas/TaskComposer.js'))

const EMPTY_EVENTS: never[] = []

function TitleEditor(props: {
  readonly title: string
  readonly canRename: boolean
  readonly onRename: (title: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<string | null>(null)
  /* Leaving the input hands focus back to the pencil, not to <body>. */
  const pencil = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(false)
  useEffect(() => {
    if (draft !== null) wasEditing.current = true
    else if (wasEditing.current) {
      wasEditing.current = false
      pencil.current?.focus()
    }
  }, [draft])
  const heading = 'text-[length:var(--text-h1-size)] leading-[var(--text-h1-line)] font-title text-foreground'
  if (draft !== null) {
    const save = (): void => {
      const next = draft.trim()
      setDraft(null)
      if (next !== '' && next !== props.title) props.onRename(next)
    }
    return (
      <input
        aria-label="Title"
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          /* Prevented, so the Enter does not go on to press the pencil that takes focus back. */
          if (event.key === 'Enter') {
            event.preventDefault()
            save()
          }
          else if (event.key === 'Escape') setDraft(null)
        }}
        className={cn(
          heading,
          'w-full min-w-0 rounded-md border border-border bg-background px-2 outline-none focus:border-quiet-foreground',
        )}
      />
    )
  }
  return (
    <div className="flex min-w-0 items-start gap-1">
      <h2 className={cn(heading, 'min-w-0 [overflow-wrap:anywhere]')}>{props.title}</h2>
      {props.canRename && (
        <button
          ref={pencil}
          type="button"
          aria-label="Rename"
          title="Rename"
          onClick={() => setDraft(props.title)}
          className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground"
        >
          <Pencil className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

export function IssuePage(props: {
  readonly taskId: string
  readonly folderId: string
  readonly page: PageView
  readonly today: string
  readonly actions: RowActions
}): React.JSX.Element {
  const { taskId, folderId, page, today, actions } = props
  const task = useTask(taskId)
  const thread = useTaskThreadLive(folderId, taskId)
  const events = useSubjectEvents(`task:${taskId}`).data?.events ?? EMPTY_EVENTS
  const dependencies = useTaskDependencies(taskId).data
  const person = usePeople(folderId)
  const me = useMe().data?.user
  const post = usePostComment()
  const update = useUpdateTask()
  const folders = useFolders()
  const [, setSearch] = useSearchParams()

  const row = folders.data?.find((folder) => folder.id === folderId)
  const facts = row === undefined ? null : { access: row.my_access, isOwner: row.is_owner, isDefault: row.is_default }
  const gates = facts === null ? null : folderGates(facts)
  const comments = thread.data?.comments

  const timeline = useMemo(
    () =>
      buildTimeline({
        events,
        comments: comments ?? [],
        dependsOn: dependencies?.depends_on ?? [],
        blocks: dependencies?.blocks ?? [],
        nameOf: (id) => person(id).name,
      }),
    [events, comments, dependencies, person],
  )

  if (task.isError) {
    return (
      <p role="alert" className="pb-2 text-sm text-muted-foreground">
        This task is not on the page any more.
      </p>
    )
  }
  const detail = task.data
  if (detail === undefined) return <div className="pb-2" />

  const card: TaskCard = detail
  const state = issueState(detail)
  const author = person(detail.created_by?.id ?? null)
  const { sectionOf, sections } = sectionReader(page)
  const milestone = sections.find((section) => section.id === sectionOf(detail))?.name ?? null
  const canComment = gates?.createComment ?? false
  const canEdit = facts !== null && mayDraw(facts, 'task.edit')
  const canAssign = facts !== null && mayDraw(facts, 'task.assign')
  const viewerId = me?.id ?? null
  const edited = bodyEditedAt(events)
  /* The state buttons follow the server's gates. mayDraw cannot project an
     assignment, so an assignee's own reach is added here (folder-actions.ts's
     whenAssignedToActor); the server stays the authority. */
  const mine = viewerId !== null && detail.assignee?.id === viewerId
  const stateMay: StateMay = {
    complete:
      facts !== null &&
      (mayDraw(facts, 'task.status.complete') || (mine && (facts.access === 'can_contribute' || facts.access === 'assigned_work'))),
    abandon: facts !== null && (mayDraw(facts, 'task.status.abandon') || (mine && facts.access === 'can_contribute')),
  }
  /* The box's padding writes too: a click there puts the caret at the end. */
  const writeInBox = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (!canEdit || !(event.target instanceof Element) || event.target.closest('.ProseMirror, button, a') !== null) return
    const editable = event.currentTarget.querySelector<HTMLElement>('.ProseMirror')
    if (editable === null) return
    event.preventDefault()
    editable.focus()
    const selection = window.getSelection()
    selection?.selectAllChildren(editable)
    selection?.collapseToEnd()
  }

  const close = (reason: 'completed' | 'not-planned'): void => {
    if (reason === 'completed') actions.onToggleComplete(card)
    else actions.onAbandon(card)
  }
  const reopen = (): void => (state === 'not-planned' ? actions.onRestore(card) : actions.onToggleComplete(card))
  const openLinked = (id: string, linkedFolder: string): void => {
    if (linkedFolder !== folderId) {
      openTask(id)
      return
    }
    setSearch((params) => {
      const next = new URLSearchParams(params)
      next.set('issue', id)
      return next
    })
  }

  /* Participants, GitHub's order: author, assignee, commenters, then whoever acted. */
  const participants: Person[] = []
  const seen = new Set<string>()
  const join = (id: string | null | undefined): void => {
    if (id == null || seen.has(id) || participants.length >= 10) return
    seen.add(id)
    participants.push(person(id))
  }
  join(detail.created_by?.id)
  join(detail.assignee?.id)
  for (const comment of comments ?? []) join(comment.author_id)
  for (const entry of timeline) if (entry.kind === 'event') join(entry.actorId)

  const may = {
    mutateOwn: gates?.mutateOwnComment ?? false,
    moderate: gates?.moderate ?? false,
    like: gates?.likeComment ?? false,
  }

  return (
    <article aria-label={detail.title} className="flex flex-col gap-4 pb-2">
      <header className="flex flex-col gap-2 border-b border-border pb-3">
        <TitleEditor
          title={detail.title}
          canRename={canEdit}
          onRename={(title) => update.mutate({ id: taskId, body: { title } })}
        />
        <div className="flex">
          <StatePill state={state} />
        </div>
      </header>

      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* The timeline: one rule down the left, behind every box and badge. */}
          <div className="relative flex flex-col">
            <span aria-hidden className="absolute top-0 bottom-0 left-4 w-0.5 -translate-x-1/2 bg-border" />
            <IssueBox
              label="Description"
              person={author}
              verb="opened"
              at={Date.parse(detail.created_at)}
              edited={edited}
              menuLabel="Issue actions"
              menu={[
                { label: 'Copy link', onSelect: () => void navigator.clipboard?.writeText(window.location.href) },
                { label: 'Open task', onSelect: () => actions.onOpenTask(card) },
              ]}
              className="mb-2"
            >
              {/* The writer's tail (a tall click-to-write area on a page) is gone here; the
                  whole box writes instead. An empty body says so, GitHub's words. */}
              <div
                onMouseDown={writeInBox}
                className={cn(
                  'px-4 py-3 [&_.dana-canvas-tail]:hidden',
                  canEdit && 'cursor-text',
                  /* canvas.css draws --dana-hint before an empty line; the page's own
                     unfocused rule does not reach a task body's plain paragraph. */
                  canEdit
                    ? '[&_.bn-editor:not(.ProseMirror-focused)_[data-is-only-empty-block]]:[--dana-hint:"Add_a_description"]'
                    : '[&_.bn-editor:not(.ProseMirror-focused)_[data-is-only-empty-block]]:[--dana-hint:"No_description_provided."]',
                )}
              >
                <Suspense
                  fallback={
                    detail.notes ? <p className="whitespace-pre-wrap text-sm text-foreground">{detail.notes}</p> : null
                  }
                >
                  <TaskComposer taskId={detail.id} folderId={folderId} notes={detail.notes} />
                </Suspense>
              </div>
              {detail.steps_total > 0 && (
                <div className="border-t border-border px-4 py-2">
                  <p className="flex items-center gap-2 pb-1 text-xs text-muted-foreground">
                    <span className="font-section text-foreground">Steps</span>
                    <span className="tabular-nums">
                      {detail.steps_done} of {detail.steps_total}
                    </span>
                  </p>
                  <Subtasks task={card} onOpen={() => actions.onOpenTask(card)} />
                </div>
              )}
            </IssueBox>

            {timeline.length > 0 && (
              <ol role="list" aria-label="Timeline" className="flex flex-col">
                {timeline.map((entry) =>
                  entry.kind === 'event' ? (
                    <EventRow key={entry.key} entry={entry} person={person} folderId={folderId} onOpenTask={openLinked} />
                  ) : (
                    <li key={entry.key} className="flex flex-col gap-2 py-2">
                      <CommentBox
                        comment={entry.comment}
                        folderId={folderId}
                        person={person(entry.comment.author_id)}
                        mine={entry.comment.author_id === viewerId}
                        may={may}
                      />
                      {entry.replies.map((reply) => (
                        <CommentBox
                          key={reply.id}
                          comment={reply}
                          folderId={folderId}
                          person={person(reply.author_id)}
                          mine={reply.author_id === viewerId}
                          may={may}
                          className="ml-8"
                        />
                      ))}
                    </li>
                  ),
                )}
              </ol>
            )}

            <IssueComposer
              folderId={folderId}
              state={state}
              canComment={canComment}
              may={stateMay}
              onPost={(content) => post.mutateAsync({ folderId, taskId, body: postBody(content) })}
              onClose={close}
              onReopen={reopen}
            />
          </div>
        </div>

        <aside aria-label="Details" className="md:w-64 md:shrink-0">
          <IssueSidebar
            detail={detail}
            folderId={folderId}
            today={today}
            milestone={milestone}
            dependencies={dependencies}
            participants={participants}
            person={person}
            onAssignMe={
              canAssign && viewerId !== null ? () => update.mutate({ id: taskId, body: { assignee_id: viewerId } }) : null
            }
            onEdit={canEdit ? () => actions.onOpenTask(card) : null}
            onOpenTask={openLinked}
          />
        </aside>
      </div>
    </article>
  )
}
