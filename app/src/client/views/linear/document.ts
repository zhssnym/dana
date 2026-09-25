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

function record(id: string, fields: Partial<CanvasRecord> & Pick<CanvasRecord, 'block_kind'>): CanvasRecord {
  return { id, text: null, rich_content: null, file_id: null, ref_folder_id: null, width_pct: null, checked: null, toggleable: null, ...fields }
}

export function applyEdit(page: PageView, edit: LineEdit): { document: CanvasDocument; createTask?: { id: string; title: string } } {
  const before = documentOf(page)
  const blocks = before.blocks.map((block) => ({ ...block }))
  const items: CanvasPlacement[] = before.items.map((item) => ({ ...item }))
  const kindOf = new Map(blocks.map((block) => [block.id, block.block_kind]))
  const done = (createTask?: { id: string; title: string }) => ({ document: { blocks, items }, ...(createTask ? { createTask } : {}) })

  switch (edit.op) {
    case 'add_step': {
      const id = edit.id ?? crypto.randomUUID()
      const isSection = (item: CanvasPlacement): boolean =>
        item.kind === 'block' && kindOf.get(item.id) === 'section' && item.section_block_id === null
      let at: number
      if (edit.section === null) {
        at = items.findIndex(isSection)
        if (at < 0) at = items.length
      } else {
        const start = items.findIndex((item) => item.kind === 'block' && item.id === edit.section)
        if (start < 0) throw new Error('That milestone is no longer on the page.')
        at = start + 1
        while (at < items.length && !isSection(items[at]!)) at++
      }
      items.splice(at, 0, { kind: 'task', id, section_block_id: edit.section, list_parent_block_id: null })
      return done({ id, title: edit.title })
    }
    case 'add_milestone': {
      const id = crypto.randomUUID()
      blocks.push(record(id, { block_kind: 'section', text: edit.name.trim().slice(0, 120) }))
      items.push({ kind: 'block', id, section_block_id: null, list_parent_block_id: null })
      return done()
    }
  }
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
