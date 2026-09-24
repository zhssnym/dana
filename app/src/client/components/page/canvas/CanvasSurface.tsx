import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { BlockNoteView } from '@blocknote/shadcn'
import {
  FilePanelController, FormattingToolbarController, SideMenuController,
} from '@blocknote/react'
import { CanvasFilePanel } from './CanvasFilePanel.js'
import type { CanvasMediaKind, CanvasUploadedFile } from './CanvasFilePanel.js'
import { CanvasFormattingToolbar } from './CanvasFormattingToolbar.js'
import { CanvasMarquee } from './CanvasMarquee.js'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../ui/alert-dialog.js'
import { installCanvasGuard } from './guard.js'
import { bindTaskCommand, removeCanvasBlocks } from './commands.js'
import { CanvasSlashMenu, blockMenuTargets } from './slash-items.js'
import { isSectionHeading, shelfOutlineFailure, validateCanvasOutline } from './outline.js'
import { BlockMenuContext, BlockSideMenu, blockSidePosition, duplicateBlocks, pageTheme, turnBlocksInto } from './BlockSideMenu.js'
import type { BlockMenuModel } from './BlockSideMenu.js'
import { BlockSelectionStyle, useBlockAnchor, useBlockSelectionKeys } from './block-selection.js'
import { backspaceToText, contains, simulateNest, TEXT_TYPES, TURN_TARGETS } from './turn-into.js'
import type { TreeBlock } from './turn-into.js'
import type { CanvasBlock, CanvasEditor } from './schema.js'
import { DanaLinkSuggestions } from '../../links/dana-link-picker.js'
import { useCanvasTaskDelete } from './CanvasTask.js'
import './canvas.css'

type HeadingMode = 'section' | 'document' | 'none'

const TASK_OR_FOLDER: ReadonlySet<string> = new Set(['danaTask', 'danaFolder'])
const LIST_TYPES: ReadonlySet<string> = new Set(['bulletListItem', 'numberedListItem', 'checkListItem', 'toggleListItem'])

/** A Shelf keeps one heading level: its headings are stored flat and group
 * by position (`ShelfCanvas`). Blocks nest under blocks there as anywhere. */
function flatShelfFailure(blocks: readonly TreeBlock[]): boolean {
  return shelfOutlineFailure(blocks)
}

/** A folder reference is drawn as text but stored as `folder_ref`, which holds nothing. */
function referenceHolds(blocks: readonly TreeBlock[], folderRefs: ReadonlyMap<string, string>): boolean {
  return blocks.some((block) => (block.children.length > 0 && folderRefs.has(block.id)) || referenceHolds(block.children, folderRefs))
}

/** Visual editor host. The caller owns hydration, uploads, Task actions and durable saving. */
export function CanvasSurface({
  editor,
  onChange,
  onCreateTask,
  folderRefs,
  onUploadFile,
  headingMode = 'section',
  editable = true,
  label,
  onRemoveFolder,
  flatGroups = false,
  placeholder,
  onNotice,
}: {
  readonly editor: CanvasEditor
  readonly onChange: (editor: CanvasEditor) => void
  readonly onCreateTask?: (block?: CanvasBlock) => void
  readonly folderRefs: ReadonlyMap<string, string>
  readonly onUploadFile: (
    kind: CanvasMediaKind,
    file: File,
  ) => Promise<CanvasUploadedFile>
  readonly headingMode?: HeadingMode
  readonly editable?: boolean
  readonly label?: string
  /** A Shelf's Remove from shelf, offered on its Folder rows (#221). */
  readonly onRemoveFolder?: (folderId: string) => void
  /** A Shelf stores its headings flat, content belonging by position: one
   * heading level, and no "out of group" gestures a reload would undo. */
  readonly flatGroups?: boolean
  /** What an empty page says (see canvas.css: BlockNote's own placeholder
   * decoration does not reach Dana's paragraph node view). */
  readonly placeholder?: string
  /** Where a refused gesture's sentence goes: the page's one save line
   * (`SaveFailure`), so a canvas never draws a second status line. */
  readonly onNotice: (message: string) => void
}): React.JSX.Element {
  const [referenceToConvert, setReferenceToConvert] = useState<CanvasBlock | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>(pageTheme)
  const requestTask = useCallback((block?: CanvasBlock): void => {
    const target = block ?? editor.getTextCursorPosition().block
    if (folderRefs.has(target.id)) setReferenceToConvert(target)
    else onCreateTask?.(block)
  }, [editor, folderRefs, onCreateTask])
  const slashContext = useMemo(() => ({
    surface: headingMode === 'document' ? 'document' as const : headingMode === 'none' ? 'plain' as const : flatGroups ? 'shelf' as const : 'work' as const,
    onCreateTask: onCreateTask === undefined ? undefined : () => { onCreateTask() },
  }), [headingMode, flatGroups, onCreateTask])
  useEffect(() => installCanvasGuard(editor, onNotice), [editor, onNotice])
  useEffect(() => onCreateTask ? bindTaskCommand(editor, requestTask) : undefined, [editor, onCreateTask, requestTask])
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(pageTheme()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => observer.disconnect()
  }, [])

  // What this canvas's structure admits: the persisted outline's rules, and a
  // Shelf's flat ones. A refused shape is never offered (menu) or attempted (Tab).
  const admits = useCallback((document: readonly TreeBlock[]): boolean =>
    validateCanvasOutline(document) === null && !(flatGroups && flatShelfFailure(document)) && !referenceHolds(document, folderRefs), [flatGroups, folderRefs])
  const headingToggles = headingMode === 'section'
  const deleteTask = useCanvasTaskDelete()
  const remove = useCallback((ids: readonly string[]): void => {
    removeCanvasBlocks(editor, ids.flatMap((id) => { const block = editor.getBlock(id); return block === undefined ? [] : [block] }))
  }, [editor])
  const duplicate = useCallback((ids: readonly string[]): void => {
    const blocks = ids.flatMap((id) => { const block = editor.getBlock(id) as TreeBlock | undefined; return block === undefined ? [] : [block] })
    if (blocks.some((block) => contains(block, TASK_OR_FOLDER))) return
    duplicateBlocks(editor, ids)
  }, [editor])
  const menu = useMemo<BlockMenuModel>(() => ({
    targets: (block) => blockMenuTargets(editor, block),
    turnInto: (ids, target) => { turnBlocksInto(editor, ids, target, headingMode === 'none' ? undefined : headingToggles) },
    extraTarget: (block) => block.type === 'paragraph' && onCreateTask !== undefined
      ? { title: 'Task', run: () => { requestTask(editor.getBlock(block.id) ?? undefined) } }
      : null,
    canDuplicate: (block) => !contains(block, TASK_OR_FOLDER),
    duplicate,
    removal: (block, ids) => {
      /* #221: a Folder row is the Shelf's membership, so it leaves through
         the membership act and never through generic Delete. */
      if (block.type === 'danaFolder') {
        const folderId = String(block.props.folderId)
        return onRemoveFolder ? { label: 'Remove from shelf', run: () => { onRemoveFolder(folderId) } } : null
      }
      // A Task's Delete is the task's own act: its confirmation, then undo.
      if (block.type === 'danaTask') {
        const run = deleteTask?.(String(block.props.taskId)) ?? null
        return run === null ? null : { label: 'Delete', run }
      }
      return { label: 'Delete', run: () => { remove(ids) } }
    },
  }), [editor, headingMode, headingToggles, onCreateTask, requestTask, duplicate, onRemoveFolder, remove, deleteTask])
  const selectionActions = useMemo(() => ({ remove, duplicate, admits }), [remove, duplicate, admits])
  useBlockSelectionKeys(editor, selectionActions)
  useBlockAnchor(editor, true)
  const scope = `dana-canvas-${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  // Tab nests any block under the block above it (0038), only where the
  // result is a shape this canvas can keep; elsewhere it does nothing rather
  // than refuse out loud. Code keeps its own Tab. Shift-Tab is BlockNote's
  // own un-nest, which lifts any block a level (the blocks after it in its
  // parent follow as its children); the canvas guard refuses a shape it
  // cannot keep.
  /*
  Enter on an empty list item nested under a block steps out a level (at the
  root or directly in a Section, BlockNote's own Enter makes it text).
  Backspace at the start of a block: such a nested list item steps out; any
  other kind turns into text, its children kept (text holds them), unless the
  result is a shape the canvas refuses or the block is a Section holding
  content (then nothing happens, so a Section never dissolves by accident);
  text merges (BlockNote's).
  */
  const onKeyDownCapture = (event: React.KeyboardEvent): void => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const { selection } = editor.prosemirrorState
    if (!selection.empty || editor.domElement === undefined || !editor.domElement.contains(event.target as Node)) return
    const block = editor.getTextCursorPosition().block
    const stop = (): void => { event.preventDefault(); event.stopPropagation() }
    const parent = editor.getParentBlock(block.id)
    const inList = LIST_TYPES.has(block.type) && parent !== undefined && !isSectionHeading(parent)
    if (event.key === 'Tab' && !event.shiftKey) {
      if (block.type === 'codeBlock') return
      const next = simulateNest(editor.document as unknown as TreeBlock[], block.id)
      if (next === null || !admits(next)) stop()
    } else if (event.key === 'Enter' && !event.shiftKey) {
      if (inList && Array.isArray(block.content) && block.content.length === 0) { stop(); editor.unnestBlock() }
    } else if (event.key === 'Backspace' && !event.shiftKey && selection.$from.parentOffset === 0) {
      if (inList) { stop(); editor.unnestBlock(); return }
      if (block.type === 'paragraph' || !TEXT_TYPES.has(block.type)) return
      stop()
      const next = backspaceToText(editor.document as unknown as TreeBlock[], block as unknown as TreeBlock)
      if (next === null || !admits(next)) return
      turnBlocksInto(editor, [block.id], TURN_TARGETS[0]!, undefined)
      editor.setTextCursorPosition(block.id, 'start')
    }
  }

  // Clicking below the last block writes on: an empty last line is reused,
  // otherwise a new one is made after everything.
  const writeBelow = (event: React.MouseEvent): void => {
    if (!editable || event.button !== 0) return
    event.preventDefault()
    const last = editor.document.at(-1)
    if (last === undefined) return
    const empty = last.type === 'paragraph' && Array.isArray(last.content) && last.content.length === 0 && last.children.length === 0
    const target = empty ? last : editor.insertBlocks([{ type: 'paragraph' }], last, 'after')[0]
    if (target === undefined) return
    editor.setTextCursorPosition(target, 'end')
    editor.focus()
  }

  return (
    <BlockMenuContext.Provider value={menu}>
    <BlockSelectionStyle editor={editor} scope={scope} />
    <div
      onKeyDownCapture={onKeyDownCapture}
      className={`dana-writing-canvas ${scope} min-w-0`}
      style={placeholder === undefined ? undefined : ({ '--dana-canvas-placeholder': JSON.stringify(placeholder) } as React.CSSProperties)}
    >
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme={theme}
        formattingToolbar={false}
        slashMenu={false}
        sideMenu={false}
        filePanel={false}
        onChange={() => { onNotice(''); onChange(editor) }}
        aria-label={label ?? (onCreateTask === undefined ? 'Folder writing' : 'Folder writing and Tasks')}
      >
        <FormattingToolbarController formattingToolbar={CanvasFormattingToolbar} />
        <FilePanelController
          filePanel={(props) => (
            <CanvasFilePanel {...props} onUpload={onUploadFile} />
          )}
        />
        <SideMenuController sideMenu={BlockSideMenu} floatingUIOptions={blockSidePosition} />
        <CanvasSlashMenu editor={editor} context={slashContext} />
        {editable ? <DanaLinkSuggestions editor={editor} /> : null}
        <CanvasMarquee />
      </BlockNoteView>
      {editable ? <div aria-hidden="true" className="dana-canvas-tail" onMouseDown={writeBelow} /> : null}
    </div>
    <AlertDialog open={referenceToConvert !== null} onOpenChange={(open) => { if (!open) setReferenceToConvert(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Turn this folder link into a task?</AlertDialogTitle>
          <AlertDialogDescription>The link to the folder is removed, and a task is made with the link text as its title.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => {
            if (referenceToConvert !== null) onCreateTask?.(referenceToConvert)
          }}>Turn into task</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </BlockMenuContext.Provider>
  )
}
