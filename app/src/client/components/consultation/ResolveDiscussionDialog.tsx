/*
Resolving a Discussion records its Outcome (#320): either a statement written
here, or "use a comment", which sends `source_comment_id` and lets the server
snapshot that comment's body. If the person edits the snapshot before sending,
both go: the statement is the edited text and the comment is provenance
(`shared/consultation.ts`'s resolve body).

Mounted only while open, so every opening starts clean. A refusal (403, 409,
422) is toasted by the mutation cache with the server's sentence; the dialog
simply stays open.
*/
import { useId, useState } from 'react'

import { useResolveDiscussion } from '../../api/consultation.js'
import type { CommentLine } from '../../../shared/comments.js'
import { OUTCOME_STATEMENT_MAX } from '../../../shared/consultation.js'
import type { Discussion } from '../../../shared/consultation.js'
import type { PersonResolver } from '../../lib/thread.js'
import { Button } from '../ui/button.js'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '../ui/dialog.js'
import { Textarea } from '../ui/textarea.js'
import { Choice } from './Choice.js'

type Mode = 'write' | 'comment'

const MODES: ReadonlyArray<{ value: Mode; label: string }> = [
  { value: 'write', label: 'Write the outcome' },
  { value: 'comment', label: 'Use a comment' },
]

export function ResolveDiscussionDialog(props: {
  discussion: Pick<Discussion, 'id' | 'is_general'>
  comments: readonly CommentLine[]
  personOf: PersonResolver
  onClose: () => void
}): React.JSX.Element {
  const { discussion, comments, personOf, onClose } = props
  const resolve = useResolveDiscussion()
  const candidates = comments.filter(
    (c): c is CommentLine & { body: string } => c.body !== null && c.body.trim() !== '',
  )
  const [mode, setMode] = useState<Mode>('write')
  const [statement, setStatement] = useState('')
  const [chosenId, setChosenId] = useState<string | null>(null)
  /* The editable snapshot of the chosen comment; null = send it as it is. */
  const [edited, setEdited] = useState<string | null>(null)
  const statementId = useId()
  const radioName = useId()

  const chosen = candidates.find((c) => c.id === chosenId) ?? null
  const trimmed = statement.trim()
  const editedTrimmed = edited?.trim() ?? ''
  const valid =
    mode === 'write'
      ? trimmed.length > 0 && trimmed.length <= OUTCOME_STATEMENT_MAX
      : chosen !== null &&
        (edited === null ||
          (editedTrimmed.length > 0 && editedTrimmed.length <= OUTCOME_STATEMENT_MAX))

  const submit = (): void => {
    if (!valid || resolve.isPending) return
    const body =
      mode === 'write'
        ? { statement: trimmed }
        : edited !== null && chosen !== null && editedTrimmed !== chosen.body.trim()
          ? { statement: editedTrimmed, source_comment_id: chosen.id }
          : { source_comment_id: chosen?.id ?? '' }
    resolve.mutate(
      { id: discussion.id, body },
      {
        onSuccess: () => {
          onClose()
        },
      },
    )
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="w-[min(520px,calc(100vw-32px))]">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
          className="space-y-3"
        >
          <div className="space-y-1">
            <DialogTitle>Resolve discussion</DialogTitle>
            <DialogDescription>
              {discussion.is_general
                ? "Record the outcome. Resolving closes the folder's general conversation until someone reopens it."
                : 'Record the outcome. Resolving closes the conversation until someone reopens it.'}
            </DialogDescription>
          </div>

          <Choice
            label="How to record the outcome"
            value={mode}
            options={MODES}
            onSelect={setMode}
          />

          {mode === 'write' ? (
            <div className="space-y-1">
              <label htmlFor={statementId} className="text-xs font-medium text-foreground">
                Outcome
              </label>
              <Textarea
                id={statementId}
                value={statement}
                maxLength={OUTCOME_STATEMENT_MAX}
                required
                autoFocus
                rows={4}
                className="min-h-24"
                placeholder="What was decided or concluded?"
                onChange={(event) => {
                  setStatement(event.target.value)
                }}
              />
              <p className="text-right text-xs text-muted-foreground">
                {statement.length}/{OUTCOME_STATEMENT_MAX}
              </p>
            </div>
          ) : candidates.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No comment with text to use yet. Write the outcome instead.
            </p>
          ) : (
            <div className="space-y-2">
              <fieldset className="max-h-60 space-y-1 overflow-y-auto">
                <legend className="sr-only">Comment to use as the outcome</legend>
                {candidates.map((comment) => (
                  <label
                    key={comment.id}
                    className={`flex cursor-pointer gap-2 rounded-md px-2 py-1.5 text-xs ${
                      comment.id === chosenId ? 'bg-muted' : 'hover:bg-muted'
                    }`}
                  >
                    <input
                      type="radio"
                      name={radioName}
                      value={comment.id}
                      checked={comment.id === chosenId}
                      onChange={() => {
                        setChosenId(comment.id)
                        setEdited(null)
                      }}
                      className="mt-0.5 accent-primary"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-foreground">
                        {personOf(comment.author_id).name}
                      </span>
                      <span className="line-clamp-2 break-words whitespace-pre-wrap text-muted-foreground">
                        {comment.body}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {chosen !== null ? (
                edited === null ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEdited(chosen.body.slice(0, OUTCOME_STATEMENT_MAX))
                    }}
                  >
                    Edit the wording
                  </Button>
                ) : (
                  <div className="space-y-1">
                    <label
                      htmlFor={statementId}
                      className="text-xs font-medium text-foreground"
                    >
                      Outcome
                    </label>
                    <Textarea
                      id={statementId}
                      value={edited}
                      maxLength={OUTCOME_STATEMENT_MAX}
                      rows={4}
                      className="min-h-24"
                      onChange={(event) => {
                        setEdited(event.target.value)
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      The comment stays linked as the source.
                    </p>
                  </div>
                )
              ) : null}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="commit" disabled={!valid || resolve.isPending}>
              {resolve.isPending ? 'Resolving…' : 'Resolve'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
