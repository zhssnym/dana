// The feedback box. The writing is saved on each change, so a closed box opens with it again.
import { lazy, Suspense, useState } from 'react'

import { FEEDBACK_KINDS } from '../../../shared/feedback.js'
import type { FeedbackContext, FeedbackKind } from '../../../shared/feedback.js'
import type { PostContent } from '../../../shared/comments.js'
import { sendFeedback } from '../../api/feedback.js'
import { Maximize2, Minimize2 } from '../../lib/icons.js'
import { Button } from '../ui/button.js'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog.js'
import { cn } from '../ui/utils.js'

const PostEditor = lazy(() => import('../thread/PostEditor.js'))

const DRAFT_KEY = 'dana-feedback-draft'

interface Draft { kind: FeedbackKind, content: PostContent | null }

function readDraft(): Draft {
  try {
    const saved = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? 'null') as Draft | null
    if (saved !== null && FEEDBACK_KINDS.includes(saved.kind)) return saved
  } catch { /* storage unavailable or bad JSON */ }
  return { kind: 'other', content: null }
}

function writeDraft(draft: Draft | null): void {
  try {
    if (draft === null) window.localStorage.removeItem(DRAFT_KEY)
    else window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch { /* storage unavailable */ }
}

function contextNow(): FeedbackContext {
  return {
    path: window.location.pathname.slice(0, 500),
    user_agent: navigator.userAgent.slice(0, 500),
    viewport: `${String(window.innerWidth)}x${String(window.innerHeight)}`,
    theme: document.documentElement.getAttribute('data-theme') ?? 'unknown',
  }
}

export function FeedbackDialog({ open, onOpenChange }: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(readDraft)
  const [sent, setSent] = useState(false)
  const [large, setLarge] = useState(false)

  function change(patch: Partial<Draft>): void {
    setDraft((previous) => {
      const next = { ...previous, ...patch }
      writeDraft(next)
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setSent(false) }}>
      <DialogContent
        className={cn(
          large
            ? 'w-[min(1100px,calc(100vw-32px))] [&_.dana-post-editor]:min-h-[55vh] [&_.dana-post-editor]:max-h-[65vh]'
            : 'w-[min(640px,calc(100vw-32px))]',
        )}
      >
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle>Send feedback</DialogTitle>
            {sent ? null : (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                aria-label={large ? 'Make smaller' : 'Make larger'}
                title={large ? 'Make smaller' : 'Make larger'}
                aria-pressed={large}
                onClick={() => setLarge(!large)}
              >
                {large ? <Minimize2 strokeWidth={1.75} aria-hidden="true" /> : <Maximize2 strokeWidth={1.75} aria-hidden="true" />}
              </Button>
            )}
          </div>
          <DialogDescription>
            {sent
              ? 'Thank you. We read every message.'
              : 'Tell us what went wrong or what you want. Paste a screenshot with Ctrl+V. Your writing is saved if you close this.'}
          </DialogDescription>
        </DialogHeader>
        {sent ? (
          <div className="mt-5 flex justify-end">
            <Button onClick={() => { onOpenChange(false); setSent(false) }}>Close</Button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <Suspense fallback={<div className="min-h-24 rounded-lg border border-border" />}>
              <PostEditor
                folderId={null}
                autoFocus
                label="Your feedback"
                placeholder="What happened, or what do you want?"
                draft={draft.content}
                onDraft={(content) => change({ content })}
                onSubmit={async (content) => {
                  // The box has no kind choice; the server still needs one.
                  await sendFeedback({ kind: 'other', content, context: contextNow() })
                  writeDraft(null)
                  setDraft({ kind: 'other', content: null })
                  setSent(true)
                }}
                renderActions={({ submit, empty, busy, attach }) => (
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <div className="mr-auto">{attach}</div>
                    <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
                    <Button type="button" disabled={empty || busy} title="Ctrl+Enter" onClick={() => { void submit() }}>
                      Send feedback
                    </Button>
                  </div>
                )}
              />
            </Suspense>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
