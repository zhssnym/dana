// The block gutter every canvas shares: ⋮⋮ selects the block and opens its menu;
// drag it or use Tab / Shift-Tab to move. Work adds a + to insert before.
import { createContext, useContext } from 'react'
import { offset } from '@floating-ui/react'
import type { BlockNoteEditor } from '@blocknote/core'
import { SideMenuExtension } from '@blocknote/core/extensions'
import { useBlockNoteEditor, useComponentsContext, useExtension, useExtensionState } from '@blocknote/react'
import { blockLink, blockSelection, setBlockSelection, syncLink } from './block-selection.js'
import { isSectionHeading } from './outline.js'
import { conversionOf, isCurrent, withoutIds } from './turn-into.js'
import type { TreeBlock, TurnTarget } from './turn-into.js'
import { Check, CheckCircle2, Copy, GripVertical, Link2, Plus, RefreshCw, Repeat2, Table2, Trash2 } from '../../../lib/icons.js'
import type { LucideIcon } from '../../../lib/icons.js'
import { kindIconOf } from './slash-items.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- both canvas schemas pass through here
export type AnyEditor = BlockNoteEditor<any, any, any>

export interface BlockMenuModel {
  readonly targets: (block: TreeBlock) => readonly TurnTarget[]
  readonly turnInto: (ids: readonly string[], target: TurnTarget) => void
  readonly extraTarget?: (block: TreeBlock) => { title: string; run: () => void } | null
  readonly canDuplicate: (block: TreeBlock) => boolean
  readonly duplicate: (ids: readonly string[]) => void
  readonly insertBefore?: (id: string) => void
  readonly removal: (block: TreeBlock, ids: readonly string[]) => { label: string; run: () => void } | { note: string } | null
}

export function pageTheme(): 'dark' | 'light' {
  const root = document.documentElement
  return root.getAttribute('data-theme') === 'dark' || root.classList.contains('dark') ? 'dark' : 'light'
}

export const BlockMenuContext = createContext<BlockMenuModel | null>(null)

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'
// Canvas types whose stored kind a synced block may show (SYNCABLE_BLOCK_KINDS).
const SYNCABLE_TYPES = new Set(['paragraph', 'heading', 'bulletListItem', 'numberedListItem', 'checkListItem', 'toggleListItem',
  'quote', 'callout', 'codeBlock', 'diagram', 'table', 'image', 'file', 'audio', 'video', 'synced'])

function actingOn(editor: AnyEditor, id: string): readonly string[] {
  const selected = blockSelection(editor)
  return selected.includes(id) ? selected : [id]
}

function MenuIcon({ icon: Icon }: { readonly icon: LucideIcon }): React.JSX.Element {
  return <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
}

function TurnRow({ icon, title, current }: { readonly icon: LucideIcon | undefined; readonly title: string; readonly current: boolean }): React.JSX.Element {
  return (
    <span className="flex flex-1 items-center gap-2">
      {icon === undefined ? null : <MenuIcon icon={icon} />}
      <span className="flex-1">{title}</span>
      {current ? <Check size={14} /> : null}
    </span>
  )
}

function toggleTableHeader(editor: AnyEditor, id: string, key: 'headerRows' | 'headerCols'): void {
  const table = editor.getBlock(id)
  if (table?.type !== 'table') return
  const content = table.content as { headerRows?: number; headerCols?: number }
  editor.updateBlock(table, { content: { ...content, [key]: content[key] ? undefined : 1 } } as never)
}

function BlockMenu({ block }: { readonly block: TreeBlock }): React.JSX.Element {
  const editor = useBlockNoteEditor() as AnyEditor
  const Components = useComponentsContext()!
  const model = useContext(BlockMenuContext)!
  const ids = actingOn(editor, block.id)
  const targets = model.targets(block)
  const extra = model.extraTarget?.(block) ?? null
  const removal = model.removal(block, ids)
  // A copy syncs its original, so a copy of a copy is one more view of the same block.
  const syncSource = block.type === 'synced' ? String(block.props.sourceId) : SYNCABLE_TYPES.has(block.type) && !isSectionHeading(block) ? block.id : null
  const tableContent = block.type === 'table' ? block.content as { headerRows?: number; headerCols?: number } : null
  const Item = Components.Generic.Menu.Item
  return (
    <Components.Generic.Menu.Dropdown className="bn-menu-dropdown bn-drag-handle-menu dana-block-menu">
      {targets.length > 0 || extra !== null ? (
        <Components.Generic.Menu.Root position="right" sub={true}>
          <Components.Generic.Menu.Trigger sub={true}>
            <Item className="bn-menu-item" subTrigger={true}>
              <span className="flex flex-1 items-center gap-2"><MenuIcon icon={Repeat2} />Turn into</span>
            </Item>
          </Components.Generic.Menu.Trigger>
          <Components.Generic.Menu.Dropdown sub={true} className="bn-menu-dropdown dana-block-menu">
            {targets.map((target) => (
              <Item key={target.key} className="bn-menu-item" onClick={() => { model.turnInto(ids, target) }}>
                <TurnRow icon={kindIconOf(target.type, target.level)} title={target.title} current={isCurrent(block, target)} />
              </Item>
            ))}
            {extra === null ? null : <Item className="bn-menu-item" onClick={extra.run}><TurnRow icon={CheckCircle2} title={extra.title} current={false} /></Item>}
          </Components.Generic.Menu.Dropdown>
        </Components.Generic.Menu.Root>
      ) : null}
      {tableContent !== null ? (
        <Components.Generic.Menu.Root position="right" sub={true}>
          <Components.Generic.Menu.Trigger sub={true}>
            <Item className="bn-menu-item" subTrigger={true}>
              <span className="flex flex-1 items-center gap-2"><MenuIcon icon={Table2} />Table options</span>
            </Item>
          </Components.Generic.Menu.Trigger>
          <Components.Generic.Menu.Dropdown sub={true} className="bn-menu-dropdown dana-block-menu">
            <Item className="bn-menu-item" onClick={() => toggleTableHeader(editor, block.id, 'headerRows')}>
              <span className="flex flex-1 items-center justify-between gap-2">Header row{tableContent.headerRows ? <Check size={14} /> : null}</span>
            </Item>
            <Item className="bn-menu-item" onClick={() => toggleTableHeader(editor, block.id, 'headerCols')}>
              <span className="flex flex-1 items-center justify-between gap-2">Header column{tableContent.headerCols ? <Check size={14} /> : null}</span>
            </Item>
          </Components.Generic.Menu.Dropdown>
        </Components.Generic.Menu.Root>
      ) : null}
      {model.canDuplicate(block) ? (
        <Item className="bn-menu-item" onClick={() => { model.duplicate(ids) }}>
          <span className="flex flex-1 items-center gap-2"><MenuIcon icon={Copy} /><span className="flex-1">Duplicate</span><span className="text-xs text-muted-foreground">{MOD}D</span></span>
        </Item>
      ) : null}
      <Item className="bn-menu-item" onClick={() => { void navigator.clipboard?.writeText(block.type === 'result' ? `${window.location.origin}/app/results/${block.id}` : blockLink(block.id)) }}>
        <span className="flex flex-1 items-center gap-2"><MenuIcon icon={Link2} />Copy link to block</span>
      </Item>
      {syncSource === null || syncSource === '' ? null : (
        <Item className="bn-menu-item" onClick={() => { void navigator.clipboard?.writeText(syncLink(syncSource)) }}>
          <span className="flex flex-1 items-center gap-2"><MenuIcon icon={RefreshCw} />Copy and sync</span>
        </Item>
      )}
      {removal === null ? null : 'note' in removal
        ? <p className="px-2 py-1.5 text-xs text-muted-foreground">{removal.note}</p>
        : <Item className="bn-menu-item dana-menu-danger" onClick={removal.run}><span className="flex flex-1 items-center gap-2"><MenuIcon icon={Trash2} />{removal.label}</span></Item>}
    </Components.Generic.Menu.Dropdown>
  )
}

function DragHandle(): React.JSX.Element | null {
  const Components = useComponentsContext()!
  const editor = useBlockNoteEditor() as AnyEditor
  const model = useContext(BlockMenuContext)!
  const sideMenu = useExtension(SideMenuExtension)
  const block = useExtensionState(SideMenuExtension, { editor, selector: (state) => state?.block })
  if (block === undefined) return null
  return (
    <>
    {model.insertBefore === undefined ? null : <Components.SideMenu.Button
      label="Insert block above"
      className="bn-button dana-insert-before"
      data-focus="self"
      icon={<Plus size={16} />}
      onClick={() => { model.insertBefore?.(block.id) }}
    />}
    <Components.Generic.Menu.Root
      position="left"
      onOpenChange={(open: boolean) => {
        if (open) {
          sideMenu.freezeMenu()
          if (!blockSelection(editor).includes(block.id)) setBlockSelection(editor, [block.id])
        } else sideMenu.unfreezeMenu()
      }}
    >
      <Components.Generic.Menu.Trigger>
        <Components.SideMenu.Button
          label="Drag to move, click for options"
          draggable={true}
          onDragStart={(event) => { sideMenu.blockDragStart(event, block) }}
          onDragEnd={sideMenu.blockDragEnd}
          className="bn-button dana-drag-handle"
          data-focus="self"
          icon={<GripVertical size={16} />}
        />
      </Components.Generic.Menu.Trigger>
      <BlockMenu block={editor.getBlock(block.id) as TreeBlock ?? block as TreeBlock} />
    </Components.Generic.Menu.Root>
    </>
  )
}

function BlockSideMenuRoot({ model }: { readonly model: BlockMenuModel }): React.JSX.Element {
  const Components = useComponentsContext()!
  return (
    <BlockMenuContext.Provider value={model}>
      <Components.SideMenu.Root className={model.insertBefore === undefined ? 'bn-side-menu' : 'bn-side-menu dana-work-side-menu'}>
        <DragHandle />
      </Components.SideMenu.Root>
    </BlockMenuContext.Provider>
  )
}

/** The side menu is transient, so it only reads the canvas's menu model. */
export function BlockSideMenu(): React.JSX.Element {
  const inherited = useContext(BlockMenuContext)!
  return <BlockSideMenuRoot model={inherited} />
}

function firstLineCentre(content: Element): number {
  const inline = content.querySelector('.bn-inline-content, pre code')
  if (inline !== null) {
    const style = getComputedStyle(inline)
    const box = inline.getBoundingClientRect()
    const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.5 || box.height
    return box.top + (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.borderTopWidth) || 0) + lineHeight / 2
  }
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  })
  const text = walker.nextNode()
  if (text !== null && text.parentElement !== null) {
    const range = document.createRange()
    const start = text.textContent!.search(/\S/)
    range.setStart(text, start)
    range.setEnd(text, start + 1)
    const rect = range.getBoundingClientRect()
    if (rect.height > 0) {
      const style = getComputedStyle(text.parentElement)
      const lineHeight = Number.parseFloat(style.lineHeight) || rect.height
      return rect.top - (lineHeight - rect.height) / 2 + lineHeight / 2
    }
  }
  return Number.NaN
}

export const blockSidePosition = {
  useFloatingOptions: {
    middleware: [offset(({ elements, rects }) => {
      const reference = elements.reference
      const element = reference instanceof Element ? reference : reference.contextElement
      const content = element?.querySelector('.bn-block-content') ?? element
      if (content === undefined || content === null) return { mainAxis: 8 }
      const referenceBox = reference.getBoundingClientRect()
      const toggle = content.querySelector('.bn-toggle-button')
      const hasInsert = elements.floating.querySelector('.dana-insert-before') !== null
      const inThread = content.closest('.dana-thread') !== null
      const mainAxis = (toggle ? referenceBox.left - toggle.getBoundingClientRect().left + 4 : 4) - (hasInsert && inThread ? 9 : 0)
      const centre = firstLineCentre(content)
      if (Number.isNaN(centre)) return { mainAxis, crossAxis: 0 }
      return { mainAxis, crossAxis: centre - referenceBox.top - rects.floating.height / 2 }
    })],
  },
}

export function turnBlocksInto(editor: AnyEditor, ids: readonly string[], target: TurnTarget, headingToggles: boolean | undefined | ((block: TreeBlock) => boolean | undefined)): void {
  const picked = blockSelection(editor).length > 0
  editor.transact(() => {
    for (const id of ids) {
      const block = editor.getBlock(id) as TreeBlock | undefined
      if (block === undefined || isCurrent(block, target)) continue
      const { update, lifted } = conversionOf(block, target, typeof headingToggles === 'function' ? headingToggles(block) : headingToggles)
      if (lifted.length === 0) {
        editor.updateBlock(id, update as never)
      } else {
        editor.removeBlocks(lifted.map((child) => child.id))
        editor.updateBlock(id, update as never)
        editor.insertBlocks(lifted as never, id, 'after')
      }
    }
  })
  const first = ids[0]
  if (picked) {
    setBlockSelection(editor, ids)
    editor.focus()
  } else if (first !== undefined && editor.getBlock(first) !== undefined) {
    const block = editor.getBlock(first)!
    if (Array.isArray(block.content) || typeof block.content === 'string') editor.setTextCursorPosition(first, 'end')
    editor.focus()
  }
}

export function duplicateBlocks(editor: AnyEditor, ids: readonly string[]): void {
  const blocks = ids.flatMap((id) => { const block = editor.getBlock(id); return block === undefined ? [] : [block as TreeBlock] })
  if (blocks.length === 0) return
  const picked = blockSelection(editor).length > 0
  let copies: { id: string }[] = []
  editor.transact(() => {
    const last = blocks.at(-1)!
    copies = editor.insertBlocks(blocks.map(withoutIds) as never, last.id, 'after') as { id: string }[]
  })
  if (picked) setBlockSelection(editor, copies.map((copy) => copy.id))
  else if (copies[0] !== undefined) { editor.setTextCursorPosition(copies[0].id, 'end'); editor.focus() }
}
