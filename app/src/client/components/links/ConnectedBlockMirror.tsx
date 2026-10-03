import { useEffect, useRef, useState } from 'react'
import { BlockNoteView } from '@blocknote/shadcn'
import { useCreateBlockNote } from '@blocknote/react'

import type { PageBlock, PageView } from '../../../shared/pages.js'
import { hydrateCanvas } from '../page/canvas/adapters.js'
import { pageTheme } from '../page/canvas/BlockSideMenu.js'
import { canvasSchema } from '../page/canvas/schema.js'
import '../page/canvas/canvas.css'

/**
 * One connected block has one canonical identity. A facet mirror only renders
 * that canonical PageBlock through Dana's normal canvas schema; it never owns
 * a second editable copy or a second save path.
 *
 * Navigation belongs to the source pill beside the mirror. The nested editor
 * is presentation-only so it cannot compete with the parent canvas's block
 * handles or selection model.
 */
export function mirroredBlockInput(block: PageBlock, width: number) {
  const isolated: PageBlock = {
    ...block,
    // The mirror shows the exact block, not its source document hierarchy.
    section_block_id: null,
    list_parent_block_id: null,
  }
  const page: PageView = {
    blocks: [isolated],
    items: [{ kind: 'block', id: isolated.id }],
    task_placements: [],
  }
  return hydrateCanvas(page, width)[0] ?? { id: isolated.id, type: 'paragraph' as const }
}

export function ConnectedBlockMirror({
  block,
}: {
  readonly block: PageBlock
  /** Kept in the component contract because existing callers already resolve it;
   * the visible source pill now owns navigation instead of a duplicate icon. */
  readonly sourcePath: string | null
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [theme, setTheme] = useState<'dark' | 'light'>(pageTheme)
  // useCreateBlockNote owns the editor instance; later source/width changes are
  // reconciled into that same read-only renderer below.
  const initial = mirroredBlockInput(block, 640)
  const editor = useCreateBlockNote({ schema: canvasSchema, initialContent: [initial] as never })

  useEffect(() => {
    const element = host.current
    if (element === null || typeof ResizeObserver === 'undefined') return
    const resize = new ResizeObserver(() => {
      const next = Math.max(240, Math.round(element.getBoundingClientRect().width || 640))
      setWidth((current) => current === next ? current : next)
    })
    resize.observe(element)
    return () => resize.disconnect()
  }, [])

  useEffect(() => {
    const next = mirroredBlockInput(block, width)
    editor.replaceBlocks(editor.document, [next] as never)
  }, [editor, block, width])

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(pageTheme()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={host} className="relative min-w-0" data-connected-work-mirror data-source-block-id={block.id}>
      <div className="dana-writing-canvas dana-connected-block-mirror min-w-0">
        <BlockNoteView
          editor={editor}
          editable={false}
          theme={theme}
          formattingToolbar={false}
          slashMenu={false}
          sideMenu={false}
          filePanel={false}
          aria-label="Referenced block"
        />
      </div>
    </div>
  )
}
