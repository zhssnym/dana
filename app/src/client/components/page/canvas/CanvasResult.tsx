/*
A native Result (#213): one block of a Folder's Results tab that has its own
identity (the block id), an authored statement, and nothing else. It is not a
Task: no assignee, no dates, no status. Its Dana Link is `/app/results/:id`.

Below the statement, "Referenced from" (#214) lists the places that link to
it — a Task, Purpose, a Discussion — so the connection reads from both ends
without a relationship editor. Absent while nothing links here.

Opened by its link (`?result=<id>` on the Folder, `ResultLinkPage`), the block
scrolls itself into view once.
*/
import { createReactBlockSpec } from '@blocknote/react'
import { useEffect, useRef } from 'react'

import { Flag } from '../../../lib/icons.js'
import { ReferencedFrom } from '../../links/referenced-from.js'

function ResultBody({ id, contentRef }: { readonly id: string; readonly contentRef: (node: HTMLElement | null) => void }): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('result') !== id) return
    host.current?.scrollIntoView({ block: 'center' })
  }, [id])
  return (
    <div ref={host} className="dana-result" data-result-id={id}>
      <span contentEditable={false} className="dana-result-mark">
        <Flag size={14} aria-hidden="true" />
        <span className="sr-only">Result</span>
      </span>
      <div className="min-w-0 flex-1">
        <div ref={contentRef} className="min-w-0" />
        <div contentEditable={false}>
          <ReferencedFrom kind="result" id={id} className="mt-1" />
        </div>
      </div>
    </div>
  )
}

export const createCanvasResult = createReactBlockSpec(
  {
    type: 'result',
    propSchema: {},
    content: 'inline',
  },
  {
    render: ({ block, contentRef }) => <ResultBody id={block.id} contentRef={contentRef} />,
    toExternalHTML: ({ contentRef }) => (
      <p>
        <span ref={contentRef} />
      </p>
    ),
  },
)
