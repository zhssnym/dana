import { useEffect, useMemo, useRef, useState } from 'react'
import { BlockNoteView } from '@blocknote/shadcn'
import { useCreateBlockNote } from '@blocknote/react'
import { Link as RouterLink } from 'react-router'

import type { PageBlock, PageView } from '../../../shared/pages.js'
import { ExternalLink } from '../../lib/icons.js'
import { hydrateCanvas } from '../page/canvas/adapters.js'
import { pageTheme } from '../page/canvas/BlockSideMenu.js'
import { canvasSchema } from '../page/canvas/schema.js'
import '../page/canvas/canvas.css'

/**
 * One connected block has one canonical identity. A facet mirror only renders
 * that canonical PageBlock through Dana's normal canvas schema; it never owns
 * a second editable copy or a second save path.
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
  sourcePath,
}: {
  readonly block: PageBlock
  readonly sourcePath: string | null
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [theme, setTheme] = useState<'dark' | 'light'>(pageTheme)
  const signature = useMemo(() => JSON.stringify(block), [block])
  const initial = useMemo(() => mirroredBlockInput(block, width), []) // the effect below keeps it live
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
  }, [editor, signature, width, block])

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(pageTheme()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={host} className="group/mirror relative min-w-0" data-connected-work-mirror data-source-block-id={block.id}>
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
      {sourcePath === null ? null : (
        <RouterLink
          to={sourcePath}
          title="Open source"
          aria-label="Open source block"
          className="absolute right-0 top-0 z-20 inline-flex size-6 items-center justify-center rounded-sm bg-background/90 text-muted-foreground opacity-0 shadow-sm hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring group-hover/mirror:opacity-100 pointer-coarse:opacity-100"
        >
          <ExternalLink size={13} aria-hidden="true" />
        </RouterLink>
      )}
    </div>
  )
}
