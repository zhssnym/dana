/*
A thread's composer, read like a messaging app's: when a Reply is under way, a
slim line naming whom it answers and the first line of what they wrote, with ×
to drop it; under that, the chat field (`PostEditor`, a new post). Escape in an
empty field drops the reply too. The placeholder is "Message", in an empty
thread as well.
*/
import { Suspense, lazy, useState } from 'react'

import type { PostContent } from '../../../shared/comments.js'
import { X } from '../../lib/icons.js'
import { Button } from '../ui/button.js'

const PostEditor = lazy(() => import('./PostEditor.js'))

function ComposerFallback(): React.JSX.Element {
  return <div className="min-h-11 rounded-full border border-border bg-background" aria-busy="true" />
}

export function Composer({
  folderId,
  autoFocus = false,
  focusSignal = 0,
  replyingTo,
  onCancelReply,
  onSubmit,
}: {
  readonly folderId: string
  readonly autoFocus?: boolean
  /** Bumped by the thread to put the cursor here (Reply). */
  readonly focusSignal?: number
  /** The post a Reply answers: its author's name and the gist of its words. */
  readonly replyingTo: { readonly name: string; readonly text: string } | null
  readonly onCancelReply: () => void
  /** Resolves when posted; a rejection keeps the writing. */
  readonly onSubmit: (content: PostContent) => Promise<unknown>
}): React.JSX.Element {
  /* × takes the cursor back to the field, as Reply brought it there. */
  const [nudge, setNudge] = useState(0)
  const cancel = (): void => {
    onCancelReply()
    setNudge((value) => value + 1)
  }

  return (
    <div className="min-w-0">
      {replyingTo !== null ? (
        <div className="flex min-w-0 items-center gap-1 ps-4 pb-1">
          <div className="min-w-0 flex-1 text-xs">
            <p className="truncate text-muted-foreground">
              Replying to <span className="font-medium text-foreground">{replyingTo.name}</span>
            </p>
            {replyingTo.text !== '' ? <p className="truncate text-quiet-foreground">{replyingTo.text}</p> : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            aria-label="Cancel reply"
            title="Cancel reply"
            className="size-11 rounded-full text-muted-foreground md:size-6"
            onClick={cancel}
          >
            <X className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          </Button>
        </div>
      ) : null}
      <Suspense fallback={<ComposerFallback />}>
        <PostEditor
          folderId={folderId}
          placeholder="Message"
          submitLabel="Send"
          label="Message"
          autoFocus={autoFocus}
          focusSignal={focusSignal + nudge}
          {...(replyingTo === null ? {} : { onCancel: cancel })}
          onSubmit={onSubmit}
        />
      </Suspense>
    </div>
  )
}
