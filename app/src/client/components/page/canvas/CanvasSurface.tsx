import { createContext, useContext, useEffect, useState } from 'react'
import { offset } from '@floating-ui/react'
import { BlockNoteView } from '@blocknote/shadcn'
import {
  FormattingToolbarController, SuggestionMenuController, SideMenuController, SideMenu,
  DragHandleMenu, RemoveBlockItem,
  useBlockNoteEditor, useComponentsContext, useExtensionState,
  getDefaultReactSlashMenuItems,
} from '@blocknote/react'
import type { DefaultReactSuggestionItem } from '@blocknote/react'
import { filterSuggestionItems, SideMenuExtension } from '@blocknote/core/extensions'
import { CanvasFormattingToolbar } from './CanvasFormattingToolbar.js'
import { installCanvasGuard } from './guard.js'
import { ancestorsOf, bindTaskCommand, continueAfterGroup, headingOneContext, insertCanvasHeading, moveCanvasBlock, removeHeadingKeepingContent } from './commands.js'
import type { CanvasBlock, CanvasEditor } from './schema.js'
import './canvas.css'
import { ArrowDown, CheckCircle2, X } from '../../../lib/icons.js'

const CommandContext = createContext<{ task?: (block?: CanvasBlock) => void; explain: (message: string) => void }>({ explain: () => {} })

function CanvasBlockMenu(): React.JSX.Element | null {
  const editor = useBlockNoteEditor() as CanvasEditor
  const commands = useContext(CommandContext)
  const components = useComponentsContext()!
  const sideBlock = useExtensionState(SideMenuExtension, { editor, selector: (state) => state?.block })
  const block = sideBlock === undefined ? undefined : editor.getBlock(sideBlock.id)
  if (block === undefined) return null
  const group = block.type === 'heading' ? block : (ancestorsOf(editor.document, block.id) ?? []).at(-1)
  return (
    <DragHandleMenu>
      {(['up', 'down', 'out', 'in'] as const).map((direction) => <components.Generic.Menu.Item key={direction} onClick={() => commands.explain(moveCanvasBlock(editor, block, direction) ?? '')}>
        <span>{{ up: 'Move up', down: 'Move down', out: 'Move out of group', in: 'Move into previous group' }[direction]}</span>
      </components.Generic.Menu.Item>)}
      {block.type === 'paragraph' && commands.task ? <components.Generic.Menu.Item onClick={() => commands.task?.(block)}><CheckCircle2 size={16} /><span>Convert to Task</span></components.Generic.Menu.Item> : null}
      {group?.type === 'heading' ? (
        <components.Generic.Menu.Item onClick={() => continueAfterGroup(editor, group)}>
          <ArrowDown size={16} /><span>Continue after group</span>
        </components.Generic.Menu.Item>
      ) : null}
      {block.type === 'heading' ? (
        <components.Generic.Menu.Item onClick={() => removeHeadingKeepingContent(editor, block)}>
          <X size={16} /><span>Remove heading<span className="block text-xs text-muted-foreground">Keep its Tasks and content</span></span>
        </components.Generic.Menu.Item>
      ) : block.type === 'danaTask' ? (
        <p className="px-3 py-2 text-sm text-muted-foreground">Use the Task menu for Task actions</p>
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
export function CanvasSurface({ editor, onChange, onCreateTask, editable = true }: {
  readonly editor: CanvasEditor
  readonly onChange: (editor: CanvasEditor) => void
  readonly onCreateTask?: (block?: CanvasBlock) => void
  readonly editable?: boolean
}): React.JSX.Element {
  const [feedback, setFeedback] = useState('')
  const [theme, setTheme] = useState<'dark' | 'light'>(() => document.documentElement.classList.contains('dark') ? 'dark' : 'light')
  useEffect(() => installCanvasGuard(editor, setFeedback), [editor])
  useEffect(() => onCreateTask ? bindTaskCommand(editor, onCreateTask) : undefined, [editor, onCreateTask])
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light'))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return (
    <CommandContext.Provider value={{ task: onCreateTask, explain: setFeedback }}>
    <div className="dana-writing-canvas min-w-0">
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme={theme}
        formattingToolbar={false}
        slashMenu={false}
        sideMenu={false}
        onChange={() => { setFeedback(''); onChange(editor) }}
        aria-label="Folder writing and Tasks"
      >
        <FormattingToolbarController formattingToolbar={CanvasFormattingToolbar} />
        <SideMenuController sideMenu={CanvasSideMenu} floatingUIOptions={canvasSidePosition} />
        <SuggestionMenuController triggerCharacter="/" getItems={async (query) => {
          const defaults = getDefaultReactSlashMenuItems(editor)
          const byKey = (key: string): DefaultReactSuggestionItem | undefined => defaults.find((item) => 'key' in item && item.key === key)
          const core: DefaultReactSuggestionItem[] = defaults.filter((item) => 'key' in item && (item.key === 'paragraph' || item.key === 'image'))
            .map((item) => 'key' in item && item.key === 'paragraph' ? { ...item, title: 'Text' } : item)
          const heading = byKey('heading')
          if (heading !== undefined) {
            core.splice(1, 0, { ...heading, title: 'Heading 1', onItemClick: () => insertCanvasHeading(editor, 1) })
            if (headingOneContext(editor) !== undefined) core.splice(2, 0, {
              ...byKey('heading_2') ?? heading, title: 'Heading 2', subtext: 'A subgroup inside Heading 1',
              onItemClick: () => insertCanvasHeading(editor, 2),
            })
          }
          core.splice(1, 0, {
            title: 'Task', subtext: 'A Dana Task', icon: <CheckCircle2 size={16} />,
            onItemClick: onCreateTask ?? (() => setFeedback('Task creation and placement are not connected in this development preview yet. Existing Tasks use their native Dana controls.')),
            aliases: ['todo'], group: 'Basic blocks',
          })
          return filterSuggestionItems(core.map((item) => ({ ...item, size: 'small' as const })), query)
        }} />
      </BlockNoteView>
      <p role="status" aria-live="polite" className="min-h-6 px-2 text-sm text-muted-foreground">{feedback}</p>
    </div>
    </CommandContext.Provider>
  )
}
