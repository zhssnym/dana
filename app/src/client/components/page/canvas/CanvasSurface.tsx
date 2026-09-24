import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { offset } from '@floating-ui/react'
import { BlockNoteView } from '@blocknote/shadcn'
import {
  FilePanelController, FormattingToolbarController, SuggestionMenuController, SideMenuController, SideMenu,
  DragHandleMenu,
  useBlockNoteEditor, useComponentsContext, useExtensionState,
  getDefaultReactSlashMenuItems,
} from '@blocknote/react'
import type { DefaultReactSuggestionItem } from '@blocknote/react'
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu, SideMenuExtension } from '@blocknote/core/extensions'
import { CanvasFilePanel } from './CanvasFilePanel.js'
import type { CanvasMediaKind, CanvasUploadedFile } from './CanvasFilePanel.js'
import { CanvasFormattingToolbar } from './CanvasFormattingToolbar.js'
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
import { ancestorsOf, bindTaskCommand, continueAfterGroup, headingOneContext, insertCanvasHeading, insertDocumentHeading, moveCanvasBlock, removeCanvasBlocks, removeHeadingKeepingContent } from './commands.js'
import type { CanvasBlock, CanvasEditor } from './schema.js'
import { DanaLinkSuggestions, linkSlashItem } from '../../links/dana-link-picker.js'
import './canvas.css'
import {
  CheckCircle2,
  FileText,
  ListPlus,
  Network,
  Quote,
} from '../../../lib/icons.js'

type HeadingMode = 'section' | 'document' | 'none'

const CommandContext = createContext<{ task?: (block?: CanvasBlock) => void; explain: (message: string) => void; headingMode: HeadingMode; removeFolder?: (folderId: string) => void; flat?: boolean }>({ explain: () => {}, headingMode: 'section' })

function CanvasBlockMenu(): React.JSX.Element | null {
  const editor = useBlockNoteEditor() as CanvasEditor
  const commands = useContext(CommandContext)
  const components = useComponentsContext()!
  const sideBlock = useExtensionState(SideMenuExtension, { editor, selector: (state) => state?.block })
  const block = sideBlock === undefined ? undefined : editor.getBlock(sideBlock.id)
  if (block === undefined) return null
  const group = commands.headingMode === 'section'
    ? block.type === 'heading' && block.props.isToggleable !== false
      ? block
      : (ancestorsOf(editor.document, block.id) ?? []).filter((item) => item.type === 'heading' && item.props.isToggleable !== false).at(-1)
    : undefined
  const directions = commands.headingMode === 'section' ? (['up', 'down', 'out', 'in'] as const) : (['up', 'down'] as const)
  const remove = (): void => {
    const selected = editor.getSelection()?.blocks
    removeCanvasBlocks(editor, selected?.some((item) => item.id === block.id) ? selected : [block])
  }
  return (
    <DragHandleMenu>
      {directions.filter((direction) => !commands.flat || (direction !== 'out' && !(direction === 'in' && block.type === 'heading'))).map((direction) => <components.Generic.Menu.Item key={direction} onClick={() => commands.explain(moveCanvasBlock(editor, block, direction) ?? '')}>
        <span>{{ up: 'Move up', down: 'Move down', out: 'Move out of section', in: 'Move into section above' }[direction]}</span>
      </components.Generic.Menu.Item>)}
      {block.type === 'paragraph' && commands.task ? <components.Generic.Menu.Item onClick={() => commands.task?.(block)}><span>Turn into task</span></components.Generic.Menu.Item> : null}
      {group?.type === 'heading' && !commands.flat ? (
        <components.Generic.Menu.Item onClick={() => continueAfterGroup(editor, group)}>
          <span>Continue after section</span>
        </components.Generic.Menu.Item>
      ) : null}
      {block.type === 'heading' && commands.headingMode === 'section' ? (
        <components.Generic.Menu.Item onClick={() => removeHeadingKeepingContent(editor, block)}>
          <span>Remove heading<span className="block text-xs text-muted-foreground">Keeps what is under it</span></span>
        </components.Generic.Menu.Item>
      ) : block.type === 'danaFolder' ? (
        /* #221: a Folder row is the Shelf's membership, so it leaves through the
           membership act and never through generic Delete. */
        commands.removeFolder ? <components.Generic.Menu.Item onClick={() => commands.removeFolder?.(block.props.folderId)}>
          <span>Remove from shelf<span className="block text-xs text-muted-foreground">The folder itself is kept</span></span>
        </components.Generic.Menu.Item> : null
      ) : block.type === 'danaTask' ? (
        /*
        A Task block has no Delete here: deleting a task is a task action, in
        its row's own menu. Every placement, open or completed, draws its real
        row (`CanvasTask.tsx`), so that menu is always there to point at.
        */
        <p className="px-3 py-2 text-sm text-muted-foreground">Delete a task from its own menu.</p>
      ) : (
        <components.Generic.Menu.Item onClick={remove}><span className="text-destructive">Delete</span></components.Generic.Menu.Item>
      )}
    </DragHandleMenu>
  )
}

function CanvasSideMenu(): React.JSX.Element {
  return <SideMenu dragHandleMenu={CanvasBlockMenu} />
}

// Keep BlockNote's controller; adapt its offset to the actual Dana line box.
const canvasSidePosition = {
  useFloatingOptions: {
    middleware: [offset(({ elements, rects }) => {
      const reference = elements.reference
      const element = reference instanceof Element ? reference : reference.contextElement
      const content = element?.querySelector('.bn-block-content') ?? element
      const line = content?.querySelector('.bn-inline-content') ?? content
      if (line === undefined || line === null) return { mainAxis: 8 }
      const box = line.getBoundingClientRect()
      const referenceBox = reference.getBoundingClientRect()
      const style = getComputedStyle(line)
      const lineHeight = Number.parseFloat(style.lineHeight) || box.height
      const toggle = content?.querySelector('.bn-toggle-button')
      const mainAxis = toggle ? referenceBox.left - toggle.getBoundingClientRect().left + 8 : 8
      return { mainAxis, crossAxis: box.top - referenceBox.top + (lineHeight - rects.floating.height) / 2 }
    })],
  },
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
  const [theme, setTheme] = useState<'dark' | 'light'>(() => document.documentElement.classList.contains('dark') ? 'dark' : 'light')
  const requestTask = useCallback((block?: CanvasBlock): void => {
    const target = block ?? editor.getTextCursorPosition().block
    if (folderRefs.has(target.id)) setReferenceToConvert(target)
    else onCreateTask?.(block)
  }, [editor, folderRefs, onCreateTask])
  useEffect(() => installCanvasGuard(editor, setFeedback), [editor])
  useEffect(() => onCreateTask ? bindTaskCommand(editor, requestTask) : undefined, [editor, onCreateTask, requestTask])
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light'))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return (
    <CommandContext.Provider value={{ task: onCreateTask ? requestTask : undefined, explain: setFeedback, headingMode, removeFolder: onRemoveFolder, flat: flatGroups }}>
    <div
      className="dana-writing-canvas min-w-0"
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
        <SideMenuController sideMenu={CanvasSideMenu} floatingUIOptions={canvasSidePosition} />
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
            type: 'bulletListItem' | 'numberedListItem' | 'quote' | 'diagram' | 'file',
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

          /* At most ten, in this order: Text, Heading, Subheading, Task,
             Bulleted list, Numbered list, Quote, Image or file, Diagram,
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
            // A raster image becomes an Image block once uploaded (`CanvasFilePanel`).
            block('Image or file', 'file', <FileText size={16} />, ['image', 'picture', 'photo', 'file', 'attachment', 'document', 'upload']),
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
      </BlockNoteView>
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
    </CommandContext.Provider>
  )
}
