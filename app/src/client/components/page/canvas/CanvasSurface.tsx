import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
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
import { installCanvasGuard, removingPages } from './guard.js'
import { publishedFolders } from '../../../lib/folder-library.js'
import { pushUndo, undoLabel } from '../../../shell/undo.js'
import { bindTaskCommand, dropEmptyLine, moveBlocksBy, removeCanvasBlocks } from './commands.js'
import { CanvasSlashMenu, blockMenuTargets, headingTogglesFor } from './slash-items.js'
import { isSectionHeading, shelfOutlineFailure, validateCanvasOutline } from './outline.js'
import { BlockMenuContext, BlockSideMenu, blockSidePosition, duplicateBlocks, pageTheme, turnBlocksInto } from './BlockSideMenu.js'
import type { BlockMenuModel } from './BlockSideMenu.js'
import { BlockSelectionStyle, useBlockAnchor, useBlockSelectionKeys } from './block-selection.js'
import { backspaceToText, contains, simulateNest, TEXT_TYPES, TURN_TARGETS } from './turn-into.js'
import type { TreeBlock } from './turn-into.js'
import type { CanvasBlock, CanvasEditor } from './schema.js'
import { MentionSuggestions } from './mentions.js'
import { AddTaskLine } from './AddTaskLine.js'
import { useCanvasTaskDelete } from './CanvasTask.js'
import './canvas.css'

type HeadingMode = 'section' | 'document' | 'none'

const TASK: ReadonlySet<string> = new Set(['danaTask'])
const TASK_OR_FOLDER: ReadonlySet<string> = new Set(['danaTask', 'danaFolder', 'danaPage'])
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
  onCreatePage,
  folderRefs,
  onUploadFile,
  headingMode = 'section',
  editable = true,
  label,
  onRemoveFolder,
  flatGroups = false,
  placeholder,
  peopleFolderId,
  onNotice,
  results = false,
}: {
  readonly editor: CanvasEditor
  readonly onChange: (editor: CanvasEditor) => void
  readonly onCreateTask?: (block?: CanvasBlock) => void
  /** A Doc page's `/` Page (step 7). */
  readonly onCreatePage?: () => void
  readonly folderRefs: ReadonlyMap<string, string>
  readonly onUploadFile: (
    kind: CanvasMediaKind,
    file: File,
  ) => Promise<CanvasUploadedFile>
  readonly headingMode?: HeadingMode
  readonly editable?: boolean
  readonly label?: string
  /** A Collection's (Shelf's) Remove from collection, offered on its Folder rows (#221). */
  readonly onRemoveFolder?: (folderId: string) => void
  /** A Shelf stores its headings flat, content belonging by position: one
   * heading level, and no "out of group" gestures a reload would undo. */
  readonly flatGroups?: boolean
  /** What an empty page says (see canvas.css: BlockNote's own placeholder
   * decoration does not reach Dana's paragraph node view). */
  readonly placeholder?: string
  /** Whose members the `@` menu offers (Wave 2); none offers pages only. */
  readonly peopleFolderId?: string
  /** Where a refused gesture's sentence goes: the page's one save line
   * (`SaveFailure`), so a canvas never draws a second status line. */
  readonly onNotice: (message: string) => void
  /** The Results tab: the slash menu offers Result (#213). */
  readonly results?: boolean
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
    onCreatePage,
    results,
  }), [headingMode, flatGroups, onCreateTask, onCreatePage, results])
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
  const deleteTask = useCanvasTaskDelete()
  const remove = useCallback((ids: readonly string[]): void => {
    removeCanvasBlocks(editor, ids.flatMap((id) => { const block = editor.getBlock(id); return block === undefined ? [] : [block] }))
  }, [editor])
  /* A sub-page's own act: the block leaves (the next save sends its
     `delete_block` with `trash_page`), and Undo puts the same block back where
     it was (the save then sends it as a `put_block`, which restores the page). */
  const trashPage = useCallback((id: string, folderId: string): void => {
    const own = editor.getBlock(id)
    if (own === undefined) return
    const parent = editor.getParentBlock(id)
    const siblings = parent?.children ?? editor.document
    const at = siblings.findIndex((block) => block.id === id)
    const previous = siblings[at - 1]?.id
    const next = siblings[at + 1]?.id
    const name = publishedFolders().find((folder) => folder.id === folderId)?.name ?? 'Untitled'
    removingPages([folderId], () => { removeCanvasBlocks(editor, [own]) })
    if (editor.getBlock(id) !== undefined) return
    pushUndo(`${undoLabel('Moved', name)} to Trash`, () => {
      if (editor.getBlock(id) !== undefined) return
      const block = { id, type: 'danaPage' as const, props: { folderId } }
      if (previous !== undefined && editor.getBlock(previous) !== undefined) editor.insertBlocks([block], previous, 'after')
      else if (next !== undefined && editor.getBlock(next) !== undefined) editor.insertBlocks([block], next, 'before')
      else if (parent !== undefined && editor.getBlock(parent.id) !== undefined) editor.updateBlock(parent.id, { children: [block] })
      else { const last = editor.document.at(-1); if (last !== undefined) editor.insertBlocks([block], last, 'after') }
    })
  }, [editor])
  const duplicate = useCallback((ids: readonly string[]): void => {
    const blocks = ids.flatMap((id) => { const block = editor.getBlock(id) as TreeBlock | undefined; return block === undefined ? [] : [block] })
    // A Task or a page is one record; a copy of its row would be a second row for the same one.
    if (blocks.some((block) => contains(block, TASK))) { onNotice("This selection contains a Task, which can't be duplicated. Select only the writing."); return }
    if (blocks.some((block) => contains(block, TASK_OR_FOLDER))) { onNotice("This selection contains a page, which can't be duplicated. Select only the writing."); return }
    duplicateBlocks(editor, ids)
  }, [editor, onNotice])
  const menu = useMemo<BlockMenuModel>(() => ({
    targets: (block) => blockMenuTargets(editor, block),
    turnInto: (ids, target) => { turnBlocksInto(editor, ids, target, headingMode === 'none' ? undefined : (block) => headingTogglesFor(editor, block, target)) },
    // A stored to-do (no longer made anywhere) turns into a Task as text does.
    extraTarget: (block) => (block.type === 'paragraph' || block.type === 'checkListItem') && onCreateTask !== undefined
      ? { title: 'Task', run: () => { requestTask(editor.getBlock(block.id) ?? undefined) } }
      : null,
    canDuplicate: (block) => !contains(block, TASK_OR_FOLDER),
    duplicate,
    removal: (block, ids) => {
      /* #221: a Folder row is the Shelf's membership, so it leaves through
         the membership act and never through generic Delete. */
      if (block.type === 'danaFolder') {
        const folderId = String(block.props.folderId)
        return onRemoveFolder ? { label: 'Remove from collection', run: () => { onRemoveFolder(folderId) } } : null
      }
      if (block.type === 'danaPage') {
        const folderId = String(block.props.folderId)
        return { label: 'Move page to Trash', run: () => { trashPage(block.id, folderId) } }
      }
      // A Task's Delete is the task's own act: its confirmation, then undo.
      if (block.type === 'danaTask') {
        const run = deleteTask?.(String(block.props.taskId)) ?? null
        return run === null ? null : { label: 'Delete', run }
      }
      return { label: 'Delete', run: () => { remove(ids) } }
    },
  }), [editor, headingMode, onCreateTask, requestTask, duplicate, onRemoveFolder, remove, deleteTask, trashPage])
  const move = useCallback((ids: readonly string[], direction: -1 | 1): boolean => moveBlocksBy(editor, ids, direction), [editor])
  const selectionActions = useMemo(() => ({ remove, duplicate, admits, move }), [remove, duplicate, admits, move])
  useBlockSelectionKeys(editor, selectionActions)
  useBlockAnchor(editor, true)
  const scope = `dana-canvas-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const lastLine = onCreateTask !== undefined && headingMode === 'section' && !flatGroups && placeholder !== undefined

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
  /*
  WCAG 2.1.2: Tab is a writing key only once you are writing. Focus that
  arrives by Tab (from the view switch, or back by Shift-Tab) is passing
  through: the next Tab or Shift-Tab moves on as it does anywhere else, and
  nests nothing. A click or any other key in the text means you are writing,
  and Tab nests again (Notion). Each arrival in the text decides afresh.
  */
  const writing = useRef(false)
  const tabbed = useRef(false)
  useEffect(() => {
    const note = (event: KeyboardEvent): void => { tabbed.current = event.key === 'Tab' }
    document.addEventListener('keydown', note, true)
    return () => document.removeEventListener('keydown', note, true)
  }, [])
  const onFocusCapture = (event: React.FocusEvent): void => {
    if (event.target !== editor.domElement || editor.domElement.contains(event.relatedTarget as Node | null)) return
    writing.current = !tabbed.current
  }

  const onKeyDownCapture = (event: React.KeyboardEvent): void => {
    if (event.key === 'Tab' && !event.metaKey && !event.ctrlKey && !event.altKey && event.target === editor.domElement && !writing.current) {
      // Passing through: the browser's Tab, with no editor behind it.
      event.stopPropagation()
      return
    }
    if (!['Tab', 'Shift', 'Escape'].includes(event.key)) writing.current = true
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const { selection } = editor.prosemirrorState
    if (!selection.empty || editor.domElement === undefined || !editor.domElement.contains(event.target as Node)) return
    const block = editor.getTextCursorPosition().block
    const stop = (): void => { event.preventDefault(); event.stopPropagation() }
    const parent = editor.getParentBlock(block.id)
    const inList = LIST_TYPES.has(block.type) && parent !== undefined && !isSectionHeading(parent)
    if (event.key === 'Tab' && !event.shiftKey) {
      // Tab nests only when typed into the text itself. On a link or chip
      // inside the page (its own focus stop) it is the browser's Tab.
      if (event.target !== editor.domElement || block.type === 'codeBlock') return
      const next = simulateNest(editor.document as unknown as TreeBlock[], block.id)
      if (next === null || !admits(next)) stop()
    } else if (event.key === 'Enter' && !event.shiftKey) {
      if (inList && Array.isArray(block.content) && block.content.length === 0) { stop(); editor.unnestBlock(); return }
      // Work: a second Enter on an empty line removes it (M4 §2.5, `dropEmptyLine`).
      const host = event.currentTarget
      const toLast = (): boolean => { const line = host.querySelector<HTMLInputElement>('.dana-add-task-line input'); line?.focus(); return line !== null }
      if (lastLine && dropEmptyLine(editor, toLast)) stop()
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

  /* Mod+K on selected text is the link field (BlockNote's own handler, on the
     editor, has already opened it); it goes no further, so the app's search
     shortcut on the document does not open over it. With no text selected,
     Mod+K is search, as everywhere. */
  const linkKey = (event: React.KeyboardEvent): void => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k' || event.shiftKey || event.altKey) return
    if (editor.domElement === undefined || !editor.domElement.contains(event.target as Node)) return
    if (editor.prosemirrorState.selection.empty || editor.getSelectedText() === '') return
    event.stopPropagation()
  }

  // Clicking below the last block writes on: an empty last line is reused,
  // otherwise a new one is made after everything. When the page ends in a
  // Section, the line goes inside it, after its last block: what is drawn
  // under a heading belongs to it, so Freeform and Linear agree.
  const writeBelow = (event: React.MouseEvent): void => {
    if (!editable || event.button !== 0) return
    event.preventDefault()
    // Work's thread ends in its one last line: a click below it lands there (M4 §2.5).
    if (lastLine) { event.currentTarget.parentElement?.querySelector<HTMLInputElement>('.dana-add-task-line input')?.focus(); return }
    let last = editor.document.at(-1)
    if (last === undefined) return
    let section: typeof last | undefined
    while (headingMode === 'section' && last !== undefined && isSectionHeading(last)) {
      section = last
      last = last.children.at(-1)
    }
    const empty = last !== undefined && last.type === 'paragraph' && Array.isArray(last.content) && last.content.length === 0 && last.children.length === 0
    let target = empty ? last : last !== undefined ? editor.insertBlocks([{ type: 'paragraph' }], last, 'after')[0] : undefined
    if (target === undefined && section !== undefined) {
      editor.updateBlock(section, { children: [{ type: 'paragraph' }] })
      target = editor.getBlock(section.id)?.children[0]
    }
    if (target === undefined) return
    editor.setTextCursorPosition(target, 'end')
    editor.focus()
  }

  return (
    <BlockMenuContext.Provider value={menu}>
    <BlockSelectionStyle editor={editor} scope={scope} />
    <div
      onKeyDownCapture={onKeyDownCapture}
      onKeyDown={linkKey}
      onFocusCapture={onFocusCapture}
      onMouseDownCapture={() => { writing.current = true }}
      className={`dana-writing-canvas ${scope} min-w-0${lastLine ? ' dana-last-line' : ''}`}
      style={placeholder === undefined || lastLine ? undefined : ({ '--dana-canvas-placeholder': JSON.stringify(placeholder) } as React.CSSProperties)}
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
        aria-label={label ?? (onCreateTask === undefined ? 'Page writing' : 'Page writing and tasks')}
      >
        <FormattingToolbarController formattingToolbar={CanvasFormattingToolbar} />
        <FilePanelController
          filePanel={(props) => (
            <CanvasFilePanel {...props} onUpload={onUploadFile} />
          )}
        />
        <SideMenuController sideMenu={BlockSideMenu} floatingUIOptions={blockSidePosition} />
        <CanvasSlashMenu editor={editor} context={slashContext} />
        {editable ? <MentionSuggestions editor={editor} folderId={peopleFolderId} /> : null}
        <CanvasMarquee />
      </BlockNoteView>
      {/* Work's last line, for a reader who can write (the one asked to, `placeholder`). */}
      {lastLine ? <AddTaskLine editor={editor} page={peopleFolderId ?? ''} editable={editable} /> : null}
      {editable ? <div aria-hidden="true" className="dana-canvas-tail" onMouseDown={writeBelow} /> : null}
    </div>
    <AlertDialog open={referenceToConvert !== null} onOpenChange={(open) => { if (!open) setReferenceToConvert(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Turn this page link into a task?</AlertDialogTitle>
          <AlertDialogDescription>The link to the page is removed, and a task is made with the link text as its title.</AlertDialogDescription>
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
