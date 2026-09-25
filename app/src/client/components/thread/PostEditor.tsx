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
requires.

**Keys.** A new post (no `initial`) takes Slack's keys: Enter sends and
Shift+Enter keeps BlockNote's line break. Enter falls through to the editor
while an IME is composing, while a slash or `@` menu is open, when the caret is
in a list item or a code block, when the key came from outside this editor
(a portaled popover such as the file panel's URL field), and on a touch-first
device, where Enter is a newline and the Send button sends. Editing a post
(`initial` given) keeps the editor's keys: Enter makes a new block and Esc
cancels. Ctrl/Cmd+Enter always sends or saves.

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
import { SendHorizontal } from '../../lib/icons.js'
import { Button } from '../ui/button.js'
import { cn } from '../ui/utils.js'
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

const SLASH = { surface: 'post', media: true } as const

/* Where Enter belongs to the editor, not to Send. */
const ENTER_KEEPS = new Set(['bulletListItem', 'numberedListItem', 'checkListItem', 'toggleListItem', 'codeBlock'])

function touchFirst(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

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
  const editing = initial !== undefined
  const [coarse] = useState(touchFirst)

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
    /* A second Enter while a post is on its way sends too (the first one's
       words have already left the editor); only an edit waits. */
    if (busy && editing) return
    const content = read()
    if (content === null) return
    setBusy(true)
    setError('')
    /* A new post leaves the composer the moment it is sent, as in Slack, so
       whatever is typed while it is on its way stays and is never wiped (r5).
       A refusal puts the sent words back ahead of anything typed since. */
    const sent = editing ? null : editor.document
    if (sent !== null) {
      editor.replaceBlocks(editor.document, [{ type: 'paragraph' }])
      setEmpty(true)
    }
    try {
      await onSubmit(content)
    } catch (failure) {
      if (sent !== null) {
        const first = editor.document[0]
        if (read() === null || first === undefined) editor.replaceBlocks(editor.document, sent)
        else editor.insertBlocks(sent, first, 'before')
        setEmpty(false)
      }
      setError(failure instanceof Error ? failure.message : 'Not posted. Try again.')
    } finally {
      setBusy(false)
    }
  }

  /** Enter on a new post sends, unless the editor needs that Enter. */
  function enterSends(event: React.KeyboardEvent<HTMLDivElement>): boolean {
    if (editing || coarse) return false
    if (event.shiftKey || event.altKey || event.nativeEvent.isComposing || event.keyCode === 229) return false
    const own = host.current?.querySelector('.ProseMirror')
    if (!(event.target instanceof Node) || own == null || !own.contains(event.target)) return false
    if (document.querySelector('.bn-suggestion-menu') !== null) return false
    try {
      return !ENTER_KEEPS.has(editor.getTextCursorPosition().block.type)
    } catch {
      return false
    }
  }

  const sendTitle = editing ? 'Ctrl+Enter' : coarse ? undefined : 'Enter to send'

  return (
    <div
      ref={host}
      className="min-w-0"
      /* The thread reads this: Escape in an empty new post leaves it. */
      data-post-editor={editing ? 'edit' : 'new'}
      onKeyDownCapture={(event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          event.stopPropagation()
          void submit()
        } else if (event.key === 'Enter' && enterSends(event)) {
          event.preventDefault()
          event.stopPropagation()
          if (!empty) void submit()
        } else if (event.key === 'Escape' && onCancel !== undefined && !event.defaultPrevented) {
          /* BlockNote's own menus close on their Escape first. */
          const menu = document.querySelector('.bn-suggestion-menu, .bn-formatting-toolbar')
          if (menu === null) onCancel()
        }
      }}
    >
      <div
        className={cn(
          'min-w-0 rounded-lg border border-border bg-background focus-within:border-quiet-foreground',
          /* A new post's Send sits at the end of the writing, not on a row of its own. */
          !editing && 'flex items-end gap-1 pr-1',
        )}
      >
        {/* The padding lives here: canvas.css zeroes the canvas's own left padding on phones. */}
        <div className={cn('min-w-0 px-3', editing ? 'pt-2' : 'flex-1 py-1.5')}>
          <div
            className="dana-writing-canvas dana-post-editor max-h-[60vh] min-w-0 overflow-y-auto"
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
        </div>
        {editing ? (
          <div className="flex items-center justify-end gap-2 px-2 pb-2">
            {error !== '' ? <p role="alert" className="mr-auto min-w-0 px-1 text-xs text-destructive">{error}</p> : null}
            {onCancel !== undefined ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={busy || empty}
              title={sendTitle}
              onClick={() => {
                void submit()
              }}
            >
              {submitLabel}
            </Button>
          </div>
        ) : (
          <div className="shrink-0 py-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={empty}
              aria-label={submitLabel}
              title={sendTitle}
              onClick={() => {
                void submit()
              }}
            >
              <SendHorizontal strokeWidth={1.75} aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>
      {!editing && error !== '' ? <p role="alert" className="mt-1 px-1 text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
