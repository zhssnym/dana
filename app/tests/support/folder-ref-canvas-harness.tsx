/*
The harness for AC-660, AC-661 and AC-662: a folder page carrying a
`folder_ref` block, driven through `FolderCanvas` itself.

**Why this mounts the component rather than calling the adapters.** The whole
of issue #255 lives in the composition. `canvasOperations` has carried a kind
the editor cannot express since #219, and `adapters.test.ts` has a green unit
case for it, but that case hands `before` the true kinds while the real caller
builds `before` with `dehydrateCanvas`, so the branch can never fire from the
component (issue #250 found the same thing about its own half and wrote it into
that file). A proof that calls the adapters with a document it built itself
would reproduce exactly that mistake: it would pass over a carry that the
running application never reaches. So these criteria mount the component, let
it build its own baseline from its own props, drive its own editor, and read
what it puts on the wire.

**Two things are doubled and neither is under test.** `CanvasSurface` is
replaced by a spy that captures the editor and the change callback, because
what these criteria are about is what a keystroke *saves* and not what
ProseMirror draws, and mounting the view under jsdom would be a second thing
able to fail. And `mutateApi` is replaced, so that each criterion decides for
itself what the transaction is sent to: AC-661 reads it off the wire and never
needs a server, while AC-660 and AC-662 hand it to `actOnFolderPage` against a
real database, which is the route's own composition and the only thing that can
say the relation was *stored*.

**A duplicate that is deliberate and should not outlive both branches.**
`backend/250-canvas-save-path` carries `tests/support/folder-canvas-harness.tsx`,
which is this idea with more in it, and that branch was open while this one was.
Two branches editing one support file collide in a way that is expensive to
read; two support files are one obvious deletion. Whoever integrates the two
should keep that one, move AC-660 to AC-662 onto it, and delete this file.

Spec 4.17, 7.16, 12.9. Issue #255.
*/
import { act, render, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { expect } from 'vitest'

import FolderCanvas from '../../src/client/components/page/canvas/FolderCanvas.js'
import type { CanvasEditor } from '../../src/client/components/page/canvas/schema.js'
import { queryKeys } from '../../src/client/api/keys.js'
import type { RowActions } from '../../src/client/parts/useRowActions.js'
import type { RowContext } from '../../src/client/parts/presenters.js'
import type { DocumentTransaction } from '../../src/shared/page-document.js'
import type { PageBlock, PageView } from '../../src/shared/pages.js'

/** What the spy standing in for `CanvasSurface` captures from its props. */
export interface CanvasSurfaceSpy {
  props: { editor: CanvasEditor; onChange: (editor: CanvasEditor) => void } | null
}
/** What the spy standing in for `mutateApi` records and answers. */
export interface CanvasApiSpy {
  sent: DocumentTransaction[]
  page: PageView
}

export function pageBlock(id: string, kind: PageBlock['kind'], text: string | null, extra: Partial<PageBlock> = {}): PageBlock {
  return {
    id, kind, position: 0, page_position: null, section_block_id: null, list_parent_block_id: null,
    checked: null, rich_content: null, text, file_id: null, file_width: null, file_height: null,
    ref_folder_id: null, width_pct: null, updated_at: '2026-09-20T00:00:00.000Z', ...extra,
  }
}

const noop = (): void => {}
const rowContext: RowContext = { today: '2026-09-20', viewerId: null, folders: [] }
const rowActions: RowActions = {
  onToggleComplete: noop, onToggleImportant: noop, onRestore: noop, onRemoveFromMyDay: noop,
  onAbandon: noop, onOpenTask: noop, onDelete: noop, onDeleteMany: noop, onMoveToColumn: noop,
  starTooltipMode: 'inward',
}

/**
 * `FolderPage` in the one respect that matters here: the page it hands down is
 * the `useQuery` row the canvas writes back into on every save. Without it the
 * component's reconciliation effect reads its prop a revision behind the writer
 * and remounts the editor on a stale page.
 */
function Host({ initialPage, folderId }: { readonly initialPage: PageView; readonly folderId: string }): React.JSX.Element {
  const page = useQuery({
    queryKey: queryKeys.folderPage(folderId),
    queryFn: () => initialPage,
    initialData: initialPage,
    staleTime: Infinity,
  })
  return <FolderCanvas page={page.data} folderId={folderId} tasks={[]} context={rowContext} actions={rowActions} onAsk={noop} arrangeable />
}

export function mountCanvas(initialPage: PageView, folderId: string): HTMLElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><Host initialPage={initialPage} folderId={folderId} /></QueryClientProvider>).container
}

/**
 * The canvas back at rest, read from the region the person reads.
 *
 * `editAndSave` returns as soon as the request has been *made*, which is the
 * only moment it can capture the body; a save that lands in a database is many
 * awaits later than that, so a criterion that reads a row straight afterwards
 * reads it before the write. This waits for what `CanvasWriter` tells the
 * person — "Saved" — which is the same event, said where a failure says
 * something legible instead of timing out on a row that never changed.
 */
export async function settled(container: HTMLElement): Promise<void> {
  await waitFor(() => { expect(within(container).getByRole('status').textContent).toBe('Saved') }, { timeout: 10_000 })
}

/**
 * One edit and the save it triggers, read off the wire.
 *
 * The change callback is the one `CanvasSurface` calls on every editor change,
 * so this drives the component the way a person's keystroke does; the 450 ms
 * debounce and the request are the component's own.
 */
export async function editAndSave(surface: CanvasSurfaceSpy, api: CanvasApiSpy, edit: (editor: CanvasEditor) => void): Promise<DocumentTransaction> {
  const before = api.sent.length
  const captured = surface.props
  if (captured === null) throw new Error('CanvasSurface was never rendered; the canvas did not mount.')
  await act(async () => { edit(captured.editor); captured.onChange(captured.editor) })
  await waitFor(() => { expect(api.sent.length).toBe(before + 1) }, { timeout: 10_000 })
  await act(async () => { await Promise.resolve() })
  const sent = api.sent[before]
  if (sent === undefined) throw new Error('No transaction was sent.')
  return sent
}

/** The one edit these criteria drive: the block's content, replaced whole. */
export function typeInto(id: string, text: string): (editor: CanvasEditor) => void {
  return (editor) => { editor.updateBlock(id, { content: [{ type: 'text', text, styles: {} }] }) }
}
