/* The Responsibility document is still separately versioned and authorized;
 * only its editing surface changes from Markdown syntax to a small Dana composer.
 */
import { useEffect, useState } from 'react'
import { BlockNoteSchema, createHeadingBlockSpec } from '@blocknote/core'
import { en } from '@blocknote/core/locales'
import { BlockNoteView } from '@blocknote/shadcn'
import { FormattingToolbarController, useCreateBlockNote } from '@blocknote/react'

import { responsibilityDocument } from '../../shared/responsibility.js'
import type { ResponsibilityDocument } from '../../shared/responsibility.js'
import { contentOf, richRuns } from '../components/page/canvas/adapters.js'
import { pageTheme } from '../components/page/canvas/BlockSideMenu.js'
import { CanvasFormattingToolbar } from '../components/page/canvas/CanvasFormattingToolbar.js'
import { canvasSchema } from '../components/page/canvas/schema.js'
import type { CanvasBlock } from '../components/page/canvas/schema.js'
import { Button } from '../components/ui/button.js'
import '../components/page/canvas/canvas.css'

const schema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: canvasSchema.blockSpecs.paragraph,
    bulletListItem: canvasSchema.blockSpecs.bulletListItem,
    heading: createHeadingBlockSpec({levels: [1, 2, 3], defaultLevel: 1}),
  },
  inlineContentSpecs: canvasSchema.inlineContentSpecs,
  styleSpecs: canvasSchema.styleSpecs,
})

interface InitialBlock {type:string;props?:{level:number};content:unknown;children:InitialBlock[]}

function initialBlocks(document: ResponsibilityDocument | null): InitialBlock[] {
  const root: InitialBlock[] = []
  const parents: Array<InitialBlock | undefined> = []
  for (const block of document?.blocks ?? []) {
    const node: InitialBlock = {
      type: block.kind === 'heading' ? 'heading' : block.kind === 'bullet' ? 'bulletListItem' : 'paragraph',
      ...(block.kind === 'heading' ? {props:{level:block.level}} : {}),
      content: contentOf(null, block.content), children: [],
    }
    if (block.kind === 'bullet') {
      const parent = block.depth > 0 ? parents[block.depth - 1] : undefined
      if (parent) parent.children.push(node)
      else root.push(node)
      parents[block.depth] = node
      parents.length = block.depth + 1
    } else {
      root.push(node)
      parents.length = 0
    }
  }
  return root.length ? root : [{type:'paragraph',content:'',children:[]}]
}

export default function ProfileResponsibilitiesEditor({
  initial, onCancel, onSave,
}: {
  readonly initial: ResponsibilityDocument | null
  readonly onCancel: () => void
  readonly onSave: (content: ResponsibilityDocument) => Promise<void>
}): React.JSX.Element {
  const [theme, setTheme] = useState<'dark' | 'light'>(pageTheme)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const editor = useCreateBlockNote({
    schema,
    dictionary: { ...en, placeholders: { ...en.placeholders,
      emptyDocument: 'What this teammate is responsible for',
      default: 'What this teammate is responsible for',
    } },
    initialContent: initialBlocks(initial) as never,
  })
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(pageTheme()))
    observer.observe(document.documentElement, {attributes:true,attributeFilter:['class','data-theme']})
    return () => observer.disconnect()
  }, [])

  async function save(): Promise<void> {
    const blocks: ResponsibilityDocument['blocks'] = []
    let invalid = false
    function visit(nodes: readonly CanvasBlock[], depth: number): void {
      for (const block of nodes) {
        const runs = richRuns(block)
        if (runs.some((run) => run.text.trim() !== '')) {
          const content = {version:1 as const, runs}
          if (block.type === 'heading')
            blocks.push({kind:'heading',level:Math.min(3, Math.max(1, Number(block.props.level))),content})
          else if (block.type === 'bulletListItem')
            blocks.push({kind:'bullet',depth:Math.min(2,depth),content})
          else if (block.type === 'paragraph')
            blocks.push({kind:'paragraph',content})
          else invalid = true
        }
        visit(block.children as CanvasBlock[], block.type === 'bulletListItem' ? depth + 1 : depth)
      }
    }
    visit(editor.document as CanvasBlock[], 0)
    const parsed = responsibilityDocument.safeParse({version:1,blocks})
    if (invalid || !parsed.success) {
      setError('This document is too long or contains an unsupported block.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(parsed.data)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save responsibilities.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="space-y-[var(--space-inline)]">
    <div className="dana-writing-canvas min-h-24 rounded-md border border-input px-2 py-2 focus-within:border-ring"
      style={{ '--dana-canvas-placeholder': JSON.stringify('What this teammate is responsible for') } as React.CSSProperties}>
      <BlockNoteView editor={editor} theme={theme} formattingToolbar={false}
        slashMenu={true} sideMenu={false} filePanel={false} aria-label="Edit responsibilities">
        <FormattingToolbarController formattingToolbar={CanvasFormattingToolbar}/>
      </BlockNoteView>
    </div>
    <div className="flex justify-end gap-2">
      <Button variant="ghost" disabled={saving} onClick={onCancel}>Cancel</Button>
      <Button disabled={saving} onClick={() => {void save()}}>{saving ? 'Saving…' : 'Save'}</Button>
    </div>
    {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
  </div>
}
