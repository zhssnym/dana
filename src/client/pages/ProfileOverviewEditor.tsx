import { useEffect, useState } from 'react'
import { BlockNoteSchema } from '@blocknote/core'
import { en } from '@blocknote/core/locales'
import { BlockNoteView } from '@blocknote/shadcn'
import { FormattingToolbarController, useCreateBlockNote } from '@blocknote/react'

import type { RichContent } from '../../shared/rich-content.js'
import { contentOf, richRuns } from '../components/page/canvas/adapters.js'
import { pageTheme } from '../components/page/canvas/BlockSideMenu.js'
import { CanvasFormattingToolbar } from '../components/page/canvas/CanvasFormattingToolbar.js'
import { canvasSchema } from '../components/page/canvas/schema.js'
import type { CanvasBlock } from '../components/page/canvas/schema.js'
import { Button } from '../components/ui/button.js'
import '../components/page/canvas/canvas.css'

const schema = BlockNoteSchema.create({
  blockSpecs: { paragraph: canvasSchema.blockSpecs.paragraph },
  inlineContentSpecs: canvasSchema.inlineContentSpecs,
  styleSpecs: canvasSchema.styleSpecs,
})

export default function ProfileOverviewEditor({ initial, text, onSave, onCancel }: {
  readonly initial: RichContent | null
  readonly text: string | null
  readonly onSave: (content: RichContent | null) => Promise<void>
  readonly onCancel: () => void
}): React.JSX.Element {
  const [theme, setTheme] = useState<'dark' | 'light'>(pageTheme)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const editor = useCreateBlockNote({
    schema,
    dictionary: { ...en, placeholders: { ...en.placeholders, emptyDocument: 'A short bio', default: 'A short bio' } },
    initialContent: [{ type: 'paragraph', content: contentOf(text, initial) }] as never,
  })

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(pageTheme()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => observer.disconnect()
  }, [])

  async function save(): Promise<void> {
    const runs = editor.document.flatMap((block, index) =>
      index === 0 ? richRuns(block as CanvasBlock) : [{ text: ' ' }, ...richRuns(block as CanvasBlock)],
    )
    const content: RichContent | null = runs.map((run) => run.text).join('').trim() === ''
      ? null
      : { version: 1, runs }
    if (content !== null && content.runs.map((run) => run.text).join('').trim().length > 500) {
      setError('Keep the bio under 500 characters.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(content)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The overview was not saved. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="flex flex-col gap-[var(--space-inline)]">
    <div className="dana-writing-canvas min-h-[var(--row-height)] rounded-md border border-input px-[var(--space-inline)] py-[var(--space-inline)] focus-within:border-ring"
      style={{ '--dana-canvas-placeholder': JSON.stringify('A short bio') } as React.CSSProperties}
      onKeyDownCapture={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) event.preventDefault()
      }}>
      <BlockNoteView editor={editor} theme={theme} formattingToolbar={false} slashMenu={false}
        sideMenu={false} filePanel={false} aria-label="Bio">
        <FormattingToolbarController formattingToolbar={CanvasFormattingToolbar} />
      </BlockNoteView>
    </div>
    {error === '' ? null : <p role="alert" className="text-xs text-destructive">{error}</p>}
    <div className="flex justify-end gap-[var(--space-inline)]">
      <Button variant="ghost" disabled={saving} onClick={onCancel}>Cancel</Button>
      <Button disabled={saving} onClick={() => { void save() }}>Save</Button>
    </div>
  </div>
}
