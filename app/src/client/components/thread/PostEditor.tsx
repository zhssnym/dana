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
A new post with its own button row (`renderActions`, the issue page) keeps
GitHub's keys instead: Enter is a new line and Ctrl/Cmd+Enter comments.

Default export: `React.lazy` keeps BlockNote out of the page's own chunk.
*/
import { useEffect, useRef, useState } from 'react'
import { BlockNoteSchema } from '@blocknote/core'
import { SuggestionMenu } from '@blocknote/core/extensions'
import { en } from '@blocknote/core/locales'
import { BlockNoteView } from '@blocknote/shadcn'
import { FilePanelController, FormattingToolbarController, useCreateBlockNote } from '@blocknote/react'
import '@blocknote/shadcn/style.css'

import type { CommentFile, PostContent } from '../../../shared/comments.js'
import { uploadFile } from '../../api/http.js'
import { Paperclip } from '../../lib/icons.js'
import { Button } from '../ui/button.js'
import { cn } from '../ui/utils.js'
import { MentionSuggestions } from '../page/canvas/mentions.js'
import { pageTheme } from '../page/canvas/BlockSideMenu.js'
import { CanvasFilePanel, mediaKindOf } from '../page/canvas/CanvasFilePanel.js'
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
  /**
   * A new post's own button row, drawn under the editor in place of the
   * inline Send (the Linear task page's "Mark done" and "Post"). `submit`
   * is the one send path, and resolves once the post is on the server or
   * refused.
   */
  readonly renderActions?: (api: { readonly submit: () => Promise<boolean>; readonly empty: boolean; readonly busy: boolean }) => React.ReactNode
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
  renderActions,
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

  async function submit(): Promise<boolean> {
    /* A second Enter while a post is on its way sends too (the first one's
       words have already left the editor); only an edit waits. */
    if (busy && editing) return false
    const content = read()
    if (content === null) return false
    setBusy(true)
    setError('')
    /* A new post leaves the composer the moment it is sent, as in Slack, so
       whatever is typed while it is on its way stays and is never wiped (r5).
       A refusal puts the sent words back ahead of anything typed since. */
    const sent = editing ? null : editor.document
    if (sent !== null) {
      editor.replaceBlocks(editor.document, [{ type: 'paragraph' }])
      setEmpty(true)
      /* A pressed "Post" disables itself as the composer empties, which would
         drop focus to the page; the cursor goes back to the composer instead. */
      editor.focus()
    }
    try {
      await onSubmit(content)
      return true
    } catch (failure) {
      if (sent !== null) {
        const first = editor.document[0]
        if (read() === null || first === undefined) editor.replaceBlocks(editor.document, sent)
        else editor.insertBlocks(sent, first, 'before')
        setEmpty(false)
      }
      setError(failure instanceof Error ? failure.message : 'Not posted. Try again.')
      return false
    } finally {
      setBusy(false)
    }
  }

  /** Enter on a new post sends, unless the editor needs that Enter. */
  function enterSends(event: React.KeyboardEvent<HTMLDivElement>): boolean {
    if (editing || coarse || renderActions !== undefined) return false
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
  const chat = !editing && renderActions === undefined
  const picker = useRef<HTMLInputElement>(null)

  /** The composer's Attach: each picked file uploads and joins the post as its own block. */
  async function attach(list: FileList | null): Promise<void> {
    for (const file of Array.from(list ?? [])) {
      const kind = mediaKindOf(file.type)
      try {
        const props = await upload(kind, file)
        const last = editor.document.at(-1)
        if (last !== undefined) editor.insertBlocks([{ type: kind, props } as never], last, 'after')
        setEmpty(false)
      } catch {
        /* `upload` has already said why, under the box. */
      }
    }
    editor.focus()
  }

  /** The composer's @: the canvas's own mention menu, at the end of the writing. */
  function mention(): void {
    const last = editor.document.at(-1)
    editor.focus()
    if (last !== undefined && !editor.isFocused()) editor.setTextCursorPosition(last, 'end')
    editor.getExtension(SuggestionMenu)?.openSuggestionMenu('@')
  }

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
          'min-w-0 border border-border bg-background',
          /* A new post: a letter's box, the writing, then one row of Attach, @ and Send. */
          chat ? 'rounded-md focus-within:border-ring' : 'rounded-lg focus-within:border-quiet-foreground',
        )}
      >
        {/* The padding lives here: canvas.css zeroes the canvas's own left padding on phones. */}
        <div
          className={cn('min-w-0 px-3', editing ? 'pt-2' : renderActions === undefined ? 'min-h-13 pt-3' : 'min-h-24 cursor-text py-2')}
          /* The issue composer's box is taller than its one line: a click anywhere in it writes. */
          onMouseDown={
            renderActions === undefined
              ? undefined
              : (event) => {
                  if (event.target instanceof Element && event.target.closest('.ProseMirror') !== null) return
                  event.preventDefault()
                  editor.focus()
                }
          }
        >
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
        ) : !chat ? null : (
          <div className="flex items-center gap-0.5 px-3 pb-2">
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              tabIndex={-1}
              onChange={(event) => {
                const files = event.target.files
                void attach(files).finally(() => { event.target.value = '' })
              }}
            />
            <Button type="button" variant="ghost" size="icon" aria-label="Attach a file" title="Attach a file" className="text-muted-foreground" onClick={() => picker.current?.click()}>
              <Paperclip className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Mention someone" title="Mention someone" className="text-sm text-muted-foreground" onMouseDown={(event) => { event.preventDefault() }} onClick={mention}>
              @
            </Button>
            {sendTitle === undefined ? null : <span className="mr-2.5 ml-auto text-xs text-quiet-foreground">{sendTitle}</span>}
            <Button
              type="button"
              variant={empty ? 'ghost' : 'commit'}
              disabled={empty}
              title={sendTitle}
              className={cn('px-3 font-medium', sendTitle === undefined && 'ml-auto', empty && 'bg-muted text-muted-foreground')}
              onClick={() => {
                void submit()
              }}
            >
              {submitLabel}
            </Button>
          </div>
        )}
      </div>
      {!editing && error !== '' ? <p role="alert" className="mt-1 px-1 text-xs text-destructive">{error}</p> : null}
      {!editing && renderActions !== undefined ? renderActions({ submit, empty, busy }) : null}
    </div>
  )
}
