import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { BlockNoteView } from '@blocknote/shadcn'
import {
  FilePanelController, FormattingToolbarController, SuggestionMenuController, SideMenuController,
  getDefaultReactSlashMenuItems,
} from '@blocknote/react'
import type { DefaultReactSuggestionItem } from '@blocknote/react'
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions'
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
import { bindTaskCommand, headingOneContext, insertCanvasHeading, insertDocumentHeading, removeCanvasBlocks } from './commands.js'
import { validateCanvasOutline } from './outline.js'
import { BlockMenuContext, BlockSideMenu, blockSidePosition, duplicateBlocks, pageTheme, turnBlocksInto } from './BlockSideMenu.js'
import type { BlockMenuModel } from './BlockSideMenu.js'
import { BlockSelectionStyle, useBlockAnchor, useBlockSelectionKeys } from './block-selection.js'
import { contains, simulate, simulateNest, TEXT_TYPES, TURN_TARGETS } from './turn-into.js'
import type { TreeBlock } from './turn-into.js'
import type { CanvasBlock, CanvasEditor } from './schema.js'
import { DanaLinkSuggestions, linkSlashItem } from '../../links/dana-link-picker.js'
import './canvas.css'
import {
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  ListPlus,
  Network,
  Quote,
} from '../../../lib/icons.js'

type HeadingMode = 'section' | 'document' | 'none'

const TASK_OR_FOLDER: ReadonlySet<string> = new Set(['danaTask', 'danaFolder'])
const LIST_TYPES: ReadonlySet<string> = new Set(['bulletListItem', 'numberedListItem', 'checkListItem'])

/** A Shelf keeps one heading level and flat lists (ShelfCanvas's own guard). */
function flatShelfFailure(blocks: readonly TreeBlock[]): boolean {
  return blocks.some((block) => (block.type === 'heading' ? block.props.level !== 1 || flatShelfFailure(block.children) : block.children.length > 0))
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
  extraSlashItems,
  placeholder,
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
  readonly extraSlashItems?: readonly DefaultReactSuggestionItem[]
  /** What an empty page says (see canvas.css: BlockNote's own placeholder
   * decoration does not reach Dana's paragraph node view). */
  readonly placeholder?: string
}): React.JSX.Element {
  const [feedback, setFeedback] = useState('')
  const [referenceToConvert, setReferenceToConvert] = useState<CanvasBlock | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>(pageTheme)
  const requestTask = useCallback((block?: CanvasBlock): void => {
    const target = block ?? editor.getTextCursorPosition().block
    if (folderRefs.has(target.id)) setReferenceToConvert(target)
    else onCreateTask?.(block)
  }, [editor, folderRefs, onCreateTask])
  useEffect(() => installCanvasGuard(editor, setFeedback), [editor])
  useEffect(() => onCreateTask ? bindTaskCommand(editor, requestTask) : undefined, [editor, onCreateTask, requestTask])
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(pageTheme()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => observer.disconnect()
  }, [])

  // What this canvas's structure admits: the persisted outline's rules, and a
  // Shelf's flat ones. A refused shape is never offered (menu) or attempted (Tab).
  const admits = useCallback((document: readonly TreeBlock[]): boolean =>
    validateCanvasOutline(document) === null && !(flatGroups && flatShelfFailure(document)), [flatGroups])
  const headingToggles = headingMode === 'section'
  const remove = useCallback((ids: readonly string[]): void => {
    removeCanvasBlocks(editor, ids.flatMap((id) => { const block = editor.getBlock(id); return block === undefined ? [] : [block] }))
  }, [editor])
  const duplicate = useCallback((ids: readonly string[]): void => {
    const blocks = ids.flatMap((id) => { const block = editor.getBlock(id) as TreeBlock | undefined; return block === undefined ? [] : [block] })
    if (blocks.some((block) => contains(block, TASK_OR_FOLDER))) return
    duplicateBlocks(editor, ids)
  }, [editor])
  const menu = useMemo<BlockMenuModel>(() => ({
    targets: (block) => {
      if (!TEXT_TYPES.has(block.type)) return []
      const document = editor.document as unknown as TreeBlock[]
      return TURN_TARGETS.filter((target) => {
        if (target.type === 'heading' && (headingMode === 'none' || (flatGroups && target.level !== 1))) return false
        return admits(simulate(document, block.id, target, headingMode === 'none' ? undefined : headingToggles))
      })
    },
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
      // Deleting a task is a task action, in its row's own menu (`CanvasTask.tsx`).
      if (block.type === 'danaTask') return { note: 'Delete a task from its own menu.' }
      return { label: 'Delete', run: () => { remove(ids) } }
    },
  }), [editor, headingMode, flatGroups, admits, headingToggles, onCreateTask, requestTask, duplicate, onRemoveFolder, remove])
  const selectionActions = useMemo(() => ({ remove, duplicate, admits }), [remove, duplicate, admits])
  useBlockSelectionKeys(editor, selectionActions)
  useBlockAnchor(editor, true)
  const scope = `dana-canvas-${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  // Tab nests only where the result is a shape this canvas can keep; elsewhere
  // it does nothing rather than refuse out loud. Code keeps its own Tab.
  /*
  Enter on an empty nested list item steps out a level (at the root,
  BlockNote's own Enter makes it text). Backspace at the start of a block:
  a nested list item steps out; any other kind turns into text, its children
  lifted after it when text cannot hold them; text merges (BlockNote's). A
  nested item never turns into text in place, a shape the canvas cannot keep.
  */
  const onKeyDownCapture = (event: React.KeyboardEvent): void => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const { selection } = editor.prosemirrorState
    if (!selection.empty || editor.domElement === undefined || !editor.domElement.contains(event.target as Node)) return
    const block = editor.getTextCursorPosition().block
    const stop = (): void => { event.preventDefault(); event.stopPropagation() }
    const inList = LIST_TYPES.has(block.type) && LIST_TYPES.has(editor.getParentBlock(block.id)?.type ?? '')
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
        onChange={() => { setFeedback(''); onChange(editor) }}
        aria-label={label ?? (onCreateTask === undefined ? 'Folder writing' : 'Folder writing and Tasks')}
      >
        <FormattingToolbarController formattingToolbar={CanvasFormattingToolbar} />
        <FilePanelController
          filePanel={(props) => (
            <CanvasFilePanel {...props} onUpload={onUploadFile} />
          )}
        />
        <SideMenuController sideMenu={BlockSideMenu} floatingUIOptions={blockSidePosition} />
        <SuggestionMenuController triggerCharacter="/" getItems={async (query) => {
          const defaults = getDefaultReactSlashMenuItems(editor)
          const byKey = (
            key: string,
          ): DefaultReactSuggestionItem | undefined =>
            defaults.find((item) => 'key' in item && item.key === key)
          // A fresh item from a default one: its icon and aliases, our words, no badge.
          const from = (
            item: DefaultReactSuggestionItem,
            title: string,
            onItemClick: () => void = item.onItemClick,
          ): DefaultReactSuggestionItem => ({
            title,
            onItemClick,
            aliases: item.aliases ?? [],
            icon: item.icon,
            group: 'Basic blocks',
          })
          const paragraph = byKey('paragraph')
          const heading = byKey('heading')
          const block = (
            title: string,
            type: 'bulletListItem' | 'numberedListItem' | 'quote' | 'diagram' | 'image' | 'file',
            icon: React.JSX.Element,
            aliases: string[],
          ): DefaultReactSuggestionItem => ({
            title,
            aliases,
            group: 'Basic blocks',
            icon,
            onItemClick: () =>
              insertOrUpdateBlockForSlashMenu(editor, { type }),
          })

          /* In this order: Text, Heading, Subheading, Task,
             Bulleted list, Numbered list, Quote, Image, File, Diagram,
             Link to…. Checklist, Callout, Code, Audio and Video stay in the
             schema so existing blocks render; they are not offered here. */
          const core: DefaultReactSuggestionItem[] = []
          if (paragraph !== undefined) core.push(from(paragraph, 'Text'))
          if (headingMode === 'section' && heading !== undefined) {
            core.push(from(heading, 'Heading', () => insertCanvasHeading(editor, 1)))
            if (!flatGroups && headingOneContext(editor) !== undefined) {
              core.push(from(byKey('heading_2') ?? heading, 'Subheading', () => insertCanvasHeading(editor, 2)))
            }
          } else if (headingMode === 'document' && heading !== undefined) {
            core.push(
              from(heading, 'Heading', () => insertDocumentHeading(editor, 1)),
              from(byKey('heading_2') ?? heading, 'Subheading', () => insertDocumentHeading(editor, 2)),
            )
          }
          if (onCreateTask !== undefined) core.push({
            title: 'Task', icon: <CheckCircle2 size={16} />,
            /*
            The arrow wrapper is load-bearing. `SuggestionMenuController` calls
            `item.onItemClick(editor)` although the type says `() => void`
            (read off `@blocknote/react`'s built dist), so `onItemClick:
            onCreateTask` handed the editor to a handler whose first parameter
            is an optional block: it read `.id` as `undefined` and the dialog's
            button then did nothing at all (#204, live 2026-09-17 to 09-20,
            #234 cause 4; AC-166 reaches it). The type cannot catch this, so
            any handler put here needs the same arrow.
            */
            onItemClick: () => {
              onCreateTask()
            },
            aliases: ['todo', 'to-do'], group: 'Basic blocks',
          })
          core.push(
            block('Bulleted list', 'bulletListItem', <ListPlus size={16} />, ['bullet', 'unordered list', 'ul']),
            block('Numbered list', 'numberedListItem', <ListPlus size={16} />, ['numbered', 'ordered list', 'ol']),
            block('Quote', 'quote', <Quote size={16} />, ['blockquote']),
            // The spec's two media items: an empty block is a quiet "Add an image" / "Add a file" row.
            block('Image', 'image', <ImageIcon size={16} />, ['picture', 'photo', 'img']),
            block('File', 'file', <FileText size={16} />, ['attachment', 'document', 'upload']),
            block('Diagram', 'diagram', <Network size={16} />, ['flowchart', 'mermaid', 'chart']),
            { ...linkSlashItem(editor), subtext: undefined },
          )
          core.push(...extraSlashItems ?? [])
          /* One group: the default heading items carry 'Headings' between
             'Basic blocks' items, and BlockNote keys groups by name, so two
             'Basic blocks' runs render a duplicate key and an empty header. */
          return filterSuggestionItems(core.map((item) => ({ ...item, group: 'Basic blocks', size: 'small' as const })), query)
        }} />
        {editable ? <DanaLinkSuggestions editor={editor} /> : null}
        <CanvasMarquee />
      </BlockNoteView>
      {editable ? <div aria-hidden="true" className="dana-canvas-tail" onMouseDown={writeBelow} /> : null}
      <p role="status" aria-live="polite" className="min-h-6 px-2 text-sm text-muted-foreground">{feedback}</p>
    </div>
    <AlertDialog open={referenceToConvert !== null} onOpenChange={(open) => { if (!open) setReferenceToConvert(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Turn this folder link into a task?</AlertDialogTitle>
          <AlertDialogDescription>The link to the folder is removed, and a task is made with the link text as its title.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction destructive onClick={() => {
            if (referenceToConvert !== null) onCreateTask?.(referenceToConvert)
          }}>Turn into task</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </BlockMenuContext.Provider>
  )
}
