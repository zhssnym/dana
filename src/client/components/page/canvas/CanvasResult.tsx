// A Result block: an authored statement with its own id and Dana Link. Opened via
// `?result=<id>`, it scrolls into view, tints briefly, then clears the param.
import { createExtension } from '@blocknote/core'
import { createReactBlockSpec } from '@blocknote/react'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'

import { Flag } from '../../../lib/icons.js'
import { ReferencedFrom } from '../../links/referenced-from.js'

/**
 * Ids stored by the last save. A newer Result cannot be linked yet, so asking for
 * its backlinks would 404. Null means ask for every one.
 */
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
  }, [id, setSearch])
  // A separate effect: clearing `result` changes setSearch, which would cancel a
  // timer kept in the effect above.
  useEffect(() => {
    if (!arrived) return
    const done = window.setTimeout(() => { setArrived(false) }, 1600)
    return () => { window.clearTimeout(done) }
  }, [arrived])
  return (
    <div ref={host} className="dana-result" data-result-id={id} data-arrived={arrived ? '' : undefined}>
      <span contentEditable={false} className="dana-result-mark">
        <Flag size={14} aria-hidden="true" />
        <span className="sr-only">Result</span>
      </span>
      <div className="min-w-0 flex-1">
        <div ref={contentRef} className="min-w-0" />
        <div contentEditable={false} className="min-w-0">
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
  // Enter at the end starts the next Result; Enter on an empty one turns it into text.
  [createExtension({
    key: 'canvas-result-enter',
    keyboardShortcuts: {
      Enter: ({ editor }) => {
        const { selection } = editor.prosemirrorState
        const block = editor.getTextCursorPosition().block
        if (block.type !== 'result' || !selection.empty) return false
        if (!Array.isArray(block.content) || block.content.length === 0) {
          editor.updateBlock(block, { type: 'paragraph' })
          return true
        }
        if (selection.$from.parentOffset !== selection.$from.parent.content.size) return false
        editor.transact(() => {
          const [next] = editor.insertBlocks([{ type: 'result' }], block, 'after')
          if (next !== undefined) editor.setTextCursorPosition(next)
        })
        return true
      },
    },
  })],
)
