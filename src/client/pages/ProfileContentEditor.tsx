/* A small Dana composer for teammate content, not a second Work/Doc editor.
 * Only writing, lists, images and files are offered. Each upload remains a normal Dana file.
 */
import { useEffect, useRef, useState } from 'react'
import { BlockNoteSchema } from '@blocknote/core'
import { en } from '@blocknote/core/locales'
import { BlockNoteView } from '@blocknote/shadcn'
import { FormattingToolbarController, FilePanelController, useCreateBlockNote } from '@blocknote/react'

import { RASTER_MIMES } from '../../shared/files.js'
import { profileContent } from '../../shared/member-profile.js'
import type { ProfileContent } from '../../shared/member-profile.js'
import { uploadFile as uploadDanaFile } from '../api/http.js'
import { contentOf, richRuns } from '../components/page/canvas/adapters.js'
import { pageTheme } from '../components/page/canvas/BlockSideMenu.js'
import { CanvasFilePanel } from '../components/page/canvas/CanvasFilePanel.js'
import { CanvasFormattingToolbar } from '../components/page/canvas/CanvasFormattingToolbar.js'
import { canvasSchema } from '../components/page/canvas/schema.js'
import type { CanvasBlock } from '../components/page/canvas/schema.js'
import { Button } from '../components/ui/button.js'
import '../components/page/canvas/canvas.css'

const schema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: canvasSchema.blockSpecs.paragraph,
    bulletListItem: canvasSchema.blockSpecs.bulletListItem,
    numberedListItem: canvasSchema.blockSpecs.numberedListItem,
    image: canvasSchema.blockSpecs.image,
    file: canvasSchema.blockSpecs.file,
  },
  inlineContentSpecs: canvasSchema.inlineContentSpecs,
  styleSpecs: canvasSchema.styleSpecs,
})

type AreaBlock = ProfileContent['blocks'][number]
const fileIdOf = (url: string): string | null =>
  /^\/api\/v1\/files\/([0-9a-f-]{36})$/i.exec(url)?.[1] ?? null

function initialBlocks(content: ProfileContent, names: Readonly<Record<string,string>>): unknown[] {
  return content.blocks.map((block) => {
    if (block.kind === 'image' || block.kind === 'file') {
      const name = names[block.file_id]
      return {
        type: block.kind,
        props: { url: name === undefined ? '' : `/api/v1/files/${block.file_id}`,
                 name: name ?? 'Unavailable file' },
      }
    }
    return {
      type: block.kind === 'bullet' ? 'bulletListItem' : block.kind === 'numbered' ? 'numberedListItem' : 'paragraph',
      content: contentOf(null, block.content),
    }
  })
}

export default function ProfileContentEditor({
  folderId, initial, names, onSave, onCancel,
}: {
  readonly folderId: string
  readonly initial: ProfileContent
  readonly names: Readonly<Record<string, string>>
  readonly onSave: (content: ProfileContent) => Promise<void>
  readonly onCancel: () => void
}): React.JSX.Element {
  const fileInput = useRef<HTMLInputElement | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>(pageTheme)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const editor = useCreateBlockNote({
    schema,
    dictionary: { ...en, placeholders: { ...en.placeholders,
      emptyDocument: 'Write something, or attach a file',
      default: 'Write something, or attach a file',
    } },
    initialContent: (initial.blocks.length ? initialBlocks(initial, names) : [{type:'paragraph', content:''}]) as never,
    uploadFile: async (file) => {
      const kind = (RASTER_MIMES as readonly string[]).includes(file.type) ? 'image' : 'file'
      const result = await uploadDanaFile(kind, folderId, file)
      return { props: { url: `/api/v1/files/${result.id}`, name: file.name } }
    },
  })

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(pageTheme()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => observer.disconnect()
  }, [])

  async function upload(file: File): Promise<{url:string;name:string}> {
    const kind = (RASTER_MIMES as readonly string[]).includes(file.type) ? 'image' : 'file'
    const result = await uploadDanaFile(kind, folderId, file)
    return { url: `/api/v1/files/${result.id}`, name: file.name }
  }

  async function attach(file: File): Promise<void> {
    setUploading(true)
    setError('')
    try {
      const kind = (RASTER_MIMES as readonly string[]).includes(file.type) ? 'image' : 'file'
      const props = await upload(file)
      editor.insertBlocks([{ type: kind, props }], editor.document.at(-1)!, 'after')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The file could not be uploaded.')
    } finally {
      setUploading(false)
    }
  }

  async function save(): Promise<void> {
    if (uploading || saving) return
    const blocks: AreaBlock[] = []
    let invalidFile = false
    function append(nodes: readonly CanvasBlock[]): void {
      for (const block of nodes) {
        if (block.type === 'file' || block.type === 'image') {
          const id = fileIdOf(block.props.url)
          if (!id) invalidFile = true
          else blocks.push({ kind: block.type, file_id: id })
        } else if (block.type === 'paragraph' || block.type === 'bulletListItem' || block.type === 'numberedListItem') {
          const runs = richRuns(block)
          if (runs.some((run) => run.text.trim() !== '')) {
            blocks.push({
              kind: block.type === 'bulletListItem' ? 'bullet' : block.type === 'numberedListItem' ? 'numbered' : 'paragraph',
              content: { version: 1, runs },
            })
          }
        } else {
          invalidFile = true
        }
        append(block.children as CanvasBlock[])
      }
    }
    append(editor.document as CanvasBlock[])
    if (invalidFile) {
      setError('Upload or remove the unfinished file blocks before saving.')
      return
    }
    const parsed = profileContent.safeParse({version:1, blocks})
    if (!parsed.success) {
      setError('This content is too large or has an unsupported block. Simplify it before saving.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(parsed.data)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="space-y-[var(--space-inline)]">
    <div className="dana-writing-canvas min-h-28 rounded-md border border-input px-2 py-2 transition-colors focus-within:border-ring"
      style={{ '--dana-canvas-placeholder': JSON.stringify('Write something, or attach a file') } as React.CSSProperties}>
      <BlockNoteView editor={editor} theme={theme} formattingToolbar={false} filePanel={false}
        sideMenu={false} aria-label="Profile content" >
        <FormattingToolbarController formattingToolbar={CanvasFormattingToolbar} />
        <FilePanelController filePanel={(props) =>
          <CanvasFilePanel {...props} onUpload={(kind, file) =>
            uploadDanaFile(kind, folderId, file).then((result) =>
              ({url:`/api/v1/files/${result.id}`,name:file.name}))} />} />
      </BlockNoteView>
    </div>
    <input ref={fileInput} type="file" className="sr-only" aria-label="Attach a file"
      onChange={(event) => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (file) void attach(file)
      }}/>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button variant="ghost" size="sm" disabled={uploading || saving} onClick={() => fileInput.current?.click()}>
        {uploading ? 'Uploading…' : 'Attach file'}
      </Button>
      <div className="flex items-center gap-2">
        <Button variant="ghost" disabled={saving} onClick={onCancel}>Cancel</Button>
        <Button disabled={saving || uploading} onClick={() => {void save()}}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>
    </div>
    {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
  </div>
}
