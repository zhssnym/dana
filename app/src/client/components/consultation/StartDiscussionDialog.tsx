/*
Start a Discussion in a Folder's Consultation (#212, #320): a title and an
optional plain-text context. On success the dialog closes and the new
Discussion opens. A failed create is toasted by the mutation cache (403, 409,
422), so this file adds no error copy of its own.
*/
import { useState } from 'react'
import type { FormEvent } from 'react'

import { useCreateDiscussion } from '../../api/consultation.js'
import {
  DISCUSSION_CONTEXT_MAX,
  DISCUSSION_TITLE_MAX,
} from '../../../shared/consultation.js'
import { Button } from '../ui/button.js'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.js'
import { Input } from '../ui/input.js'
import { Textarea } from '../ui/textarea.js'

/** Show the context counter once the text is this close to the limit. */
const COUNTER_FROM = DISCUSSION_CONTEXT_MAX - 400

export function StartDiscussionDialog({
  folderId,
  open,
  onOpenChange,
  onOpen,
}: {
  folderId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpen: (discussionId: string) => void
}): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [context, setContext] = useState('')
  const create = useCreateDiscussion()

  const trimmedTitle = title.trim()
  const canSubmit = trimmedTitle !== '' && !create.isPending

  const change = (next: boolean): void => {
    if (!next) {
      setTitle('')
      setContext('')
    }
    onOpenChange(next)
  }

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!canSubmit) return
    create.mutate(
      { folderId, body: { title: trimmedTitle, context: context.trim() || null } },
      {
        onSuccess: (created) => {
          change(false)
          onOpen(created.id)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="w-[min(520px,calc(100vw-32px))]">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Start a discussion</DialogTitle>
            <DialogDescription>
              Raise a question for this folder. People discuss it, then record the outcome.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="start-discussion-title"
                className="mb-1.5 block text-xs font-medium text-foreground"
              >
                Title
              </label>
              <Input
                id="start-discussion-title"
                value={title}
                maxLength={DISCUSSION_TITLE_MAX}
                placeholder="What needs deciding?"
                autoFocus
                required
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            <div>
              <label
                htmlFor="start-discussion-context"
                className="mb-1.5 block text-xs font-medium text-foreground"
              >
                Context <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Textarea
                id="start-discussion-context"
                value={context}
                maxLength={DISCUSSION_CONTEXT_MAX}
                placeholder="Background people need to weigh in"
                className="max-h-64 min-h-20 overflow-y-auto"
                aria-describedby={
                  context.length >= COUNTER_FROM ? 'start-discussion-context-count' : undefined
                }
                onChange={(event) => setContext(event.target.value)}
              />
              {context.length >= COUNTER_FROM ? (
                <p
                  id="start-discussion-context-count"
                  className="mt-1 text-right text-xs text-muted-foreground tabular-nums"
                >
                  {context.length} / {DISCUSSION_CONTEXT_MAX}
                </p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="ghost" />
              }
            >
              Cancel
            </DialogClose>
            <Button type="submit" variant="commit" disabled={!canSubmit}>
              Start discussion
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
