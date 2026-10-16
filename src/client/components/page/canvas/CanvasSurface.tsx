import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../ui/dropdown-menu.js'
import { installCanvasGuard, removingPages } from './guard.js'
import { publishedFolders } from '../../../lib/folder-library.js'
import { foldUndo, pushUndo, undoLabel } from '../../../shell/undo.js'
import { bindTaskCommand, moveBlocksBy, removeCanvasBlocks } from './commands.js'
import { CanvasSlashMenu, blockMenuTargets, headingTogglesFor } from './slash-items.js'
import { isSectionHeading, shelfOutlineFailure, validateCanvasOutline } from './outline.js'
import { BlockMenuContext, BlockSideMenu, blockSidePosition, duplicateBlocks, pageTheme, turnBlocksInto } from './BlockSideMenu.js'
import type { BlockMenuModel } from './BlockSideMenu.js'
import { BlockSelectionStyle, useBlockAnchor, useBlockSelectionKeys } from './block-selection.js'
import { backspaceToText, contains, simulateNest, TEXT_TYPES, TURN_TARGETS } from './turn-into.js'
import type { TreeBlock } from './turn-into.js'
import type { CanvasBlock, CanvasEditor } from './schema.js'
import { MentionSuggestions } from './mentions.js'
import { PersonBlockContext } from './person-context.js'
import { useCanvasTaskDelete } from './CanvasTask.js'
import { SyncedToolbar } from './CanvasSynced.js'
import './canvas.css'

type HeadingMode = 'section' | 'document' | 'none'

const TASK: ReadonlySet<string> = new Set(['danaTask'])
const TASK_OR_FOLDER: ReadonlySet<string> = new Set(['danaTask', 'danaFolder', 'danaPage'])
const LIST_TYPES: ReadonlySet<string> = new Set(['bulletListItem', 'numberedListItem', 'checkListItem', 'toggleListItem'])

/** A shelf keeps one heading level: its headings are stored flat. */
function flatShelfFailure(blocks: readonly TreeBlock[]): boolean {
  return shelfOutlineFailure(blocks)
}

/** A folder reference is drawn as text but stored as `folder_ref`, which holds nothing. */
function referenceHolds(blocks: readonly TreeBlock[], folderRefs: ReadonlyMap<string, string>): boolean {
  return blocks.some((block) => (block.children.length > 0 && folderRefs.has(block.id)) || referenceHolds(block.children, folderRefs))
}

/** Where a block stands: its parent and its siblings on each side, nearest first. */
interface Place { readonly block: CanvasBlock; readonly parent: string | undefined; readonly before: readonly string[]; readonly after: readonly string[] }
function placeOf(editor: CanvasEditor, block: CanvasBlock): Place {
  const parent = editor.getParentBlock(block.id)
  const siblings = (parent?.children ?? editor.document).map((sibling) => sibling.id)
  const at = siblings.indexOf(block.id)
  return { block, parent: parent?.id, before: siblings.slice(0, at).reverse(), after: siblings.slice(at + 1) }
}
/** Puts removed blocks back beside surviving neighbours; one already back stays. */
function restorePlaces(editor: CanvasEditor, places: readonly Place[]): void {
  try {
    editor.transact(() => {
      for (const { block, parent, before, after } of places) {
        if (editor.getBlock(block.id) !== undefined) continue
        const previous = before.find((id) => editor.getBlock(id) !== undefined)
        const next = after.find((id) => editor.getBlock(id) !== undefined)
        const home = parent === undefined ? undefined : editor.getBlock(parent)
        if (previous !== undefined) editor.insertBlocks([block], previous, 'after')
        else if (next !== undefined) editor.insertBlocks([block], next, 'before')
        else if (home !== undefined) editor.updateBlock(home.id, { children: [block, ...home.children] })
        else { const last = editor.document.at(-1); if (last !== undefined) editor.insertBlocks([block], last, 'after') }
      }
    })
  } catch { /* the editor is gone; the tasks still come back */ }
}

/** The caller owns hydration, uploads, task actions and saving. */
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
  footer,
  settle,
  syncedCopies,
}: {
  readonly editor: CanvasEditor
  readonly onChange: (editor: CanvasEditor) => void
  readonly onCreateTask?: (block?: CanvasBlock) => void
  readonly onCreatePage?: () => void
  readonly folderRefs: ReadonlyMap<string, string>
  readonly onUploadFile: (
    kind: CanvasMediaKind,
    file: File,
  ) => Promise<CanvasUploadedFile>
  readonly headingMode?: HeadingMode
  readonly editable?: boolean
  readonly label?: string
  readonly onRemoveFolder?: (folderId: string) => void
  /** A shelf stores headings flat, so it offers one level and no ungrouping gestures. */
  readonly flatGroups?: boolean
  /**
   * What an empty page says. BlockNote's placeholder does not reach Dana's paragraph
   * node view (see canvas.css).
   */
  readonly placeholder?: string
  /** Whose members the `@` menu offers; none offers pages only. */
  readonly peopleFolderId?: string
  /** The page's one save line (`SaveFailure`), so a canvas never draws a second. */
  readonly onNotice: (message: string) => void
  readonly results?: boolean
  readonly footer?: ReactNode
  /** Sends the writing now; true once the page holds it. Named tasks are trashed after. */
  readonly settle?: (taskIds: readonly string[]) => Promise<boolean>
  /** Other documents that hold a synced copy of a block, by block id. */
  readonly syncedCopies?: Readonly<Record<string, number>>
}): React.JSX.Element {
  const [referenceToConvert, setReferenceToConvert] = useState<CanvasBlock | null>(null)
  const [insertMenu, setInsertMenu] = useState<{ readonly id: string; readonly x: number; readonly y: number } | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>(pageTheme)
  // Task rows belong to Work pages only. Gating here removes every task path on
  // Doc and Results canvases at once.
  const taskCreator = headingMode === 'section' && !flatGroups ? onCreateTask : undefined
  const requestTask = useCallback((block?: CanvasBlock): void => {
    const target = block ?? editor.getTextCursorPosition().block
    if (folderRefs.has(target.id)) setReferenceToConvert(target)
    else taskCreator?.(block)
  }, [editor, folderRefs, taskCreator])
  const slashContext = useMemo(() => ({
    surface: headingMode === 'document' ? 'document' as const : headingMode === 'none' ? 'plain' as const : flatGroups ? 'shelf' as const : 'work' as const,
    onCreateTask: taskCreator === undefined ? undefined : () => { taskCreator() },
    onCreatePage,
    results,
  }), [headingMode, flatGroups, taskCreator, onCreatePage, results])
  useEffect(() => installCanvasGuard(editor, onNotice), [editor, onNotice])
  useEffect(() => taskCreator ? bindTaskCommand(editor, requestTask) : undefined, [editor, taskCreator, requestTask])
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(pageTheme()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => observer.disconnect()
  }, [])

  // Shapes this canvas can keep. A refused shape is never offered or attempted.
  const admits = useCallback((document: readonly TreeBlock[]): boolean =>
    validateCanvasOutline(document) === null && !(flatGroups && flatShelfFailure(document)) && !referenceHolds(document, folderRefs), [flatGroups, folderRefs])
  const deleteTask = useCanvasTaskDelete()
  // Read at the key, so a new callback each render does not re-arm the keys.
  const settleRef = useRef(settle)
  settleRef.current = settle
  // Picked blocks leave together. A sub-page goes to Trash with its block; a task
  // goes by its own act after the writing's save lands, so they never race.
  const remove = useCallback((ids: readonly string[]): void => {
    const blocks = ids.flatMap((id) => { const block = editor.getBlock(id); return block === undefined ? [] : [block] })
    const tasks = blocks.filter((block) => block.type === 'danaTask')
    const trash = tasks.map((block) => deleteTask?.(String(block.props.taskId)) ?? null)
    if (trash.some((run) => run === null)) { removeCanvasBlocks(editor, blocks); return }
    const rest = blocks.filter((block) => block.type !== 'danaTask')
    const pages = (list: readonly TreeBlock[]): string[] => list.flatMap((block) => [
      ...(block.type === 'danaPage' ? [String(block.props.folderId)] : []), ...pages(block.children)])
    const places = rest.map((block) => placeOf(editor, block))
    if (rest.length > 0) removingPages(pages(rest as unknown as TreeBlock[]), () => { removeCanvasBlocks(editor, rest) })
    if (trash.length === 0 || rest.some((block) => editor.getBlock(block.id) !== undefined)) return
    const settled = (taskIds: readonly string[]): Promise<boolean> => settleRef.current?.(taskIds) ?? Promise.resolve(true)
    // The tasks' Undo also restores the writing, saved first, so one Undo restores all.
    void settled(tasks.map((block) => String(block.props.taskId))).then((saved) => {
      if (!saved) return
      const run = (): void => { for (const go of trash) go?.() }
      if (places.length === 0) { run(); return }
      foldUndo(run, () => { restorePlaces(editor, places); return settled([]) })
    })
  }, [editor, deleteTask])
  // Undo puts the same block back, and the save then restores the page.
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
    // A task or a page is one record; a copied row would be a second row for it.
    if (blocks.some((block) => contains(block, TASK))) { onNotice("This selection contains a Task, which can't be duplicated. Select only the writing."); return }
    if (blocks.some((block) => contains(block, TASK_OR_FOLDER))) { onNotice("This selection contains a page, which can't be duplicated. Select only the writing."); return }
    duplicateBlocks(editor, ids)
  }, [editor, onNotice])
  const insertBefore = useCallback((id: string): void => {
    if (!editable || editor.getBlock(id) === undefined) return
    const [line] = editor.insertBlocks([{ type: 'paragraph' }], id, 'before')
    if (line === undefined) return
    editor.setTextCursorPosition(line.id, 'start')
    editor.focus()
  }, [editor, editable])
  const menu = useMemo<BlockMenuModel>(() => ({
    insertBefore: taskCreator === undefined || !editable ? undefined : insertBefore,
    targets: (block) => blockMenuTargets(editor, block),
    turnInto: (ids, target) => { turnBlocksInto(editor, ids, target, headingMode === 'none' ? undefined : (block) => headingTogglesFor(editor, block, target)) },
    // A stored to-do turns into a task like text does, on Work only.
    extraTarget: (block) => (block.type === 'paragraph' || block.type === 'checkListItem') && taskCreator !== undefined
      ? { title: 'Task', run: () => { requestTask(editor.getBlock(block.id) ?? undefined) } }
      : null,
    canDuplicate: (block) => !contains(block, TASK_OR_FOLDER),
    duplicate,
    removal: (block, ids) => {
      // A folder row is the shelf's membership, so it leaves through that act, never Delete.
      if (block.type === 'danaFolder') {
        const folderId = String(block.props.folderId)
        return onRemoveFolder ? { label: 'Remove from collection', run: () => { onRemoveFolder(folderId) } } : null
      }
      if (block.type === 'danaPage') {
        const folderId = String(block.props.folderId)
        return { label: 'Move page to Trash', run: () => { trashPage(block.id, folderId) } }
      }
      // A task's Delete is its own act, with confirmation and undo.
      if (block.type === 'danaTask') {
        const run = deleteTask?.(String(block.props.taskId)) ?? null
        return run === null ? null : { label: 'Delete', run }
      }
      return { label: 'Delete', run: () => { remove(ids) } }
    },
  }), [editor, headingMode, taskCreator, editable, insertBefore, requestTask, duplicate, onRemoveFolder, remove, deleteTask, trashPage])
  const move = useCallback((ids: readonly string[], direction: -1 | 1): boolean => moveBlocksBy(editor, ids, direction), [editor])
  const selectionActions = useMemo(() => ({ remove, duplicate, admits, move }), [remove, duplicate, admits, move])
  useBlockSelectionKeys(editor, selectionActions)
  useBlockAnchor(editor, true)
  const scope = `dana-canvas-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const surface = useRef<HTMLDivElement>(null)

  // Tab nests a block under the one above only where the shape is allowed; code keeps
  // its own Tab. Focus that arrives by Tab passes through until you type or click
  // (WCAG 2.1.2).
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
    if (taskCreator !== undefined && editable && (event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'Enter') {
      const row = (event.target as Element).closest('.bn-block-outer[data-id]')
      const id = row?.getAttribute('data-id') ?? editor.getTextCursorPosition().block.id
      event.preventDefault()
      event.stopPropagation()
      insertBefore(id)
      return
    }
    if (event.key === 'Tab' && !event.metaKey && !event.ctrlKey && !event.altKey && event.target === editor.domElement && !writing.current) {
      // Passing through: the browser's Tab.
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
      // Only in the text itself; on a link or chip it is the browser's Tab.
      if (event.target !== editor.domElement || block.type === 'codeBlock') return
      const next = simulateNest(editor.document as unknown as TreeBlock[], block.id)
      if (next === null || !admits(next)) stop()
    } else if (event.key === 'Enter' && !event.shiftKey) {
      if (inList && Array.isArray(block.content) && block.content.length === 0) { stop(); editor.unnestBlock(); return }
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

  // Mod+K on selected text is BlockNote's link field; stop it here so app search
  // does not open over it.
  const linkKey = (event: React.KeyboardEvent): void => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k' || event.shiftKey || event.altKey) return
    if (editor.domElement === undefined || !editor.domElement.contains(event.target as Node)) return
    if (editor.prosemirrorState.selection.empty || editor.getSelectedText() === '') return
    event.stopPropagation()
  }

  // A click below the last block writes on, inside the final section if the page
  // ends in one.
  const writeBelow = (event: React.MouseEvent): void => {
    if (!editable || event.button !== 0) return
    event.preventDefault()
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
      onContextMenu={(event) => {
        if (taskCreator === undefined || !editable) return
        const row = (event.target as Element).closest('.bn-block-outer[data-id]')
        if (row === null) return
        const id = row.getAttribute('data-id')
        if (id === null) return
        if (!window.matchMedia('(hover: none)').matches && row.querySelector('[data-canvas-task-id]') === null) return
        event.preventDefault()
        const box = row.getBoundingClientRect()
        setInsertMenu({ id, x: event.clientX || box.left, y: event.clientY || box.bottom })
      }}
      ref={surface}
      className={`dana-writing-canvas ${scope} relative min-w-0`}
      style={placeholder === undefined ? undefined : ({ '--dana-canvas-placeholder': JSON.stringify(placeholder) } as React.CSSProperties)}
    >
      <PersonBlockContext.Provider value={peopleFolderId ?? null}>
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme={theme}
        formattingToolbar={false}
        slashMenu={false}
        sideMenu={false}
        filePanel={false}
        tableHandles={true}
        onChange={() => { onNotice(''); onChange(editor) }}
        aria-label={label ?? (taskCreator === undefined ? 'Page writing' : 'Page writing and tasks')}
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
      </PersonBlockContext.Provider>
      <DropdownMenu open={insertMenu !== null} onOpenChange={(open) => { if (!open) setInsertMenu(null) }}>
        <DropdownMenuTrigger nativeButton={false} render={<span aria-hidden="true" tabIndex={-1} />}
          style={{ position: 'fixed', left: insertMenu?.x ?? 0, top: insertMenu?.y ?? 0, width: 0, height: 0 }} />
        <DropdownMenuContent align="start" className="w-auto" finalFocus={() => false}>
          <DropdownMenuItem onClick={() => { if (insertMenu !== null) insertBefore(insertMenu.id) }}>Insert block above</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SyncedOriginals editor={editor} host={surface} scope={scope} copies={syncedCopies} />
      {footer}
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
            if (referenceToConvert !== null) taskCreator?.(referenceToConvert)
          }}>Turn into task</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </BlockMenuContext.Provider>
  )
}

/** While the caret is in an original that has copies, it gets the copies' frame and toolbar. */
function SyncedOriginals({ editor, host, scope, copies }: {
  readonly editor: CanvasEditor
  readonly host: React.RefObject<HTMLDivElement | null>
  readonly scope: string
  readonly copies: Readonly<Record<string, number>> | undefined
}): React.JSX.Element | null {
  const [active, setActive] = useState<{ readonly id: string; readonly top: number; readonly right: number } | null>(null)
  useEffect(() => {
    const root = host.current
    if (root === null || copies === undefined) return
    const update = (): void => {
      if (!editor.isFocused()) return
      let block: CanvasBlock | undefined = editor.getTextCursorPosition().block
      while (block !== undefined && copies[block.id] === undefined) block = editor.getParentBlock(block.id)
      const content = block === undefined ? null : root.querySelector(`.bn-block-outer[data-id="${CSS.escape(block.id)}"] > .bn-block > :not(.bn-block-group)`)
      if (block === undefined || content === null) { setActive(null); return }
      const box = content.getBoundingClientRect()
      const base = root.getBoundingClientRect()
      setActive({ id: block.id, top: box.top - base.top, right: base.right - box.right })
    }
    // The toolbar and its open menu keep the original active; leaving both ends it.
    // Checked a task later, so a menu that is closing has updated its trigger.
    const leave = (): void => {
      window.setTimeout(() => {
        if (root.contains(document.activeElement) || root.querySelector('[data-synced-toolbar] [aria-expanded="true"]') !== null) return
        setActive(null)
      }, 0)
    }
    const off = editor.onSelectionChange(update)
    root.addEventListener('focusin', update)
    root.addEventListener('focusout', leave)
    return () => { off(); root.removeEventListener('focusin', update); root.removeEventListener('focusout', leave) }
  }, [editor, host, copies])
  if (active === null || copies?.[active.id] === undefined) return null
  return <>
    <style>{`.${scope} .bn-block-outer[data-id="${CSS.escape(active.id)}"] > .bn-block > :not(.bn-block-group) { box-shadow: 0 0 0 1px var(--color-warning-700); border-radius: var(--radius-sm); }`}</style>
    <div className="absolute" data-synced-original="" style={{ top: active.top, right: active.right }}>
      <SyncedToolbar sourceId={active.id} className="dana-synced-toolbar" />
    </div>
  </>
}
