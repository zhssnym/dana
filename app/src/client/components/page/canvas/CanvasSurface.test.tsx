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
  SideMenu: ({ dragHandleMenu: Menu }: { dragHandleMenu: () => React.JSX.Element }) => <Menu />,
  DragHandleMenu: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  RemoveBlockItem: ({ children }: { children?: React.ReactNode }) => <button>{children}</button>,
  useBlockNoteEditor: () => state.editor,
  useComponentsContext: () => ({
    Generic: { Menu: { Item: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button> } },
  }),
  useExtensionState: () => ({ id: state.selectedId }),
  getDefaultReactSlashMenuItems: () => [],
}))
vi.mock('@blocknote/core/extensions', () => ({
  filterSuggestionItems: (items: unknown[]) => items,
  SideMenuExtension: {},
}))
vi.mock('./CanvasFormattingToolbar.js', () => ({ CanvasFormattingToolbar: () => null }))
vi.mock('./CanvasMarquee.js', () => ({ CanvasMarquee: () => null }))
vi.mock('./guard.js', () => ({ installCanvasGuard: () => () => {} }))
vi.mock('./commands.js', () => ({
  ancestorsOf: () => [],
  bindTaskCommand: () => () => {},
  continueAfterGroup: () => {},
  headingOneContext: () => undefined,
  insertCanvasHeading: () => {},
  moveCanvasBlock: () => null,
  removeHeadingKeepingContent: () => {},
}))

import { CanvasSurface } from './CanvasSurface.js'

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

function draw(block: CanvasBlock, folderRefs: ReadonlyMap<string, string>, onCreateTask: (block?: CanvasBlock) => void): void {
  state.selectedId = block.id
  state.editor = {
    document: [block],
    getBlock: (id: string) => id === block.id ? block : undefined,
    getTextCursorPosition: () => ({ block }),
  } as unknown as CanvasEditor
  render(<CanvasSurface editor={state.editor} onChange={() => {}} onCreateTask={onCreateTask} folderRefs={folderRefs} onUploadFile={() => Promise.reject(new Error("no uploads here"))} />)
}

describe('Turn into task from the canvas block menu', () => {
  test('a folder reference explains both removals and waits for confirmation', async () => {
    const reference = paragraph('reference', 'The studio archive')
    const onCreateTask = vi.fn()
    draw(reference, new Map([[reference.id, '00000000-0000-4000-8000-000000000001']]), onCreateTask)

    fireEvent.click(screen.getByRole('button', { name: 'Turn into task' }))

    const warning = screen.getByRole('alertdialog')
    expect(within(warning).getByText('Turn this folder link into a task?')).toBeTruthy()
    expect(within(warning).getByText('The link to the folder is removed, and a task is made with the link text as its title.')).toBeTruthy()
    expect(onCreateTask).not.toHaveBeenCalled()

    fireEvent.click(within(warning).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => { expect(screen.queryByRole('alertdialog')).toBeNull() })
    expect(onCreateTask).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Turn into task' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Turn into task' }))
    expect(onCreateTask).toHaveBeenCalledTimes(1)
    expect(onCreateTask).toHaveBeenCalledWith(reference)
  })

  test('an ordinary paragraph converts immediately without a warning', () => {
    const prose = paragraph('prose', 'Write the studio brief')
    const onCreateTask = vi.fn()
    draw(prose, new Map(), onCreateTask)

    fireEvent.click(screen.getByRole('button', { name: 'Turn into task' }))

    expect(onCreateTask).toHaveBeenCalledWith(prose)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})
