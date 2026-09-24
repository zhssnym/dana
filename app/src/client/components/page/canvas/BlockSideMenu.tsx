/*
The block gutter every Dana canvas shares (Folder Work, Purpose, Results, the
Shelf, a Task's body): "+" and ⋮⋮ on hover, level with the block's first line
of text; clicking ⋮⋮ selects the block (the tint of `block-selection.ts`) and
opens its menu: Turn into ›, Duplicate, Copy link to block, Delete. Moving is
by dragging the handle, or Tab / Shift-Tab.

What each surface allows (which kinds, what Delete means for a Task or a
Shelf's Folder row) comes in through `BlockMenuModel`.
*/
import { createContext, useContext } from 'react'
import { offset } from '@floating-ui/react'
import type { BlockNoteEditor } from '@blocknote/core'
import { SideMenuExtension, SuggestionMenu } from '@blocknote/core/extensions'
import { useBlockNoteEditor, useComponentsContext, useExtension, useExtensionState } from '@blocknote/react'
import { blockLink, blockSelection, setBlockSelection } from './block-selection.js'
import { conversionOf, isCurrent, withoutIds } from './turn-into.js'
import type { TreeBlock, TurnTarget } from './turn-into.js'
import { Check, Copy, GripVertical, Link2, Plus, Repeat2, Trash2 } from '../../../lib/icons.js'
import type { LucideIcon } from '../../../lib/icons.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- both canvas schemas pass through here
export type AnyEditor = BlockNoteEditor<any, any, any>

export interface BlockMenuModel {
  /** The kinds this block may become here, already checked against the surface's rules. */
  readonly targets: (block: TreeBlock) => readonly TurnTarget[]
  readonly turnInto: (ids: readonly string[], target: TurnTarget) => void
  /** An extra "Turn into" row after the kinds (the Folder canvas's Task). */
  readonly extraTarget?: (block: TreeBlock) => { title: string; run: () => void } | null
  readonly canDuplicate: (block: TreeBlock) => boolean
  readonly duplicate: (ids: readonly string[]) => void
  /** Delete's row: a label and act, a quiet note instead, or nothing. */
  readonly removal: (block: TreeBlock, ids: readonly string[]) => { label: string; run: () => void } | { note: string } | null
}

/** The page's theme: `data-theme` (lib/theme.ts), or a `dark` class. */
export function pageTheme(): 'dark' | 'light' {
  const root = document.documentElement
  return root.getAttribute('data-theme') === 'dark' || root.classList.contains('dark') ? 'dark' : 'light'
}

export const BlockMenuContext = createContext<BlockMenuModel | null>(null)

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'

/** The ids a menu act applies to: the whole block selection when this block is in it. */
function actingOn(editor: AnyEditor, id: string): readonly string[] {
  const selected = blockSelection(editor)
  return selected.includes(id) ? selected : [id]
}

/** A row's icon, drawn as the page "…" menu draws its own (`object-menu.tsx`). */
function MenuIcon({ icon: Icon }: { readonly icon: LucideIcon }): React.JSX.Element {
  return <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
}

function BlockMenu({ block }: { readonly block: TreeBlock }): React.JSX.Element {
  const editor = useBlockNoteEditor() as AnyEditor
  const Components = useComponentsContext()!
  const model = useContext(BlockMenuContext)!
  const ids = actingOn(editor, block.id)
  const targets = model.targets(block)
  const extra = model.extraTarget?.(block) ?? null
  const removal = model.removal(block, ids)
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
                <span className="flex flex-1 items-center justify-between gap-6">{target.title}{isCurrent(block, target) ? <Check size={14} /> : null}</span>
              </Item>
            ))}
            {extra === null ? null : <Item className="bn-menu-item" onClick={extra.run}><span>{extra.title}</span></Item>}
          </Components.Generic.Menu.Dropdown>
        </Components.Generic.Menu.Root>
      ) : null}
      {model.canDuplicate(block) ? (
        <Item className="bn-menu-item" onClick={() => { model.duplicate(ids) }}>
          <span className="flex flex-1 items-center gap-2"><MenuIcon icon={Copy} /><span className="flex-1">Duplicate</span><span className="text-xs text-muted-foreground">{MOD}D</span></span>
        </Item>
      ) : null}
      <Item className="bn-menu-item" onClick={() => { void navigator.clipboard?.writeText(blockLink(block.id)) }}>
        <span className="flex flex-1 items-center gap-2"><MenuIcon icon={Link2} />Copy link to block</span>
      </Item>
      {removal === null ? null : 'note' in removal
        ? <p className="px-2 py-1.5 text-xs text-muted-foreground">{removal.note}</p>
        : <Item className="bn-menu-item" onClick={removal.run}><span className="flex flex-1 items-center gap-2"><MenuIcon icon={Trash2} />{removal.label}</span></Item>}
    </Components.Generic.Menu.Dropdown>
  )
}

function AddButton(): React.JSX.Element | null {
  const Components = useComponentsContext()!
  const editor = useBlockNoteEditor() as AnyEditor
  const suggestions = useExtension(SuggestionMenu)
  const block = useExtensionState(SideMenuExtension, { editor, selector: (state) => state?.block })
  if (block === undefined) return null
  return (
    <Components.SideMenu.Button
      className="bn-button"
      label="Add a block below"
      icon={<Plus size={16} />}
      onClick={() => {
        const empty = Array.isArray(block.content) && block.content.length === 0
        const target = empty ? block : editor.insertBlocks([{ type: 'paragraph' }], block, 'after')[0]!
        editor.setTextCursorPosition(target)
        suggestions.openSuggestionMenu('/')
      }}
    />
  )
}

function DragHandle(): React.JSX.Element | null {
  const Components = useComponentsContext()!
  const editor = useBlockNoteEditor() as AnyEditor
  const sideMenu = useExtension(SideMenuExtension)
  const block = useExtensionState(SideMenuExtension, { editor, selector: (state) => state?.block })
  if (block === undefined) return null
  return (
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
          icon={<GripVertical size={16} />}
        />
      </Components.Generic.Menu.Trigger>
      <BlockMenu block={editor.getBlock(block.id) as TreeBlock ?? block as TreeBlock} />
    </Components.Generic.Menu.Root>
  )
}

export function BlockSideMenu(): React.JSX.Element {
  const Components = useComponentsContext()!
  return (
    <Components.SideMenu.Root className="bn-side-menu">
      <AddButton />
      <DragHandle />
    </Components.SideMenu.Root>
  )
}

/*
The gutter sits level with the block's first line of text, whatever the block:
a text block's first line box, the first character of a custom row (a Task, a
Folder row, a diagram's caption), or the top of one that has no text (an
image). Horizontal: clear of a heading's fold arrow.
*/
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
      // The glyph box sits inside its line box: centre on the line, not the glyph.
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
      const mainAxis = toggle ? referenceBox.left - toggle.getBoundingClientRect().left + 4 : 4
      const centre = firstLineCentre(content)
      if (Number.isNaN(centre)) return { mainAxis, crossAxis: 0 }
      return { mainAxis, crossAxis: centre - referenceBox.top - rects.floating.height / 2 }
    })],
  },
}

/** Change these blocks' kind, keeping text, and children where the kind holds them. */
/** `headingToggles` may answer per block: on Work a heading is a Section only where one stands. */
export function turnBlocksInto(editor: AnyEditor, ids: readonly string[], target: TurnTarget, headingToggles: boolean | undefined | ((block: TreeBlock) => boolean | undefined)): void {
  // Picked blocks stay picked once turned (Notion); a block turned while writing keeps the caret.
  const picked = blockSelection(editor).length > 0
  editor.transact(() => {
    for (const id of ids) {
      const block = editor.getBlock(id) as TreeBlock | undefined
      if (block === undefined || isCurrent(block, target)) continue
      const { update, lifted } = conversionOf(block, target, typeof headingToggles === 'function' ? headingToggles(block) : headingToggles)
      if (lifted.length === 0) {
        editor.updateBlock(id, update as never)
      } else {
        // Upstream ignores `children: []`, so the lifted children leave first (e3).
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

/** Put a fresh copy of each block (and its children) right after it. */
export function duplicateBlocks(editor: AnyEditor, ids: readonly string[]): void {
  const blocks = ids.flatMap((id) => { const block = editor.getBlock(id); return block === undefined ? [] : [block as TreeBlock] })
  if (blocks.length === 0) return
  const picked = blockSelection(editor).length > 0
  let copies: { id: string }[] = []
  editor.transact(() => {
    const last = blocks.at(-1)!
    // A run of selected blocks copies as one run after the last of them;
    // one block copies right after itself.
    copies = editor.insertBlocks(blocks.map(withoutIds) as never, last.id, 'after') as { id: string }[]
  })
  if (picked) setBlockSelection(editor, copies.map((copy) => copy.id))
  else if (copies[0] !== undefined) { editor.setTextCursorPosition(copies[0].id, 'end'); editor.focus() }
}
