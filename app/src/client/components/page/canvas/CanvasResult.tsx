/*
A native Result (#213): one block of a Folder's Results tab that has its own
identity (the block id), an authored statement, and nothing else. It is not a
Task: no assignee, no dates, no status. Its Dana Link is `/app/results/:id`.

Below the statement, "Referenced from" (#214) lists the places that link to
it — a Task, Purpose, a Discussion — so the connection reads from both ends
without a relationship editor. Absent while nothing links here.

Opened by its link (`?result=<id>` on the Folder, `ResultLinkPage`), the block
scrolls itself into view once and is tinted for a moment, so the eye lands on
the one it was sent to. The arrival is then taken out of the address, so a
later tab switch or reload does not play it again.
*/
import { createReactBlockSpec } from '@blocknote/react'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'

import { Flag } from '../../../lib/icons.js'
import { ReferencedFrom } from '../../links/referenced-from.js'

/** The ids of the Results the page's last save stored (`FolderCanvas`).
 * One written since cannot be linked to yet, and asking for its
 * "Referenced from" would only be a 404. Null (no provider): ask for every one. */
export const SavedResults = createContext<ReadonlySet<string> | null>(null)

function ResultBody({ id, contentRef }: { readonly id: string; readonly contentRef: (node: HTMLElement | null) => void }): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const saved = useContext(SavedResults)
  const [arrived, setArrived] = useState(false)
  const [, setSearch] = useSearchParams()
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('result') !== id) return
    host.current?.scrollIntoView({ block: 'center' })
    setArrived(true)
    setSearch((current) => {
      const next = new URLSearchParams(current)
      next.delete('result')
      return next
    }, { replace: true })
    const done = window.setTimeout(() => { setArrived(false) }, 1600)
    return () => { window.clearTimeout(done) }
  }, [id, setSearch])
  return (
    <div ref={host} className="dana-result" data-result-id={id} data-arrived={arrived ? '' : undefined}>
      <span contentEditable={false} className="dana-result-mark">
        <Flag size={14} aria-hidden="true" />
        <span className="sr-only">Result</span>
      </span>
      <div className="min-w-0 flex-1">
        <div ref={contentRef} className="min-w-0" />
        <div contentEditable={false}>
          {saved === null || saved.has(id) ? <ReferencedFrom kind="result" id={id} className="mt-1" /> : null}
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
