import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { offset } from '@floating-ui/react'
import { BlockNoteView } from '@blocknote/shadcn'
import {
  FilePanelController, FormattingToolbarController, SuggestionMenuController, SideMenuController, SideMenu,
  DragHandleMenu, RemoveBlockItem,
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
import { ancestorsOf, bindTaskCommand, continueAfterGroup, headingOneContext, insertCanvasHeading, insertDocumentHeading, moveCanvasBlock, removeHeadingKeepingContent } from './commands.js'
import type { CanvasBlock, CanvasEditor } from './schema.js'
import './canvas.css'
import {
  ArrowDown,
  AudioLines,
  CheckCircle2,
  Code,
  FileText,
  Image,
  Lightbulb,
  ListChecks,
  ListPlus,
  Quote,
  Video,
  X,
} from '../../../lib/icons.js'

type HeadingMode = 'section' | 'document' | 'none'

const CommandContext = createContext<{ task?: (block?: CanvasBlock) => void; explain: (message: string) => void; headingMode: HeadingMode }>({ explain: () => {}, headingMode: 'section' })

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
  return (
    <DragHandleMenu>
      {directions.map((direction) => <components.Generic.Menu.Item key={direction} onClick={() => commands.explain(moveCanvasBlock(editor, block, direction) ?? '')}>
        <span>{{ up: 'Move up', down: 'Move down', out: 'Move out of group', in: 'Move into previous group' }[direction]}</span>
      </components.Generic.Menu.Item>)}
      {block.type === 'paragraph' && commands.task ? <components.Generic.Menu.Item onClick={() => commands.task?.(block)}><CheckCircle2 size={16} /><span>Convert to Task</span></components.Generic.Menu.Item> : null}
      {group?.type === 'heading' ? (
        <components.Generic.Menu.Item onClick={() => continueAfterGroup(editor, group)}>
          <ArrowDown size={16} /><span>Continue after group</span>
        </components.Generic.Menu.Item>
      ) : null}
      {block.type === 'heading' && commands.headingMode === 'section' ? (
        <components.Generic.Menu.Item onClick={() => removeHeadingKeepingContent(editor, block)}>
          <X size={16} /><span>Remove heading<span className="block text-xs text-muted-foreground">Keep its Tasks and content</span></span>
        </components.Generic.Menu.Item>
      ) : block.type === 'danaTask' ? (
        /*
        Why a Task block has no Delete, said in words that name a control that
        exists. "Use the Task menu for Task actions" named none: the row's
        overflow is labelled "More actions" and there is nothing called a Task
        menu anywhere in the product, and on a finished Task there was no row
        under the pointer at all. A finished block now collapses to nothing
        (`CanvasTask.tsx`), so this menu is not reachable on one; the Done
        clause is here because a string that is only true where it happens to
        be reachable is the same defect waiting for the next change.
        */
        <p className="px-3 py-2 text-sm text-muted-foreground">Delete a Task from its own row, under More actions. A finished Task keeps its row in Done.</p>
      ) : <RemoveBlockItem>Delete</RemoveBlockItem>}
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
    <CommandContext.Provider value={{ task: onCreateTask ? requestTask : undefined, explain: setFeedback, headingMode }}>
    <div className="dana-writing-canvas min-w-0">
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme={theme}
        formattingToolbar={false}
        slashMenu={false}
        sideMenu={false}
        filePanel={false}
        onChange={() => { setFeedback(''); onChange(editor) }}
        aria-label={onCreateTask === undefined ? 'Folder writing' : 'Folder writing and Tasks'}
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
          const paragraph = byKey('paragraph')
          const heading = byKey('heading')
          const core: DefaultReactSuggestionItem[] = [
            ...(paragraph === undefined
              ? []
              : [{ ...paragraph, title: 'Text' }]),
          ]

          if (headingMode === 'section' && heading !== undefined) {
            core.push({
              ...heading,
              title: 'Heading 1',
              onItemClick: () => insertCanvasHeading(editor, 1),
            })
            if (headingOneContext(editor) !== undefined) {
              core.push({
                ...(byKey('heading_2') ?? heading),
                title: 'Heading 2',
                subtext: 'A subgroup inside Heading 1',
                onItemClick: () => insertCanvasHeading(editor, 2),
              })
            }
          } else if (headingMode === 'document' && heading !== undefined) {
            core.push(
              ...([1, 2, 3] as const).map((level) => ({
                ...(level === 1
                  ? heading
                  : byKey(`heading_${String(level)}`) ?? heading),
                title: `Heading ${String(level)}`,
                subtext: 'Document heading',
                onItemClick: () => insertDocumentHeading(editor, level),
              })),
            )
          }

          const authored = (
            title: string,
            type:
              | 'bulletListItem'
              | 'numberedListItem'
              | 'checkListItem'
              | 'quote'
              | 'callout'
              | 'codeBlock'
              | 'image'
              | 'file'
              | 'audio'
              | 'video',
            icon: React.JSX.Element,
            aliases: string[],
            subtext: string,
          ): DefaultReactSuggestionItem => ({
            title,
            subtext,
            aliases,
            group: 'Basic blocks',
            icon,
            onItemClick: () =>
              insertOrUpdateBlockForSlashMenu(editor, { type }),
          })

          core.push(
            authored(
              'Bulleted list',
              'bulletListItem',
              <ListPlus size={16} />,
              ['bullet', 'unordered list'],
              'A simple list',
            ),
            authored(
              'Numbered list',
              'numberedListItem',
              <ListPlus size={16} />,
              ['numbered', 'ordered list'],
              'An automatically numbered list',
            ),
            authored(
              'Checklist',
              'checkListItem',
              <ListChecks size={16} />,
              ['check', 'todo list'],
              'Authored checklist, not a Task',
            ),
            authored(
              'Quote',
              'quote',
              <Quote size={16} />,
              ['blockquote'],
              'Quoted writing',
            ),
            authored(
              'Callout',
              'callout',
              <Lightbulb size={16} />,
              ['note'],
              'A neutral highlighted note',
            ),
            authored(
              'Code',
              'codeBlock',
              <Code size={16} />,
              ['code block'],
              'Plain monospaced code',
            ),
            authored(
              'Image',
              'image',
              <Image size={16} />,
              ['picture', 'photo'],
              'Upload an image',
            ),
            authored(
              'File',
              'file',
              <FileText size={16} />,
              ['attachment', 'document'],
              'Upload as a downloadable file',
            ),
            authored(
              'Audio',
              'audio',
              <AudioLines size={16} />,
              ['sound'],
              'Upload previewable audio',
            ),
            authored(
              'Video',
              'video',
              <Video size={16} />,
              ['movie'],
              'Upload previewable video',
            ),
          )

          if (onCreateTask !== undefined) core.splice(1, 0, {
            title: 'Task', subtext: 'A Dana Task', icon: <CheckCircle2 size={16} />,
            /*
            Called with no argument, and the wrapper is load-bearing rather
            than a style.

            `DefaultSuggestionItem.onItemClick` is typed `() => void`, and
            `SuggestionMenuController` invokes it as `item.onItemClick(editor)`
            — read off the installed build,
            `node_modules/@blocknote/react/dist/blocknote-react.js`, rather than
            recalled. So `onItemClick: onCreateTask` handed the **editor** to a
            handler whose first parameter is an optional `CanvasBlock`:
            `askTask` took it for the block to anchor on, read `.id` off it as
            `undefined`, and set `taskAt` to `undefined`. The dialog opened
            anyway, `taskAt !== null` being true of `undefined`, and
            `createTask`'s own `if (!taskAt) return` then made the Create Task
            button do nothing at all — no task, no error, no feedback line.
            Shipped in #204 and live from 2026-09-17 to 2026-09-20 (#234, cause
            4): the `/` menu is the first of the three routes 9.6 names to the
            Create Task dialog, and it was the broken one. AC-166 is the
            criterion that reaches it.

            The type cannot catch this — it promises an arity the library does
            not keep — so the arrow is the whole of the defence, and any handler
            put here later needs the same one.
            */
            onItemClick: () => {
              onCreateTask()
            },
            aliases: ['todo'], group: 'Basic blocks',
          })
          /* One group: the default heading items carry 'Headings' between
             'Basic blocks' items, and BlockNote keys groups by name, so two
             'Basic blocks' runs render a duplicate key and an empty header. */
          return filterSuggestionItems(core.map((item) => ({ ...item, group: 'Basic blocks', size: 'small' as const })), query)
        }} />
      </BlockNoteView>
      <p role="status" aria-live="polite" className="min-h-6 px-2 text-sm text-muted-foreground">{feedback}</p>
    </div>
    <AlertDialog open={referenceToConvert !== null} onOpenChange={(open) => { if (!open) setReferenceToConvert(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Convert this folder reference to a Task?</AlertDialogTitle>
          <AlertDialogDescription>The reference and its relation to the folder will be removed. A Task will be created with the link text as its title.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction destructive onClick={() => {
            if (referenceToConvert !== null) onCreateTask?.(referenceToConvert)
          }}>Convert to Task</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </CommandContext.Provider>
  )
}
