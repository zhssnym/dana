/*
One task as a GitHub issue, opened from the Linear view (m2 ghissues;
scratchpad m2/ghissues/DESIGN.md). The peek and the task page stay the task
surface's; this is the Linear view's reading of the same task.

- The title (the one bold thing), the state pill, and "Maya opened this
  3 days ago · 4 comments".
- The timeline, oldest first: the body (the task's own document, editable in
  place as a GitHub description is), its subtasks, then its comments and its
  history merged by time. Consecutive identical history lines collapse.
- The composer: Comment, and Close as completed / Close as not planned, or
  Reopen. Not planned is abandoned.
- The sidebar: Assignee, Labels, Milestone, Dates, and "Open task", where they
  are edited.
*/
import { Suspense, lazy, useMemo } from 'react'

import type { CommentLine } from '../../../shared/comments.js'
import { postFileIds } from '../../../shared/comments.js'
import type { PageView } from '../../../shared/pages.js'
import type { TaskCard } from '../../../shared/tasks.js'
import { useTaskThreadLive } from '../../api/consultation.js'
import { usePostComment, useSetCommentLike } from '../../api/mutations.js'
import { useFolders, useTask } from '../../api/queries.js'
import { Face } from '../../components/person-face.js'
import { PostView } from '../../components/thread/PostView.js'
import { Button } from '../../components/ui/button.js'
import { cn } from '../../components/ui/utils.js'
import { formatDay } from '../../lib/dates.js'
import { folderGates } from '../../lib/folder-authority.js'
import { agoFor, sentenceOf, useHistory } from '../../lib/history.js'
import type { HistoryEvent } from '../../lib/history.js'
import { ArrowLeft, ThumbsUp } from '../../lib/icons.js'
import type { RowActions } from '../../parts/useRowActions.js'
import { Subtasks } from './Subtasks.js'
import { LabelChip, StateMark, StatePill } from './IssueParts.js'
import { issueState, labelsOf, sectionReader, usePeople } from './issues.js'
import type { IssueState } from './issues.js'

const TaskComposer = lazy(() => import('../../components/page/canvas/TaskComposer.js'))
const PostEditor = lazy(() => import('../../components/thread/PostEditor.js'))

const BOX = 'rounded-md border border-border'

type Entry =
  | { readonly kind: 'comment'; readonly at: number; readonly comment: CommentLine }
  | { readonly kind: 'event'; readonly at: number; readonly event: HistoryEvent; readonly text: string; readonly state: IssueState | null }

/** A history line in GitHub's words, the person first: "Maya closed this as completed". */
function eventLine(event: HistoryEvent, taskId: string): { text: string; state: IssueState | null } {
  switch (event.verb) {
    case 'completed':
      return { text: `${event.actor} closed this as completed`, state: 'completed' }
    case 'abandoned':
      return { text: `${event.actor} closed this as not planned`, state: 'not-planned' }
    case 'reopened':
    case 'restored':
      return { text: `${event.actor} reopened this`, state: 'open' }
    default:
      return {
        text: sentenceOf(event, { kind: 'task', subject: taskId }).replace(/ the task\b/, ' this'),
        state: null,
      }
  }
}

export function IssuePage(props: {
  readonly taskId: string
  readonly folderId: string
  readonly page: PageView
  readonly today: string
  readonly actions: RowActions
  readonly onBack: () => void
}): React.JSX.Element {
  const { taskId, folderId, page, today, actions, onBack } = props
  const task = useTask(taskId)
  const thread = useTaskThreadLive(folderId, taskId)
  const history = useHistory('task', taskId)
  const person = usePeople(folderId)
  const post = usePostComment()
  const like = useSetCommentLike()
  const folders = useFolders()

  const row = folders.data?.find((folder) => folder.id === folderId)
  const gates =
    row === undefined ? null : folderGates({ access: row.my_access, isOwner: row.is_owner, isDefault: row.is_default })
  const comments = thread.data?.comments

  const timeline = useMemo((): Entry[] => {
    const entries: Entry[] = []
    for (const comment of comments ?? []) {
      entries.push({ kind: 'comment', at: Date.parse(comment.created_at), comment })
    }
    /* "created" is the body's own "opened"; history reads newest first. */
    for (const event of [...history].reverse()) {
      if (event.verb === 'created') continue
      entries.push({ kind: 'event', at: event.at, event, ...eventLine(event, taskId) })
    }
    entries.sort((a, b) => a.at - b.at)
    /* One line for a run of the same line (a string of edits), at its latest time. */
    const merged: Entry[] = []
    for (const entry of entries) {
      const last = merged.at(-1)
      if (entry.kind === 'event' && last?.kind === 'event' && last.text === entry.text) {
        merged[merged.length - 1] = entry
        continue
      }
      merged.push(entry)
    }
    return merged
  }, [comments, history, taskId])

  const back = (
    <button
      type="button"
      onClick={onBack}
      className="-ml-1.5 inline-flex h-[var(--control-height)] items-center gap-1.5 rounded-sm px-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" aria-hidden="true" />
      Issues
    </button>
  )

  if (task.isError) {
    return (
      <div className="flex flex-col gap-2 pb-2">
        {back}
        <p role="alert" className="text-sm text-muted-foreground">
          This task is not on the page any more.
        </p>
      </div>
    )
  }
  const detail = task.data
  if (detail === undefined) return <div className="pb-2">{back}</div>

  const card: TaskCard = detail
  const state = issueState(detail)
  const count = comments?.length ?? 0
  const author = detail.created_by === null ? person(null) : person(detail.created_by.id)
  const { sectionOf, sections } = sectionReader(page)
  const milestone = sections.find((section) => section.id === sectionOf(detail))?.name ?? null
  const labels = labelsOf(detail)
  const canComment = gates?.createComment ?? false

  const close = (reason: 'completed' | 'not-planned'): void => {
    if (reason === 'completed') actions.onToggleComplete(card)
    else actions.onAbandon(card)
  }
  const reopen = (): void => (state === 'not-planned' ? actions.onRestore(card) : actions.onToggleComplete(card))

  const dates =
    detail.start_date === null && detail.due_date === null
      ? null
      : [
          detail.start_date === null ? null : `Starts ${formatDay(detail.start_date, today)}`,
          detail.due_date === null ? null : `Due ${formatDay(detail.due_date, today)}`,
        ]
          .filter((part) => part !== null)
          .join(' · ')

  const sidebar = (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm md:flex md:flex-col md:gap-4">
      <div className="flex flex-col gap-1">
        <dt className="text-xs text-muted-foreground">Assignee</dt>
        <dd className="flex min-w-0 items-center gap-2">
          {detail.assignee === null ? (
            <span className="text-muted-foreground">No one</span>
          ) : (
            <>
              <Face person={person(detail.assignee.id)} className="size-5 data-[size=sm]:size-5" />
              <span className="min-w-0 truncate text-foreground">{person(detail.assignee.id).name}</span>
            </>
          )}
        </dd>
      </div>
      <div className="flex flex-col gap-1">
        <dt className="text-xs text-muted-foreground">Labels</dt>
        <dd className="flex flex-wrap gap-1">
          {labels.length === 0 ? (
            <span className="text-muted-foreground">None</span>
          ) : (
            labels.map((label) => <LabelChip key={label.id} name={label.name} color={label.color} />)
          )}
        </dd>
      </div>
      <div className="flex flex-col gap-1">
        <dt className="text-xs text-muted-foreground">Milestone</dt>
        <dd className={cn('min-w-0 truncate', milestone === null ? 'text-muted-foreground' : 'text-foreground')}>
          {milestone ?? 'No milestone'}
        </dd>
      </div>
      <div className="flex flex-col gap-1">
        <dt className="text-xs text-muted-foreground">Dates</dt>
        <dd className={cn(dates === null ? 'text-muted-foreground' : 'text-foreground')}>{dates ?? 'No dates'}</dd>
      </div>
      <div className="col-span-2">
        <Button variant="default" size="sm" onClick={() => actions.onOpenTask(card)}>
          Edit task
        </Button>
      </div>
    </dl>
  )

  return (
    <article aria-label={detail.title} className="flex flex-col gap-3 pb-2">
      {back}
      <header className="flex flex-col gap-2 border-b border-border pb-3">
        <h2 className="text-[length:var(--text-h2-size)] leading-[var(--text-h2-line)] font-title text-foreground [overflow-wrap:anywhere]">{detail.title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <StatePill state={state} />
          <p className="text-sm text-muted-foreground">
            <span className="font-section text-foreground">{author.name}</span> opened this{' '}
            {agoFor(Date.parse(detail.created_at))} · {count} comment{count === 1 ? '' : 's'}
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <div className="order-2 flex min-w-0 flex-1 flex-col gap-3 md:order-1">
          <section aria-label="Description" className={BOX}>
            <p className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
              <Face person={author} className="size-5 data-[size=sm]:size-5" />
              <span className="font-section text-foreground">{author.name}</span>
              opened {agoFor(Date.parse(detail.created_at))}
            </p>
            {/* The writer's tail (a tall click-to-write area on a page) is one line here. */}
            <div className="px-3 py-2 [&_.dana-canvas-tail]:min-h-6!">
              <Suspense
                fallback={
                  detail.notes ? <p className="whitespace-pre-wrap text-sm text-foreground">{detail.notes}</p> : null
                }
              >
                <TaskComposer taskId={detail.id} folderId={folderId} notes={detail.notes} />
              </Suspense>
              {detail.steps_total > 0 && (
                <div className="mt-2 border-t border-border pt-2">
                  <Subtasks task={card} onOpen={() => actions.onOpenTask(card)} />
                </div>
              )}
            </div>
          </section>

          {timeline.length > 0 && (
            <ol role="list" className="flex flex-col gap-3">
              {timeline.map((entry) =>
                entry.kind === 'event' ? (
                  <li key={entry.event.id} className="flex items-center gap-2 px-3 text-xs text-muted-foreground">
                    <span aria-hidden className="flex size-5 shrink-0 items-center justify-center">
                      {entry.state === null ? (
                        <span className="size-1.5 rounded-full bg-quiet-foreground" />
                      ) : (
                        <StateMark state={entry.state} className="size-3.5" />
                      )}
                    </span>
                    <span className="min-w-0">
                      {entry.text} · {agoFor(entry.at)}
                    </span>
                  </li>
                ) : (
                  <li key={entry.comment.id} className={BOX}>
                    <p className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
                      <Face person={person(entry.comment.author_id)} className="size-5 data-[size=sm]:size-5" />
                      <span className="font-section text-foreground">{person(entry.comment.author_id).name}</span>
                      commented {agoFor(entry.at)}
                    </p>
                    <div className="px-3 py-2 text-sm">
                      <PostView
                        content={entry.comment.content}
                        body={entry.comment.body}
                        files={entry.comment.files}
                        edited={entry.comment.edited_at !== null}
                      />
                      {(entry.comment.likes > 0 || (gates?.likeComment ?? false)) && (
                        <button
                          type="button"
                          aria-pressed={entry.comment.liked}
                          aria-label={entry.comment.liked ? 'Remove like' : 'Like'}
                          disabled={!(gates?.likeComment ?? false)}
                          onClick={() => like.mutate({ id: entry.comment.id, liked: !entry.comment.liked })}
                          className={cn(
                            'mt-1.5 inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs tabular-nums transition-colors',
                            entry.comment.liked
                              ? 'border-transparent bg-selected text-foreground'
                              : 'border-border text-muted-foreground hover:text-foreground',
                          )}
                        >
                          <ThumbsUp className="size-3" strokeWidth={1.75} aria-hidden="true" />
                          {entry.comment.likes > 0 ? entry.comment.likes : null}
                        </button>
                      )}
                    </div>
                  </li>
                ),
              )}
            </ol>
          )}

          <section aria-label="Add a comment" className="flex flex-col gap-2 border-t border-border pt-3">
            {canComment && (
              <Suspense fallback={<div className="h-10 rounded-lg border border-border" aria-busy="true" />}>
                <PostEditor
                  folderId={folderId}
                  label="Comment"
                  placeholder="Leave a comment"
                  submitLabel="Comment"
                  onSubmit={(content) =>
                    post.mutateAsync({
                      folderId,
                      taskId,
                      body: {
                        content,
                        ...(postFileIds(content).length > 0 ? { file_ids: [...new Set(postFileIds(content))] } : {}),
                      },
                    })
                  }
                />
              </Suspense>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {state === 'open' ? (
                <>
                  <Button variant="ghost" onClick={() => close('not-planned')}>
                    Close as not planned
                  </Button>
                  <Button variant="default" onClick={() => close('completed')}>
                    <StateMark state="completed" className="size-3.5" />
                    Close as completed
                  </Button>
                </>
              ) : (
                <Button variant="default" onClick={reopen}>
                  <StateMark state="open" className="size-3.5" />
                  Reopen
                </Button>
              )}
            </div>
          </section>
        </div>

        <aside aria-label="Details" className="order-1 md:order-2 md:w-56 md:shrink-0">
          {sidebar}
        </aside>
      </div>
    </article>
  )
}
