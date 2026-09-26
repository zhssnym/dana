/*
A comment on the issue page, GitHub's box (RESEARCH-ISSUE 3.4): a tinted
header bar with the face, "Maya commented 2h ago", "edited" when it was, and
a "…" menu (Copy text; Edit and Delete where the viewer may), then the post
and its like. The body box shares the frame, so `IssueBox` is exported.
*/
import { Suspense, lazy, useState } from 'react'

import type { CommentFile, CommentLine, PostContent } from '../../../../shared/comments.js'
import { postFileIds } from '../../../../shared/comments.js'
import { useDeleteComment, usePatchComment, useSetCommentLike } from '../../../api/mutations.js'
import { Face } from '../../../components/person-face.js'
import type { Person } from '../../../components/person-face.js'
import { PostView } from '../../../components/thread/PostView.js'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu.js'
import { cn } from '../../../components/ui/utils.js'
import { agoFor } from '../../../lib/history.js'
import { MoreHorizontal, ThumbsUp } from '../../../lib/icons.js'

const PostEditor = lazy(() => import('../../../components/thread/PostEditor.js'))

export interface MenuItem {
  readonly label: string
  readonly onSelect: () => void
  readonly destructive?: boolean
}

/** The shared frame: a bordered box whose header bar says who and when. */
export function IssueBox(props: {
  readonly person: Person
  readonly verb: string
  readonly at: number
  readonly edited: number | null
  readonly menu: readonly MenuItem[]
  readonly menuLabel: string
  readonly label: string
  readonly id?: string
  readonly className?: string
  readonly children: React.ReactNode
}): React.JSX.Element {
  const at = new Date(props.at)
  return (
    <section
      id={props.id}
      aria-label={props.label}
      className={cn('relative z-10 min-w-0 rounded-md border border-border bg-background', props.className)}
    >
      <header className="flex h-10 min-w-0 items-center gap-2 rounded-t-md border-b border-border bg-muted pr-1 pl-3 text-xs text-muted-foreground">
        <Face person={props.person} className="size-5 data-[size=sm]:size-5" />
        <p className="flex min-w-0 flex-1 items-center gap-1 truncate">
          <span className="truncate font-section text-foreground">{props.person.name}</span>
          <span className="shrink-0">{props.verb}</span>
          <time className="shrink-0" dateTime={at.toISOString()} title={at.toLocaleString()}>
            {agoFor(props.at)}
          </time>
          {props.edited === null ? null : (
            <span className="shrink-0" title={`Edited ${new Date(props.edited).toLocaleString()}`}>
              · edited
            </span>
          )}
        </p>
        {props.menu.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label={props.menuLabel}
                  className="flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground"
                />
              }
            >
              <MoreHorizontal className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {props.menu.map((item) => (
                <DropdownMenuItem
                  key={item.label}
                  {...(item.destructive === true ? { variant: 'destructive' as const } : {})}
                  onClick={item.onSelect}
                >
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>
      {props.children}
    </section>
  )
}

/** The attachments an edit keeps (ThreadPosts' rule): what the new writing places, then files it never placed. */
function editedFileIds(next: PostContent, previous: PostContent | null | undefined, files: readonly CommentFile[]): string[] {
  const placedBefore = new Set(previous ? postFileIds(previous) : [])
  const ids = postFileIds(next)
  for (const file of files) if (!placedBefore.has(file.id)) ids.push(file.id)
  return [...new Set(ids)]
}

export function CommentBox(props: {
  readonly comment: CommentLine
  readonly folderId: string
  readonly person: Person
  readonly mine: boolean
  readonly may: { readonly mutateOwn: boolean; readonly moderate: boolean; readonly like: boolean }
  readonly className?: string
}): React.JSX.Element {
  const { comment, may } = props
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const patch = usePatchComment()
  const remove = useDeleteComment()
  const like = useSetCommentLike()

  const editable = props.mine && may.mutateOwn
  const deletable = (props.mine && may.mutateOwn) || may.moderate
  const menu: MenuItem[] = [
    ...(comment.body === null || comment.body === ''
      ? []
      : [{ label: 'Copy text', onSelect: () => void navigator.clipboard?.writeText(comment.body ?? '') }]),
    ...(editable ? [{ label: 'Edit', onSelect: () => setEditing(true) }] : []),
    ...(deletable ? [{ label: 'Delete', destructive: true, onSelect: () => setDeleting(true) }] : []),
  ]

  return (
    <>
      <IssueBox
        id={`comment-${comment.id}`}
        label={`Comment by ${props.person.name}`}
        person={props.person}
        verb="commented"
        at={Date.parse(comment.created_at)}
        edited={comment.edited_at === null ? null : Date.parse(comment.edited_at)}
        menu={menu}
        menuLabel="Comment actions"
        {...(props.className === undefined ? {} : { className: props.className })}
      >
        <div className="px-4 py-3 text-sm">
          {editing ? (
            <Suspense fallback={<div className="h-10 rounded-lg border border-border" aria-busy="true" />}>
              <PostEditor
                folderId={props.folderId}
                initial={{ content: comment.content, body: comment.body, files: comment.files }}
                submitLabel="Update comment"
                autoFocus
                label="Edit comment"
                onCancel={() => setEditing(false)}
                onSubmit={(content) =>
                  patch
                    .mutateAsync({ id: comment.id, body: { content, file_ids: editedFileIds(content, comment.content, comment.files) } })
                    .then(() => setEditing(false))
                }
              />
            </Suspense>
          ) : (
            <PostView content={comment.content} body={comment.body} files={comment.files} />
          )}
          {!editing && (comment.likes > 0 || may.like) && (
            <button
              type="button"
              aria-pressed={comment.liked}
              aria-label={comment.liked ? 'Remove like' : 'Like'}
              disabled={!may.like}
              onClick={() => like.mutate({ id: comment.id, liked: !comment.liked })}
              className={cn(
                'mt-2 inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs tabular-nums transition-colors duration-[var(--duration-fast)] motion-reduce:transition-none',
                comment.liked
                  ? 'border-transparent bg-selected text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              <ThumbsUp className="size-3" strokeWidth={1.75} aria-hidden="true" />
              {comment.likes > 0 ? comment.likes : null}
            </button>
          )}
        </div>
      </IssueBox>
      {deleting && (
        <ConfirmDialog
          message="Delete this comment?"
          description="This cannot be undone."
          confirmLabel="Delete"
          onCancel={() => setDeleting(false)}
          onContinue={() => {
            setDeleting(false)
            remove.mutate(comment.id)
          }}
        />
      )}
    </>
  )
}
