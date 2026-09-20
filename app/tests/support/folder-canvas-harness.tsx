/*
The harness for AC-464, AC-465 and AC-466: the folder canvas save path driven
through `FolderCanvas` itself.

**Why this renders the component rather than calling the adapters.** The #219
losslessness guard shipped with a unit test beside it that hand-built the
`before` document with the true kinds, and passed. The real caller built that
document with `dehydrateCanvas`, which knows three kinds and no nesting, so the
guard could never fire and the page was flattened on every save with a green
suite. The defect lived in the *composition*, so the proof has to be composed:
these criteria mount the component, let it build its own baseline from its own
props, drive its own editor, and read what it puts on the wire. Rebuilding that
composition here would reproduce the mistake exactly.

Two things are doubled and neither is the behaviour under test. `CanvasSurface`
is replaced by a spy that captures the editor and the change callback, because
the visual editor is not what these criteria are about and mounting ProseMirror
under jsdom would be a second thing able to fail. And the API is replaced by
`applyTransaction` below, which is a deliberately small stand-in for
`applyDocument`: it records what was sent and answers the page that results, so
a transaction that loses something answers a page that has lost it, exactly as
the server would.

**What that stand-in cannot do is refuse**, and the distinction is worth
reading before trusting a green here. It writes whatever it is handed, and
`refusalOf` below runs only the zod half of the contract, so these three
criteria prove that nothing is *lost* on the way to the server and say nothing
about whether the server would take it. Issue #250's review found two canvas
gestures that produced an outline `applyDocument` answers 422 to while all
three of them stayed green. AC-580 is the half that was missing: it drives the
component the same way and sends the result through `actOnFolderPage` against a
real database, which is the route's own composition.
*/
import { act, render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { expect } from 'vitest'

import FolderCanvas from '../../src/client/components/page/canvas/FolderCanvas.js'
import type { CanvasEditor } from '../../src/client/components/page/canvas/schema.js'
import { queryKeys } from '../../src/client/api/keys.js'
import type { RowActions } from '../../src/client/parts/useRowActions.js'
import type { RowContext } from '../../src/client/parts/presenters.js'
import { documentTransaction } from '../../src/shared/page-document.js'
import type { DocumentTransaction } from '../../src/shared/page-document.js'
import type { PageBlock, PageView } from '../../src/shared/pages.js'

/** What the spy standing in for `CanvasSurface` captures from its props. */
export interface CanvasSurfaceSpy {
  props: { editor: CanvasEditor; onChange: (editor: CanvasEditor) => void } | null
}
/** What the spy standing in for `api/http.js` records and answers. */
export interface CanvasApiSpy {
  sent: DocumentTransaction[]
  page: PageView
  revision: number
}

const FOLDER = '00000000-0000-4000-8000-00000000f01d'
const id = (suffix: string): string => `00000000-0000-4000-8000-0000000000${suffix}`

export const canvasIds = {
  folder: FOLDER,
  section: id('a1'),
  prose: id('a2'),
  bullet: id('a3'),
  tick: id('a4'),
  code: id('a5'),
} as const

function block(blockId: string, kind: PageBlock['kind'], text: string | null, extra: Partial<PageBlock> = {}): PageBlock {
  return {
    id: blockId, kind, position: 0, page_position: null, section_block_id: null, list_parent_block_id: null,
    checked: null, rich_content: null, text, file_id: null, file_width: null, file_height: null,
    ref_folder_id: null, width_pct: null, updated_at: '2026-09-20T00:00:00.000Z', ...extra,
  }
}

/**
 * One folder page carrying everything this editor cannot draw: a checklist
 * item nested under a bullet inside a Section, a ticked one, and a `code`
 * block, which is the kind the contract refuses rich content on.
 *
 * `rich_content` is set on the list items and absent from the code block,
 * which is how the server stores them: `RICH_TEXT_BLOCK_KINDS` admits the
 * three list kinds and excludes `code`.
 */
export function structuredPage(): PageView {
  const runs = (text: string): PageBlock['rich_content'] => ({ version: 1, runs: [{ text }] })
  return {
    revision: 'r1',
    blocks: [
      block(canvasIds.section, 'section', 'Shopping', { rich_content: runs('Shopping') }),
      block(canvasIds.prose, 'paragraph', 'Before we go', { section_block_id: canvasIds.section, rich_content: runs('Before we go') }),
      block(canvasIds.bullet, 'bullet', 'Groceries', { section_block_id: canvasIds.section, rich_content: runs('Groceries') }),
      block(canvasIds.tick, 'checklist', 'Milk', { section_block_id: canvasIds.section, list_parent_block_id: canvasIds.bullet, checked: true, rich_content: runs('Milk') }),
      block(canvasIds.code, 'code', 'npm run gate', { section_block_id: canvasIds.section }),
    ],
    items: [canvasIds.section, canvasIds.prose, canvasIds.bullet, canvasIds.tick, canvasIds.code].map((each) => ({ kind: 'block' as const, id: each })),
    task_placements: [],
  }
}

/**
 * A page the way the endpoint that predates `document_transaction` writes one:
 * `text` and no `rich_content` at all. `insert_block` in `actOnFolderPage`
 * names eight columns and `rich_content` is not among them, so every block
 * written that way — and every block written before #219 — is this shape.
 *
 * It is here because it is the input that separates a baseline reconciling the
 * server's page with the editor's projection from one that is either alone:
 * `dehydrateCanvas` puts runs on every non-image block, so `documentOf` and the
 * projection disagree about this block while agreeing about every block in
 * `structuredPage` above. AC-581 is what reads it.
 */
export function legacyPage(): PageView {
  return {
    revision: 'r1',
    blocks: [
      block(canvasIds.section, 'section', 'Shopping'),
      block(canvasIds.prose, 'paragraph', 'Before we go', { section_block_id: canvasIds.section }),
    ],
    items: [canvasIds.section, canvasIds.prose].map((each) => ({ kind: 'block' as const, id: each })),
    task_placements: [],
  }
}

/**
 * `applyDocument` in miniature: what the page looks like after a transaction.
 * Deliberately literal — it writes exactly what it was sent — so that a save
 * which drops a kind, a tick or a list parent answers a page without it.
 */
export function applyTransaction(page: PageView, body: DocumentTransaction, revision: string): PageView {
  const blocks = new Map(page.blocks.map((each) => [each.id, each]))
  for (const operation of body.operations) {
    if (operation.op === 'delete_block') blocks.delete(operation.id)
    else if (operation.op === 'put_block') {
      const existing = blocks.get(operation.id) ?? block(operation.id, operation.block_kind, null)
      blocks.set(operation.id, {
        ...existing, kind: operation.block_kind, text: operation.text, rich_content: operation.rich_content,
        file_id: operation.file_id, ref_folder_id: operation.ref_folder_id, width_pct: operation.width_pct,
        checked: operation.checked,
      })
    }
  }
  const outline = body.operations.find((operation) => operation.op === 'set_outline')
  if (outline === undefined) throw new Error('A document transaction carries exactly one outline.')
  for (const item of outline.items) {
    const stored = blocks.get(item.id)
    if (stored !== undefined) blocks.set(item.id, { ...stored, section_block_id: item.section_block_id, list_parent_block_id: item.list_parent_block_id })
  }
  return {
    revision,
    blocks: outline.items.flatMap((item) => { const stored = blocks.get(item.id); return item.kind === 'block' && stored !== undefined ? [stored] : [] }),
    items: outline.items.map((item) => ({ kind: item.kind, id: item.id })),
    task_placements: outline.items.flatMap((item) => item.kind === 'task' ? [{ id: item.id, section_block_id: item.section_block_id }] : []),
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
 * The parent `FolderPage` is, in the one respect that matters here: the page
 * it hands down is the `useQuery` row that `onSaved` writes back. Without it
 * the component's own reconciliation effect sees its prop a revision behind
 * the writer after the first save and remounts the editor on the stale page,
 * which would make a second save unmeasurable.
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

/**
 * The folder id is a parameter because AC-580 mounts on a folder that exists in
 * a real database rather than on this file's fixture id; it defaults to the
 * fixture so that the criteria written before it read unchanged. The container
 * is returned for the same reason: that criterion reads the save status region.
 */
export function mountCanvas(initialPage: PageView, folderId: string = FOLDER): HTMLElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><Host initialPage={initialPage} folderId={folderId} /></QueryClientProvider>).container
}

/**
 * One edit and the save it triggers, read off the wire.
 *
 * The change callback is the one `CanvasSurface` calls on every editor change,
 * so this drives the component the way the editor does; the 450 ms debounce
 * and the request are the component's own.
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

/**
 * What `documentTransaction` refuses, and nothing else.
 *
 * This is the zod layer the route parses a body with, so a transaction this
 * accepts is one that reaches `applyDocument` — it is not one `applyDocument`
 * accepts. That function states seven further refusals no schema can see,
 * because each of them reads the outline as a whole: unknown or repeated
 * identities, a Section parent that does not precede its content, heading depth,
 * the three list-nesting rules, and the outline retaining every block. Two of
 * those were reachable from this editor and answered 422 with the page unmoved
 * (issue #250), so **an empty array from this function is not a save that
 * works**. AC-580 is the criterion that asks the other question, and it asks it
 * by running `actOnFolderPage` against a database rather than by restating a
 * rule here.
 */
export function refusalOf(body: DocumentTransaction): string[] {
  const parsed = documentTransaction.safeParse(body)
  return parsed.success ? [] : parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
}

export function blockOf(page: PageView, blockId: string): PageBlock {
  const found = page.blocks.find((each) => each.id === blockId)
  if (found === undefined) throw new Error(`The page no longer carries ${blockId}.`)
  return found
}
