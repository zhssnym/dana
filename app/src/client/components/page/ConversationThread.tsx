/*
The conversation (9.6, 7.14), ported at S12 from the designer's
`comments.tsx` onto the real thread read: one polished surface the folder
page mounts in whichever of its two homes the viewer chose.

**One reply level, drawn as one level.** 4.15 stores one level and 7.14
answers 422 past it, so a reply offers no reply control of its own: the
surface never draws an affordance the server refuses (7.11's rule, the
DES-225 reading).

**A message is told apart by tone, never hue** (DES-143): the viewer's own
messages read at full strength with their name emphasised, everyone else's
recede a step. No bubble colours, no accent.

**Likes are the whole reaction set** (DES-146): one count, one bit per
person, toggled on the message. The control's name carries the state so a
test and a screen reader read the same fact.

**Delete is author-or-owner** (7.14), and the control renders for exactly
them; edit is the author's alone. The confirmation question left with v2's
delete rule for pages, but a comment is not a page: 9.6 names no confirm
for it and none is drawn, the thread being visible where the act happens.

Nothing here fetches. The page owns the thread read (it is gated on the
surface being open, D3's poll riding the same flag) and this component
takes rows and callbacks, the client's settled rule.
*/
import { useState } from 'react'

import type { CommentLine } from '../../../shared/comments.js'
import { ThumbsUp, X } from '../../lib/icons.js'
import { Button } from '../ui/button.js'
import { Textarea } from '../ui/textarea.js'
import { cn } from '../ui/utils.js'
import { formatAgo } from '../../parts/format-dates.js'

export interface ConversationActions {
  readonly onPost: (body: string, parentId: string | null) => void
  readonly onEdit: (id: string, body: string) => void
  readonly onDelete: (id: string) => void
  readonly onLike: (id: string, liked: boolean) => void
}

function Composer({
  placeholder,
  onSubmit,
  autoFocus = false,
}: {
  readonly placeholder: string
  readonly onSubmit: (body: string) => void
  readonly autoFocus?: boolean
}): React.JSX.Element {
  const [value, setValue] = useState('')
  function commit(): void {
    const body = value.trim()
    if (body === '') return
    onSubmit(body)
    setValue('')
  }
  return (
    <div className="flex items-end gap-2">
      <Textarea
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        rows={1}
        autoFocus={autoFocus}
        className="min-h-[var(--control-height)] flex-1 resize-none text-[13px] leading-5"
        onChange={(event) => {
          setValue(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            commit()
          }
        }}
      />
      <Button
        variant="outline"
        className="h-[var(--control-height)] shrink-0 px-3 text-sm"
        onClick={commit}
      >
        Send
      </Button>
    </div>
  )
}

function Message({
  comment,
  mine,
  authorName,
  canDelete,
  canReply,
  actions,
}: {
  readonly comment: CommentLine
  readonly mine: boolean
  readonly authorName: string
  readonly canDelete: boolean
  readonly canReply: boolean
  readonly actions: ConversationActions
}): React.JSX.Element {
  const [replying, setReplying] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  return (
    <div className="group/message py-2">
      <p className="text-[12px] leading-4">
        <span
          className={cn(
            'font-medium',
            mine
              ? 'text-foreground'
              : 'text-muted-foreground',
          )}
        >
          {authorName}
        </span>{' '}
        <span className="text-muted-foreground">
          {formatAgo(comment.created_at, Date.now())}
          {comment.edited_at === null ? '' : ' · edited'}
        </span>
      </p>
      {editing ? (
        <div className="mt-1 flex items-end gap-2">
          <Textarea
            value={draft}
            aria-label="Edit message"
            rows={1}
            autoFocus
            className="min-h-[var(--control-height)] flex-1 resize-none text-[13px] leading-5"
            onChange={(event) => {
              setDraft(event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setEditing(false)
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                const body = draft.trim()
                if (body !== '' && body !== comment.body) {
                  actions.onEdit(comment.id, body)
                }
                setEditing(false)
              }
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Stop editing"
            className="size-[var(--control-height)]"
            onClick={() => {
              setEditing(false)
            }}
          >
            <X className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <p
          className={cn(
            'mt-0.5 text-[13px] leading-5 whitespace-pre-wrap',
            mine
              ? 'text-foreground'
              : 'text-foreground',
          )}
        >
          {comment.body}
        </p>
      )}
      <div className="mt-1 flex items-center gap-2 text-[12px] leading-4 text-muted-foreground">
        <button
          type="button"
          aria-label={comment.liked ? 'Unlike' : 'Like'}
          aria-pressed={comment.liked}
          onClick={() => {
            actions.onLike(comment.id, !comment.liked)
          }}
          className={cn(
            'flex items-center gap-1 rounded px-1 py-0.5 transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
            comment.liked && 'font-medium text-foreground',
          )}
        >
          <ThumbsUp className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          {comment.likes > 0 ? comment.likes : null}
        </button>
        {canReply ? (
          <button
            type="button"
            onClick={() => {
              setReplying(!replying)
            }}
            className="rounded px-1 py-0.5 transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            Reply
          </button>
        ) : null}
        {mine ? (
          <button
            type="button"
            onClick={() => {
              setDraft(comment.body ?? '')
              setEditing(true)
            }}
            className="opacity-0 transition-opacity outline-none group-hover/message:opacity-100 focus-visible:opacity-100 rounded px-1 py-0.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            Edit
          </button>
        ) : null}
        {canDelete ? (
          <button
            type="button"
            onClick={() => {
              actions.onDelete(comment.id)
            }}
            className="opacity-0 transition-opacity outline-none group-hover/message:opacity-100 focus-visible:opacity-100 rounded px-1 py-0.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            Delete
          </button>
        ) : null}
      </div>
      {replying ? (
        <div className="mt-2 pl-4">
          <Composer
            placeholder="Write a reply"
            autoFocus
            onSubmit={(body) => {
              actions.onPost(body, comment.id)
              setReplying(false)
            }}
          />
        </div>
      ) : null}
    </div>
  )
}

export function ConversationThread({
  comments,
  viewerId,
  isOwner,
  authorName,
  actions,
}: {
  readonly comments: readonly CommentLine[]
  readonly viewerId: string | null
  /** The folder's owner deletes any message (7.14). */
  readonly isOwner: boolean
  readonly authorName: (id: string) => string
  readonly actions: ConversationActions
}): React.JSX.Element {
  const roots = comments.filter((comment) => comment.parent_id === null)
  const repliesOf = (id: string): CommentLine[] =>
    comments.filter((comment) => comment.parent_id === id)

  return (
    <div>
      {roots.length === 0 ? (
        <p className="py-4 text-center text-[13px] leading-5 text-muted-foreground">
          No messages yet.
        </p>
      ) : (
        roots.map((comment) => (
          <div key={comment.id}>
            <Message
              comment={comment}
              mine={comment.author_id === viewerId}
              authorName={authorName(comment.author_id)}
              canDelete={comment.author_id === viewerId || isOwner}
              canReply
              actions={actions}
            />
            {repliesOf(comment.id).map((reply) => (
              <div key={reply.id} className="border-l border-border pl-4">
                <Message
                  comment={reply}
                  mine={reply.author_id === viewerId}
                  authorName={authorName(reply.author_id)}
                  canDelete={reply.author_id === viewerId || isOwner}
                  canReply={false}
                  actions={actions}
                />
              </div>
            ))}
          </div>
        ))
      )}
      <div className="pt-2">
        <Composer placeholder="Write a message" onSubmit={(body) => {
          actions.onPost(body, null)
        }} />
      </div>
    </div>
  )
}
