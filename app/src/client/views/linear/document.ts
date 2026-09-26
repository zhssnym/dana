/*
The Linear view's writing of the Work document: a new task (in a milestone or
outside every milestone) and a new milestone (a section block).
Writes splice the document from `documentOf(page)` and send one
`document_transaction`, as the canvas does.
*/
import { useCallback, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { PageView } from '../../../shared/pages.js'
import { getPageResponse, type GetPageResponse } from '../../../shared/pages.js'
import { canvasOperations, documentOf, type CanvasDocument, type CanvasPlacement, type CanvasRecord } from '../../components/page/canvas/adapters.js'
import { ApiError, getPlain, mutateApi } from '../../api/http.js'
import { queryKeys } from '../../api/keys.js'

export type LineEdit =
  /* `section`: into that milestone, at its end; null: outside every
     milestone, before the first. */
  | { op: 'add_step'; title: string; section: string | null; id?: string }
  | { op: 'add_milestone'; name: string }
  /* An existing task moves: in front of `before` (and into its milestone), or
     with `before` null to `section`'s end (null: outside every milestone,
     before the first). The list's drag and its bulk Milestone. */
  | { op: 'move_step'; id: string; section: string | null; before: string | null }

function record(id: string, fields: Partial<CanvasRecord> & Pick<CanvasRecord, 'block_kind'>): CanvasRecord {
  return { id, text: null, rich_content: null, file_id: null, ref_folder_id: null, width_pct: null, checked: null, toggleable: null, ...fields }
}

export function applyEdit(page: PageView, edit: LineEdit): { document: CanvasDocument; createTask?: { id: string; title: string } } {
  const before = documentOf(page)
  const blocks = before.blocks.map((block) => ({ ...block }))
  const items: CanvasPlacement[] = before.items.map((item) => ({ ...item }))
  const kindOf = new Map(blocks.map((block) => [block.id, block.block_kind]))
  const done = (createTask?: { id: string; title: string }) => ({ document: { blocks, items }, ...(createTask ? { createTask } : {}) })

  const isSection = (item: CanvasPlacement): boolean =>
    item.kind === 'block' && kindOf.get(item.id) === 'section' && item.section_block_id === null
  /* Where a milestone's end is: in front of the next milestone, or the page's
     end; outside every milestone is in front of the first one. */
  const endOf = (section: string | null): number => {
    if (section === null) {
      const first = items.findIndex(isSection)
      return first < 0 ? items.length : first
    }
    const start = items.findIndex((item) => item.kind === 'block' && item.id === section)
    if (start < 0) throw new Error('That section is no longer on the page.')
    let at = start + 1
    while (at < items.length && !isSection(items[at]!)) at++
    return at
  }

  switch (edit.op) {
    case 'add_step': {
      const id = edit.id ?? crypto.randomUUID()
      items.splice(endOf(edit.section), 0, { kind: 'task', id, section_block_id: edit.section, list_parent_block_id: null })
      return done({ id, title: edit.title })
    }
    case 'move_step': {
      const from = items.findIndex((item) => item.kind === 'task' && item.id === edit.id)
      if (from < 0) throw new Error('That task is no longer on the page.')
      const [moving] = items.splice(from, 1)
      const target = edit.before === null ? -1 : items.findIndex((item) => item.kind === 'task' && item.id === edit.before)
      if (target >= 0) {
        const next = items[target]!
        items.splice(target, 0, { ...moving!, section_block_id: next.section_block_id, list_parent_block_id: next.list_parent_block_id })
      } else {
        items.splice(endOf(edit.section), 0, { ...moving!, section_block_id: edit.section, list_parent_block_id: null })
      }
      return done()
    }
    case 'add_milestone': {
      const id = crypto.randomUUID()
      blocks.push(record(id, { block_kind: 'section', text: edit.name.trim().slice(0, 120) }))
      items.push({ kind: 'block', id, section_block_id: null, list_parent_block_id: null })
      return done()
    }
  }
}

/** Where a task stands now, as a `move_step` would put it back: in front of
    the next task of its milestone, or at that milestone's end. Undo reads it
    before a move. */
export function placementOf(page: PageView, id: string): { section: string | null; before: string | null } {
  const { blocks, items } = documentOf(page)
  const sectionIds = new Set(blocks.filter((block) => block.block_kind === 'section').map((block) => block.id))
  const at = items.findIndex((item) => item.kind === 'task' && item.id === id)
  const self = items[at]
  if (self === undefined) return { section: null, before: null }
  for (let i = at + 1; i < items.length; i++) {
    const item = items[i]!
    if (item.kind === 'block' && item.section_block_id === null && sectionIds.has(item.id)) break
    if (item.kind === 'task' && item.section_block_id === self.section_block_id) return { section: self.section_block_id, before: item.id }
  }
  return { section: self.section_block_id, before: null }
}

function operationsOf(page: PageView, edit: LineEdit) {
  const { document, createTask } = applyEdit(page, edit)
  const operations = canvasOperations(documentOf(page), document)
  return createTask ? [{ op: 'create_task' as const, ...createTask }, ...operations] : operations
}

export function useLineWriter(folderId: string): { write: (edit: LineEdit) => Promise<void>; pending: boolean } {
  const queryClient = useQueryClient()
  const queue = useRef<Promise<void>>(Promise.resolve())
  const mutation = useMutation({
    mutationFn: async (edit: LineEdit): Promise<GetPageResponse> => {
      const key = queryKeys.folderPage(folderId)
      const send = (page: PageView) => mutateApi(getPageResponse, {
        method: 'POST',
        path: `/folders/${folderId}/page/actions`,
        body: { action: 'document_transaction', mutation_id: crypto.randomUUID(), base_revision: page.revision, operations: operationsOf(page, edit) },
      })
      const fetchPage = () => queryClient.fetchQuery({ queryKey: key, queryFn: () => getPlain(getPageResponse, `/folders/${folderId}/page`), staleTime: 0 })
      const page = queryClient.getQueryData<GetPageResponse>(key) ?? await fetchPage()
      try {
        return await send(page)
      } catch (error) {
        // A stale base: re-read the page, re-apply the same edit, try once more.
        if (!(error instanceof ApiError) || error.status !== 409) throw error
        return send(await fetchPage())
      }
    },
    onSuccess: (response) => { queryClient.setQueryData(queryKeys.folderPage(folderId), response) },
  })
  const { mutateAsync } = mutation
  const write = useCallback((edit: LineEdit) => {
    // Serialized: each write computes against the page the previous one left.
    const next = queue.current.catch(() => undefined).then(async () => { await mutateAsync(edit) })
    queue.current = next
    return next
  }, [mutateAsync])
  return { write, pending: mutation.isPending }
}
