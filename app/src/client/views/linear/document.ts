/*
The Linear view's reading and writing of the Work document (r10). A task starts
a step; every other block after it, up to the next task or section, is that
step's content; a section block is a milestone. Writes splice the document
from `documentOf(page)` and send one `document_transaction`, as the canvas does.
*/
import { useCallback, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { PageBlock, PageView } from '../../../shared/pages.js'
import { getPageResponse, type GetPageResponse } from '../../../shared/pages.js'
import { canvasOperations, documentOf, type CanvasDocument, type CanvasPlacement, type CanvasRecord } from '../../components/page/canvas/adapters.js'
import { ApiError, getPlain, mutateApi } from '../../api/http.js'
import { queryKeys } from '../../api/keys.js'

export interface LineDoc {
  /** Blocks before any step or section. */
  readonly intro: readonly PageBlock[]
  /** A task id → the blocks after it until the next task or section, in document order (list children included, flat). */
  readonly contentOf: ReadonlyMap<string, readonly PageBlock[]>
  /** A section id → blocks after the section before its first task. */
  readonly leadOf: ReadonlyMap<string, readonly PageBlock[]>
}

export function segment(page: PageView): LineDoc {
  const records = new Map(page.blocks.map((block) => [block.id, block]))
  const intro: PageBlock[] = []
  const contentOf = new Map<string, PageBlock[]>()
  const leadOf = new Map<string, PageBlock[]>()
  let current: PageBlock[] = intro
  for (const item of page.items) {
    if (item.kind === 'task') {
      current = []
      contentOf.set(item.id, current)
      continue
    }
    const block = records.get(item.id)
    if (!block) continue
    if (block.kind === 'section') {
      current = []
      leadOf.set(block.id, current)
      continue
    }
    current.push(block)
  }
  return { intro, contentOf, leadOf }
}

export type NewBlock = { kind: 'text'; text: string } | { kind: 'link'; url: string; text?: string } | { kind: 'image'; fileId: string }
export type LineEdit =
  | { op: 'add_step'; title: string }
  | { op: 'add_block'; after: string | null; block: NewBlock }
  | { op: 'add_milestone'; name: string }
  | { op: 'edit_text'; id: string; text: string }
  | { op: 'remove_block'; id: string }

function record(id: string, fields: Partial<CanvasRecord> & Pick<CanvasRecord, 'block_kind'>): CanvasRecord {
  return { id, text: null, rich_content: null, file_id: null, ref_folder_id: null, width_pct: null, checked: null, toggleable: null, ...fields }
}

function recordOf(id: string, block: NewBlock): CanvasRecord {
  if (block.kind === 'image') return record(id, { block_kind: 'image', file_id: block.fileId })
  if (block.kind === 'text') return record(id, { block_kind: 'paragraph', text: block.text })
  const text = block.text?.trim() || block.url
  return record(id, { block_kind: 'paragraph', text, rich_content: { version: 1, runs: [{ text, href: block.url }] } })
}

/** The section an item appended at the end of the document belongs to. */
function endSection(doc: CanvasDocument): string | null {
  const last = doc.items.at(-1)
  if (!last) return null
  const kinds = new Map(doc.blocks.map((block) => [block.id, block.block_kind]))
  return last.kind === 'block' && kinds.get(last.id) === 'section' ? last.id : last.section_block_id
}

export function applyEdit(page: PageView, edit: LineEdit): { document: CanvasDocument; createTask?: { id: string; title: string } } {
  const before = documentOf(page)
  const blocks = before.blocks.map((block) => ({ ...block }))
  const items: CanvasPlacement[] = before.items.map((item) => ({ ...item }))
  const kindOf = new Map(blocks.map((block) => [block.id, block.block_kind]))
  const done = (createTask?: { id: string; title: string }) => ({ document: { blocks, items }, ...(createTask ? { createTask } : {}) })

  switch (edit.op) {
    case 'add_step': {
      const id = crypto.randomUUID()
      items.push({ kind: 'task', id, section_block_id: endSection(before), list_parent_block_id: null })
      return done({ id, title: edit.title })
    }
    case 'add_milestone': {
      const id = crypto.randomUUID()
      blocks.push(record(id, { block_kind: 'section', text: edit.name.trim().slice(0, 120) }))
      items.push({ kind: 'block', id, section_block_id: null, list_parent_block_id: null })
      return done()
    }
    case 'add_block': {
      const id = crypto.randomUUID()
      blocks.push(recordOf(id, edit.block))
      if (edit.after === null) {
        items.push({ kind: 'block', id, section_block_id: endSection(before), list_parent_block_id: null })
        return done()
      }
      const start = items.findIndex((item) => item.kind === 'task' && item.id === edit.after)
      if (start < 0) throw new Error('That step is no longer on the page.')
      let end = start + 1
      while (end < items.length && items[end]!.kind === 'block' && kindOf.get(items[end]!.id) !== 'section') end++
      items.splice(end, 0, { kind: 'block', id, section_block_id: items[start]!.section_block_id, list_parent_block_id: null })
      return done()
    }
    case 'edit_text': {
      const block = blocks.find((candidate) => candidate.id === edit.id)
      if (!block) throw new Error('That note is no longer on the page.')
      const href = block.rich_content?.runs.length === 1 ? block.rich_content.runs[0]!.href : undefined
      block.text = edit.text
      block.rich_content = href !== undefined ? { version: 1, runs: [{ text: edit.text, href }] } : null
      return done()
    }
    case 'remove_block': {
      const index = blocks.findIndex((candidate) => candidate.id === edit.id)
      if (index < 0) return done()
      blocks.splice(index, 1)
      const at = items.findIndex((item) => item.kind === 'block' && item.id === edit.id)
      const removed = at >= 0 ? items.splice(at, 1)[0]! : null
      // Children keep a parent that exists: they move up to the removed block's.
      for (const item of items) {
        if (item.list_parent_block_id === edit.id) item.list_parent_block_id = removed?.list_parent_block_id ?? null
        if (item.section_block_id === edit.id) item.section_block_id = removed?.section_block_id ?? null
      }
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
