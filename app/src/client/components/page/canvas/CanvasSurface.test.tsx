// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { CanvasBlock, CanvasEditor } from './schema.js'

const state = vi.hoisted(() => ({ editor: null as unknown as CanvasEditor, selectedId: '' }))

vi.mock('@blocknote/shadcn', () => ({
  BlockNoteView: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@blocknote/react', () => ({
  FormattingToolbarController: () => null,
  FilePanelController: () => null,
  SuggestionMenuController: () => null,
  SideMenuController: ({ sideMenu: Menu }: { sideMenu: () => React.JSX.Element }) => <Menu />,
  useBlockNoteEditor: () => state.editor,
  // The block menu drawn flat: every menu and submenu open, each item a button.
  useComponentsContext: () => ({
    SideMenu: {
      Root: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
      Button: ({ label, onClick }: { label: string; onClick?: () => void }) => <button onClick={onClick}>{label}</button>,
    },
    Generic: { Menu: {
      Root: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
      Trigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
      Dropdown: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
      Item: ({ children, onClick, subTrigger }: { children?: React.ReactNode; onClick?: () => void; subTrigger?: boolean }) => subTrigger ? <span>{children}</span> : <button onClick={onClick}>{children}</button>,
    } },
  }),
  useExtension: () => ({ freezeMenu: () => {}, unfreezeMenu: () => {}, openSuggestionMenu: () => {} }),
  useExtensionState: () => ({ id: state.selectedId }),
  getDefaultReactSlashMenuItems: () => [],
}))
vi.mock('@blocknote/core/extensions', () => ({
  filterSuggestionItems: (items: unknown[]) => items,
  SideMenuExtension: {},
  SuggestionMenu: {},
}))
vi.mock('./CanvasFormattingToolbar.js', () => ({ CanvasFormattingToolbar: () => null }))
vi.mock('./CanvasMarquee.js', () => ({ CanvasMarquee: () => null }))
vi.mock('./CanvasTask.js', () => ({ useCanvasTaskDelete: () => null }))
vi.mock('./slash-items.js', async (importOriginal) => ({ ...(await importOriginal<object>()), CanvasSlashMenu: () => null }))
vi.mock('./guard.js', () => ({ installCanvasGuard: () => () => {} }))
vi.mock('./commands.js', () => ({
  bindTaskCommand: () => () => {},
  headingOneContext: () => undefined,
  insertCanvasHeading: () => {},
  removeCanvasBlocks: () => {},
}))

import { CanvasSurface } from './CanvasSurface.js'
import { bindCanvasSurface } from './markdown.js'

afterEach(cleanup)

function paragraph(id: string, text: string): CanvasBlock {
  return {
    id,
    type: 'paragraph',
    props: { textAlignment: 'left', textColor: 'default', backgroundColor: 'default' },
    content: [{ type: 'text', text, styles: {} }],
    children: [],
  }
}

function draw(block: CanvasBlock, folderRefs: ReadonlyMap<string, string>, onCreateTask: (block?: CanvasBlock) => void, headingMode?: 'section' | 'document'): void {
  state.selectedId = block.id
  state.editor = {
    document: [block],
    getBlock: (id: string) => id === block.id ? block : undefined,
    getTextCursorPosition: () => ({ block }),
    onSelectionChange: () => () => {},
    onChange: () => () => {},
    schema: { blockSchema: Object.fromEntries(['paragraph', 'heading', 'checkListItem', 'toggleListItem', 'bulletListItem', 'numberedListItem', 'quote', 'callout', 'codeBlock'].map((type) => [type, {}])) },
  } as unknown as CanvasEditor
  // The slash menu binds the surface in the app; it is stubbed here.
  bindCanvasSurface(state.editor, headingMode === 'document' ? 'document' : 'work')
  render(<CanvasSurface editor={state.editor} onChange={() => {}} onCreateTask={onCreateTask} folderRefs={folderRefs} onUploadFile={() => Promise.reject(new Error("no uploads here"))} onNotice={() => {}} headingMode={headingMode} />)
}

describe('Turn into › Task from the canvas block menu', () => {
  test('a folder reference explains both removals and waits for confirmation', async () => {
    const reference = paragraph('reference', 'The studio archive')
    const onCreateTask = vi.fn()
    draw(reference, new Map([[reference.id, '00000000-0000-4000-8000-000000000001']]), onCreateTask)

    fireEvent.click(screen.getByRole('button', { name: 'Task' }))

    const warning = screen.getByRole('alertdialog')
    expect(within(warning).getByText('Turn this folder link into a task?')).toBeTruthy()
    expect(within(warning).getByText('The link to the folder is removed, and a task is made with the link text as its title.')).toBeTruthy()
    expect(onCreateTask).not.toHaveBeenCalled()

    fireEvent.click(within(warning).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => { expect(screen.queryByRole('alertdialog')).toBeNull() })
    expect(onCreateTask).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Task' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Turn into task' }))
    expect(onCreateTask).toHaveBeenCalledTimes(1)
    expect(onCreateTask).toHaveBeenCalledWith(reference)
  })

  test('an ordinary paragraph converts immediately without a warning', () => {
    const prose = paragraph('prose', 'Write the studio brief')
    const onCreateTask = vi.fn()
    draw(prose, new Map(), onCreateTask)

    fireEvent.click(screen.getByRole('button', { name: 'Task' }))

    expect(onCreateTask).toHaveBeenCalledWith(prose)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})

describe('the block menu', () => {
  test('offers Turn into, Duplicate, Copy link and Delete, and no Move items', () => {
    draw(paragraph('prose', 'Words'), new Map(), vi.fn())
    const names = screen.getAllByRole('button').map((button) => button.textContent)
    expect(names).toEqual(expect.arrayContaining(['Text', 'Heading 1', 'Bulleted list', 'Task', 'Copy link to block', 'Delete']))
    expect(names.some((name) => name?.startsWith('Duplicate'))).toBe(true)
    expect(names.filter((name) => /Move|Remove heading|Continue after/.test(name ?? ''))).toEqual([])
    // A root paragraph cannot become Heading 2: the outline would refuse it.
    expect(names).not.toContain('Heading 2')
    // Work's headings are Sections, which fold already: no toggle heading here.
    expect(names.filter((name) => name?.startsWith('Toggle heading'))).toEqual([])
  })

  test('a document page offers the three toggle headings beside the flat ones', () => {
    draw(paragraph('prose', 'Words'), new Map(), vi.fn(), 'document')
    const names = screen.getAllByRole('button').map((button) => button.textContent)
    expect(names).toEqual(expect.arrayContaining(['Heading 2', 'Toggle heading 1', 'Toggle heading 2', 'Toggle heading 3']))
  })
})
