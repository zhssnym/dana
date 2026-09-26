/*
"Add a comment", GitHub's composer (RESEARCH-ISSUE 3.6): the post editor in
a box, then "Close issue ▾" (as completed, or as not planned from its menu)
or "Reopen issue", and "Comment". With words in the editor the state button
reads "Close with comment" and posts before it closes. Dana's editor is
WYSIWYG, so there are no Write and Preview tabs.

Someone who may not comment still gets the state buttons, but only the ones
their access lets them press: closing as completed and reopening a completed
issue need task.status.complete, not planned and its reopening need
task.status.abandon.
*/
import { Suspense, lazy, useEffect, useRef } from 'react'

import { postFileIds } from '../../../../shared/comments.js'
import type { PostContent } from '../../../../shared/comments.js'
import { Button } from '../../../components/ui/button.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu.js'
import { ChevronDown } from '../../../lib/icons.js'
import { StateMark } from '../IssueParts.js'
import type { IssueState } from '../issues.js'

const PostEditor = lazy(() => import('../../../components/thread/PostEditor.js'))

export function postBody(content: PostContent): { content: PostContent; file_ids?: string[] } {
  const ids = [...new Set(postFileIds(content))]
  return ids.length > 0 ? { content, file_ids: ids } : { content }
}

export interface StateMay {
  readonly complete: boolean
  readonly abandon: boolean
}

function StateButtons(props: {
  readonly state: IssueState
  readonly may: StateMay
  readonly withComment: boolean
  readonly busy: boolean
  readonly onClose: (reason: 'completed' | 'not-planned') => void
  readonly onReopen: () => void
}): React.JSX.Element | null {
  const { state, withComment, may } = props
  /* Closing swaps "Close issue" for "Reopen issue" (and back), so the pressed
     button unmounts and focus would fall to the body. Once the state has
     moved, focus goes to the button that took its place. */
  const pressed = useRef(false)
  useEffect(() => {
    if (!pressed.current) return
    pressed.current = false
    document.querySelector<HTMLElement>('[data-issue-state-button]')?.focus()
  }, [state])
  const close = (reason: 'completed' | 'not-planned'): void => {
    pressed.current = true
    props.onClose(reason)
  }
  const reopen = (): void => {
    pressed.current = true
    props.onReopen()
  }
  if (state !== 'open') {
    if (!(state === 'completed' ? may.complete : may.abandon)) return null
    return (
      <Button variant="outline" disabled={props.busy} data-issue-state-button onClick={reopen}>
        <StateMark state="open" className="size-3.5" />
        {withComment ? 'Reopen with comment' : 'Reopen issue'}
      </Button>
    )
  }
  if (!may.complete) return null
  if (!may.abandon) {
    return (
      <Button variant="outline" disabled={props.busy} data-issue-state-button onClick={() => close('completed')}>
        <StateMark state="completed" className="size-3.5" />
        {withComment ? 'Close with comment' : 'Close issue'}
      </Button>
    )
  }
  return (
    <div className="flex">
      <Button
        variant="outline"
        disabled={props.busy}
        className="rounded-r-none"
        data-issue-state-button
        onClick={() => close('completed')}
      >
        <StateMark state="completed" className="size-3.5" />
        {withComment ? 'Close with comment' : 'Close issue'}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="icon"
              disabled={props.busy}
              aria-label="More ways to close"
              className="-ml-px rounded-l-none"
            />
          }
        >
          <ChevronDown className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem onClick={() => close('completed')} className="items-start">
            <StateMark state="completed" className="mt-0.5 size-3.5" />
            <span className="flex flex-col">
              <span>Close as completed</span>
              <span className="text-xs text-muted-foreground">Done, closed, no more work</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => close('not-planned')} className="items-start">
            <StateMark state="not-planned" className="mt-0.5 size-3.5" />
            <span className="flex flex-col">
              <span>Close as not planned</span>
              <span className="text-xs text-muted-foreground">Won't do, duplicate or stale</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function IssueComposer(props: {
  readonly folderId: string
  readonly state: IssueState
  readonly canComment: boolean
  readonly may: StateMay
  readonly onPost: (content: PostContent) => Promise<unknown>
  readonly onClose: (reason: 'completed' | 'not-planned') => void
  readonly onReopen: () => void
}): React.JSX.Element | null {
  const { state, may } = props
  if (!props.canComment) {
    const allowed = state === 'open' ? may.complete : state === 'completed' ? may.complete : may.abandon
    if (!allowed) return null
    return (
      <div className="flex justify-end pt-4">
        <StateButtons state={state} may={may} withComment={false} busy={false} onClose={props.onClose} onReopen={props.onReopen} />
      </div>
    )
  }
  return (
    <section aria-label="Add a comment" className="relative z-10 flex flex-col gap-2 bg-background pt-4">
      <h2 className="text-sm font-section text-foreground">Add a comment</h2>
      <Suspense fallback={<div className="h-28 rounded-lg border border-border" aria-busy="true" />}>
        <PostEditor
          folderId={props.folderId}
          label="Comment"
          placeholder="Leave a comment"
          submitLabel="Comment"
          onSubmit={props.onPost}
          renderActions={({ submit, empty, busy }) => (
            <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
              <StateButtons
                state={state}
                may={may}
                withComment={!empty}
                busy={busy}
                onClose={(reason) => {
                  if (empty) {
                    props.onClose(reason)
                    return
                  }
                  void submit().then((posted) => {
                    if (posted) props.onClose(reason)
                  })
                }}
                onReopen={() => {
                  if (empty) {
                    props.onReopen()
                    return
                  }
                  void submit().then((posted) => {
                    if (posted) props.onReopen()
                  })
                }}
              />
              <Button variant="commit" disabled={empty || busy} title="Ctrl+Enter" onClick={() => void submit()}>
                Comment
              </Button>
            </div>
          )}
        />
      </Suspense>
    </section>
  )
}
