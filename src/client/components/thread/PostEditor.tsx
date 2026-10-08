// The post composer: the canvas editor less the pages-only blocks. A new chat post sends on
// Enter (not in an IME, menu, list, code block, or on touch); editing keeps the editor's
// keys. Default export so `React.lazy` keeps BlockNote out of the page chunk.
import { useEffect, useRef, useState } from 'react'
import { BlockNoteSchema } from '@blocknote/core'
import { en } from '@blocknote/core/locales'
import { BlockNoteView } from '@blocknote/shadcn'
import { FilePanelController, FormattingToolbarController, useCreateBlockNote } from '@blocknote/react'
import '@blocknote/shadcn/style.css'

import type { CommentFile, PostContent } from '../../../shared/comments.js'
import { uploadFile } from '../../api/http.js'
import { ArrowUp, Paperclip } from '../../lib/icons.js'
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

// The canvas's blocks without the pages-only three.
const { danaTask: _task, danaFolder: _folder, diagram: _diagram, person: _person, ...postBlockSpecs } = canvasSchema.blockSpecs
const postSchema = BlockNoteSchema.create({
  blockSpecs: postBlockSpecs,
  inlineContentSpecs: canvasSchema.inlineContentSpecs,
  styleSpecs: canvasSchema.styleSpecs,
})

const SLASH = { surface: 'post', media: true } as const

// Where Enter belongs to the editor, not to Send.
const ENTER_KEEPS = new Set(['bulletListItem', 'numberedListItem', 'checkListItem', 'toggleListItem', 'codeBlock'])

function touchFirst(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

export interface PostEditorProps {
  /** Where an upload is stored (the thread's folder). */
  readonly folderId: string
  /** Editing an existing post: its content, or its plain body when older. */
  readonly initial?: { readonly content: PostContent | null | undefined; readonly body: string | null; readonly files: readonly CommentFile[] }
  readonly placeholder?: string
  readonly submitLabel?: string
  readonly autoFocus?: boolean
  /** Bumped by the thread to focus the field (Reply). */
  readonly focusSignal?: number
  /** Resolves when posted; a rejection keeps the writing. */
  readonly onSubmit: (content: PostContent) => Promise<unknown>
  readonly onCancel?: () => void
  readonly label?: string
  /**
   * A new post's own button row, in place of the inline Send. `submit` resolves once the
   * post is on the server or refused.
   */
  readonly renderActions?: (api: { readonly submit: () => Promise<boolean>; readonly empty: boolean; readonly busy: boolean }) => React.ReactNode
}

export default function PostEditor({
  folderId,
  initial,
  placeholder = 'Message',
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
    // A second Enter while a post is on its way sends too; only an edit waits.
    if (busy && editing) return false
    const content = read()
    if (content === null) return false
    setBusy(true)
    setError('')
    // A new post leaves the composer at once, so typing meanwhile is kept. A refusal puts
    // the sent words back ahead of anything typed since.
    const sent = editing ? null : editor.document
    if (sent !== null) {
      editor.replaceBlocks(editor.document, [{ type: 'paragraph' }])
      setEmpty(true)
      // The pressed Post disables itself as the composer empties; keep focus in the composer.
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

  const sendTitle = editing ? 'Ctrl+Enter' : undefined
  const chat = !editing && renderActions === undefined
  const picker = useRef<HTMLInputElement>(null)

  // A pill while it holds one line; taller, its corners drop to the card radius.
  const scroller = useRef<HTMLDivElement>(null)
  const [tall, setTall] = useState(false)
  useEffect(() => {
    const el = scroller.current
    if (!chat || el === null || typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(() => {
      // One line of body text is 20px; BlockNote adds a few px around it.
      setTall(el.offsetHeight > 32)
    })
    watch.observe(el)
    return () => { watch.disconnect() }
  }, [chat])

  /** Each picked file uploads and joins the post as its own block. */
  async function attach(list: FileList | null): Promise<void> {
    for (const file of Array.from(list ?? [])) {
      const kind = mediaKindOf(file.type)
      try {
        const props = await upload(kind, file)
        const last = editor.document.at(-1)
        if (last !== undefined) editor.insertBlocks([{ type: kind, props } as never], last, 'after')
        setEmpty(false)
      } catch {
        // `upload` has already said why, under the box.
      }
    }
    editor.focus()
  }

  // An edited post can gain a file too: a phone has no paste or drop handy.
  const pickerInput = (
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
  )
  const attachButton = (
    <>
      {pickerInput}
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Attach a file" title="Attach a file" className="text-muted-foreground" onClick={() => picker.current?.click()}>
        <Paperclip strokeWidth={1.75} aria-hidden="true" />
      </Button>
    </>
  )

  /** The writing itself, the same in the chat field and the edit box. */
  const writing = (height: string): React.JSX.Element => (
    <div
      ref={scroller}
      className={cn('dana-writing-canvas dana-post-editor min-w-0 overflow-y-auto', height)}
      // BlockNote's placeholder never reaches the canvas paragraph; canvas.css draws this one.
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
  )

  return (
    <div
      ref={host}
      className="min-w-0"
      // The thread reads this: Escape in an empty new post leaves it.
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
          // BlockNote's own menus close on their Escape first.
          const menu = document.querySelector('.bn-suggestion-menu, .bn-formatting-toolbar')
          if (menu !== null) return
          if (editing) onCancel()
          else if (empty) {
            // Spent here: the thread's own Escape (leave) waits for the next one.
            event.preventDefault()
            event.stopPropagation()
            onCancel()
          }
        }
      }}
    >
      {chat ? (
        // Attach, the writing, and Send once there is something to send.
        <div
          className={cn(
            'flex min-h-11 min-w-0 items-end border border-border bg-background focus-within:border-ring md:gap-1 md:p-1',
            tall ? 'rounded-[var(--radius-card)]' : 'rounded-full',
          )}
        >
          {pickerInput}
          <Button
            type="button"
            variant="ghost"
            aria-label="Attach a file"
            title="Attach a file"
            className="size-11 rounded-full text-muted-foreground md:size-8"
            onClick={() => picker.current?.click()}
          >
            <Paperclip className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </Button>
          <div className={cn('min-w-0 flex-1 self-center py-1.5', empty && 'pe-3')}>{writing('max-h-40 overflow-x-hidden md:max-h-55')}</div>
          {empty ? null : (
            <Button
              type="button"
              variant="commit"
              aria-label={submitLabel}
              title={submitLabel}
              className="size-11 rounded-full md:size-8"
              // Keep focus in the writing, so a phone's keyboard stays up.
              onMouseDown={(event) => { event.preventDefault() }}
              onClick={() => {
                void submit()
              }}
            >
              <ArrowUp className="size-4" strokeWidth={2} aria-hidden="true" />
            </Button>
          )}
        </div>
      ) : (
      <div className="min-w-0 rounded-lg border border-border bg-background focus-within:border-quiet-foreground">
        {/* The padding lives here: canvas.css zeroes the canvas's left padding on phones. */}
        <div
          className={cn('min-w-0 px-3', editing ? 'pt-2' : 'min-h-24 cursor-text py-2')}
          // The issue composer's box is taller than one line: a click anywhere in it writes.
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
          {writing('max-h-[60vh]')}
        </div>
        {editing ? (
          <div className="flex items-center justify-end gap-2 px-2 pb-2">
            <div className="mr-auto flex min-w-0 items-center gap-0.5">
              {attachButton}
              {error !== '' ? <p role="alert" className="min-w-0 px-1 text-xs text-destructive">{error}</p> : null}
            </div>
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
        ) : null}
      </div>
      )}
      {!editing && error !== '' ? <p role="alert" className="mt-1 px-1 text-xs text-destructive">{error}</p> : null}
      {!editing && renderActions !== undefined ? renderActions({ submit, empty, busy }) : null}
    </div>
  )
}
