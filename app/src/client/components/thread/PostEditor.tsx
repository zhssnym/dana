/*
The post composer (W-C): the page canvas's editor, for a thread.

**The schema is the canvas's own, less the pages-only blocks** (Task, the
Shelf's folder row, diagram) — the post contract (`shared/comments.ts`) has no
kind for any of them — so the slash menu (`slash-items.tsx`, surface
`document`: flat headings, no Task, no Section) cannot offer one. Nothing of
the canvas is forked: the block specs, the slash menu, the formatting toolbar,
the file panel and the `@` menu (people, then pages) are the canvas's.

**Files.** An image pasted, dropped or picked uploads at once through
`POST /files` (the canvas's upload), and the block holds its served URL; the
post then names the id in its content and in `file_ids`, which the server
requires. Ctrl/Cmd+Enter posts; so does the one button.

Default export: `React.lazy` keeps BlockNote out of the page's own chunk.
*/
import { useEffect, useRef, useState } from 'react'
import { BlockNoteSchema } from '@blocknote/core'
import { en } from '@blocknote/core/locales'
import { BlockNoteView } from '@blocknote/shadcn'
import { FilePanelController, FormattingToolbarController, useCreateBlockNote } from '@blocknote/react'
import '@blocknote/shadcn/style.css'

import type { CommentFile, PostContent } from '../../../shared/comments.js'
import { uploadFile } from '../../api/http.js'
import { Button } from '../ui/button.js'
import { MentionSuggestions } from '../page/canvas/mentions.js'
import { pageTheme } from '../page/canvas/BlockSideMenu.js'
import { CanvasFilePanel } from '../page/canvas/CanvasFilePanel.js'
import type { CanvasMediaKind } from '../page/canvas/CanvasFilePanel.js'
import { CanvasFormattingToolbar } from '../page/canvas/CanvasFormattingToolbar.js'
import { canvasSchema } from '../page/canvas/schema.js'
import type { CanvasEditor } from '../page/canvas/schema.js'
import { CanvasSlashMenu } from '../page/canvas/slash-items.js'
import { editorBlocksOf, editorBlocksOfBody, fileUrl, postContentOf } from './adapters.js'
import type { LooseBlock } from './adapters.js'
import '../page/canvas/canvas.css'

/* The canvas's blocks without the pages-only three. */
const { danaTask: _task, danaFolder: _folder, diagram: _diagram, ...postBlockSpecs } = canvasSchema.blockSpecs
const postSchema = BlockNoteSchema.create({
  blockSpecs: postBlockSpecs,
  inlineContentSpecs: canvasSchema.inlineContentSpecs,
  styleSpecs: canvasSchema.styleSpecs,
})

const SLASH = { surface: 'document', media: true } as const

export interface PostEditorProps {
  /** Where an upload is stored (the thread's folder). */
  readonly folderId: string
  /** Editing an existing post: its content (or its plain body when older). */
  readonly initial?: { readonly content: PostContent | null | undefined; readonly body: string | null; readonly files: readonly CommentFile[] }
  readonly placeholder?: string
  readonly submitLabel?: string
  readonly autoFocus?: boolean
  /** Bumped by the thread to put the cursor here (Reply). */
  readonly focusSignal?: number
  /** Resolves when posted; a rejection keeps the writing. */
  readonly onSubmit: (content: PostContent) => Promise<unknown>
  readonly onCancel?: () => void
  readonly label?: string
}

export default function PostEditor({
  folderId,
  initial,
  placeholder = 'Write a reply…',
  submitLabel = 'Post',
  autoFocus = false,
  focusSignal = 0,
  onSubmit,
  onCancel,
  label = 'Write a post',
}: PostEditorProps): React.JSX.Element {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [empty, setEmpty] = useState(initial === undefined)

  async function upload(kind: CanvasMediaKind, file: File): Promise<{ url: string; name: string }> {
    try {
      const stored = await uploadFile(kind, folderId, file)
      setError('')
      return { url: fileUrl(stored.id), name: file.name }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The file could not be uploaded. Try again.')
      throw failure
    }
  }

  const editorRef = useRef<typeof postSchema.BlockNoteEditor | null>(null)
  const editor = useCreateBlockNote({
    schema: postSchema,
    dictionary: { ...en, placeholders: { ...en.placeholders, emptyDocument: placeholder, default: '' } },
    initialContent: (initial === undefined
      ? undefined
      : initial.content
        ? editorBlocksOf(initial.content.blocks, initial.files)
        : editorBlocksOfBody(initial.body)) as never,
    uploadFile: async (file: File, blockId?: string): Promise<{ props: { url: string; name: string } }> => {
      const type = blockId === undefined ? undefined : editorRef.current?.getBlock(blockId)?.type
      const kind: CanvasMediaKind = type === 'audio' || type === 'video' || type === 'file' ? type : 'image'
      return { props: await upload(kind, file) }
    },
  })
  editorRef.current = editor

  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!autoFocus && focusSignal === 0) return
    const timer = window.setTimeout(() => {
      editor.focus()
      const last = editor.document.at(-1)
      if (last !== undefined) editor.setTextCursorPosition(last, 'end')
      host.current?.scrollIntoView({ block: 'nearest' })
    }, 0)
    return () => {
      window.clearTimeout(timer)
    }
  }, [editor, autoFocus, focusSignal])

  function read(): PostContent | null {
    try {
      return postContentOf(editor.document as unknown as LooseBlock[])
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'This post cannot be sent yet.')
      return null
    }
  }

  async function submit(): Promise<void> {
    if (busy) return
    const content = read()
    if (content === null) return
    setBusy(true)
    setError('')
    try {
      await onSubmit(content)
      if (initial === undefined) {
        editor.replaceBlocks(editor.document, [{ type: 'paragraph' }])
        setEmpty(true)
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Not posted. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      ref={host}
      className="min-w-0"
      onKeyDownCapture={(event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          event.stopPropagation()
          void submit()
        } else if (event.key === 'Escape' && onCancel !== undefined && !event.defaultPrevented) {
          /* BlockNote's own menus close on their Escape first. */
          const menu = document.querySelector('.bn-suggestion-menu, .bn-formatting-toolbar')
          if (menu === null) onCancel()
        }
      }}
    >
      <div
        className="dana-writing-canvas dana-post-editor max-h-[60vh] min-h-10 min-w-0 overflow-y-auto rounded-md border border-border bg-background px-3 py-2 focus-within:border-ring"
        /* BlockNote's placeholder never reaches the canvas paragraph; canvas.css draws this one. */
        style={{ '--dana-canvas-placeholder': JSON.stringify(placeholder) } as React.CSSProperties}
      >
        <BlockNoteView
          editor={editor}
          theme={pageTheme()}
          formattingToolbar={false}
          slashMenu={false}
          sideMenu={false}
          filePanel={false}
          aria-label={label}
          onChange={() => {
            try {
              setEmpty(postContentOf(editor.document as unknown as LooseBlock[]) === null)
            } catch {
              setEmpty(false)
            }
          }}
        >
          <FormattingToolbarController formattingToolbar={CanvasFormattingToolbar} />
          <FilePanelController filePanel={(props) => <CanvasFilePanel {...props} onUpload={upload} />} />
          <CanvasSlashMenu editor={editor as unknown as CanvasEditor} context={SLASH} />
          <MentionSuggestions editor={editor as unknown as CanvasEditor} folderId={folderId} />
        </BlockNoteView>
      </div>
      <div className="mt-2 flex items-center justify-end gap-2">
        {error !== '' ? <p role="alert" className="mr-auto min-w-0 text-xs text-destructive">{error}</p> : null}
        {onCancel !== undefined ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button
          type="button"
          variant="commit"
          size="sm"
          disabled={busy || empty}
          title="Ctrl+Enter"
          onClick={() => {
            void submit()
          }}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}
