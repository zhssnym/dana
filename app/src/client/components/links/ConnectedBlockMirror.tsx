import { useEffect, useRef, useState } from 'react'
import { BlockNoteView } from '@blocknote/shadcn'
import { useCreateBlockNote } from '@blocknote/react'
import { Link as RouterLink } from 'react-router'

import type { PageBlock, PageView } from '../../../shared/pages.js'
import { ExternalLink } from '../../lib/icons.js'
import { dehydrateCanvas, hydrateCanvas } from '../page/canvas/adapters.js'
import type { CanvasDocument } from '../page/canvas/adapters.js'
import { pageTheme } from '../page/canvas/BlockSideMenu.js'
import { canvasSchema } from '../page/canvas/schema.js'
import type { CanvasBlock } from '../page/canvas/schema.js'
import '../page/canvas/canvas.css'

export type ConnectedMirrorRecord = CanvasDocument['blocks'][number]

/**
 * One connected block has one canonical identity. The mirror uses Dana's
 * normal canvas renderer, but edits are committed back to that canonical block
 * through the source document's ordinary transaction path. There is never a
 * second durable copy.
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

function canonicalRecord(block: PageBlock): ConnectedMirrorRecord {
  return {
    id: block.id,
    block_kind: block.kind,
    text: block.text,
    rich_content: block.rich_content ?? null,
    file_id: block.file_id,
    ref_folder_id: block.ref_folder_id,
    width_pct: block.width_pct,
    checked: block.checked,
    toggleable: block.toggleable === true ? true : null,
  }
}

/** The nested editor may edit the source block's authored content, but it may
 * not silently turn one connected source into another kind or change placement
 * facts that belong to the source page (parents, media identity or width). */
function editedRecord(
  editor: ReturnType<typeof useCreateBlockNote>,
  block: PageBlock,
  width: number,
): ConnectedMirrorRecord | null {
  const refs: ReadonlyMap<string, string> = block.ref_folder_id === null
    ? new Map()
    : new Map([[block.id, block.ref_folder_id]])
  const projection = dehydrateCanvas(editor.document as readonly CanvasBlock[], width, refs)
  if (projection.blocks.length !== 1) return null
  const next = projection.blocks[0]
  if (next === undefined || next.id !== block.id || next.block_kind !== block.kind) return null
  return {
    ...next,
    file_id: block.file_id,
    ref_folder_id: block.ref_folder_id,
    width_pct: block.width_pct,
    toggleable: block.toggleable === true ? true : null,
  }
}

export function ConnectedBlockMirror({
  block,
  sourcePath,
  editable = false,
  onCommit,
}: {
  readonly block: PageBlock
  readonly sourcePath: string | null
  readonly editable?: boolean
  readonly onCommit?: (record: ConnectedMirrorRecord) => Promise<void>
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [theme, setTheme] = useState<'dark' | 'light'>(pageTheme)
  const [saveError, setSaveError] = useState('')
  const syncing = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const serial = useRef<Promise<void>>(Promise.resolve())
  const blockRef = useRef(block)
  const commitRef = useRef(onCommit)
  blockRef.current = block
  commitRef.current = onCommit

  const initial = mirroredBlockInput(block, 640)
  const editor = useCreateBlockNote({ schema: canvasSchema, initialContent: [initial] as never })

  useEffect(() => () => { window.clearTimeout(timer.current) }, [])

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

  /* A successful mirror save comes back through Connected work. Do not replace
     the nested editor when it already equals that canonical response; doing so
     would needlessly move the caret after every save. */
  useEffect(() => {
    const current = editedRecord(editor, block, width)
    if (current !== null && JSON.stringify(current) === JSON.stringify(canonicalRecord(block))) return
    syncing.current = true
    editor.replaceBlocks(editor.document, [mirroredBlockInput(block, width)] as never)
    queueMicrotask(() => { syncing.current = false })
  }, [editor, block, width])

  useEffect(() => {
    const off = editor.onChange(() => {
      if (!editable || syncing.current || commitRef.current === undefined) return
      const source = blockRef.current
      const next = editedRecord(editor, source, width)
      if (next === null) {
        syncing.current = true
        editor.replaceBlocks(editor.document, [mirroredBlockInput(source, width)] as never)
        queueMicrotask(() => { syncing.current = false })
        return
      }
      if (JSON.stringify(next) === JSON.stringify(canonicalRecord(source))) return
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        const commit = commitRef.current
        if (commit === undefined) return
        setSaveError('')
        serial.current = serial.current
          .catch(() => undefined)
          .then(() => commit(next))
          .catch((error: unknown) => {
            setSaveError(error instanceof Error ? error.message : 'The source block could not be updated.')
          })
      }, 400)
    })
    return () => { off() }
  }, [editor, editable, width])

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(pageTheme()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={host}
      className="group/mirror relative min-w-0"
      data-connected-work-mirror
      data-source-block-id={block.id}
      onPointerDown={(event) => { event.stopPropagation() }}
      onClick={(event) => { event.stopPropagation() }}
      onKeyDown={(event) => {
        event.stopPropagation()
        // One mirror is one canonical block. Structural splitting belongs in
        // the source page; Shift+Enter remains available for a soft break.
        if (editable && block.kind !== 'code' && event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
        }
      }}
    >
      {sourcePath === null ? null : (
        <RouterLink
          to={sourcePath}
          aria-label="Open source block"
          title="Open source block"
          className="absolute right-0 top-0 z-30 inline-flex size-6 items-center justify-center rounded-sm bg-background/85 text-muted-foreground opacity-0 shadow-sm hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/mirror:opacity-100"
          onPointerDown={(event) => { event.stopPropagation() }}
          onClick={(event) => { event.stopPropagation() }}
        >
          <ExternalLink size={12} aria-hidden="true" />
        </RouterLink>
      )}
      <div className="dana-writing-canvas dana-connected-block-mirror min-w-0">
        <BlockNoteView
          editor={editor}
          editable={editable}
          theme={theme}
          formattingToolbar={editable}
          slashMenu={false}
          sideMenu={false}
          filePanel={false}
          aria-label={editable ? 'Editable referenced block' : 'Referenced block'}
        />
      </div>
      {saveError === '' ? null : <p role="alert" className="mt-1 text-[11px] text-destructive">{saveError}</p>}
    </div>
  )
}
