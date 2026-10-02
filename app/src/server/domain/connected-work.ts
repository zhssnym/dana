/*
Connected work (#488) is a richer read over #214's backlinks, not another
relationship store.

The backlink scan decides which documents the viewer may know about and which
exact block/post ids contain a facet link. This module then projects those ids
into small source previews. The projection re-checks source visibility while
reading content so the richer response never weakens #214's access rule.

Both target spellings are read for compatibility: before #489 a project Doc
tab could be inserted as `/app/folders/:id`; current facet chips persist
`/app/facets/:id`. They mean the same facet here and de-duplicate by source
document and source id.
*/
import { sql } from 'drizzle-orm'

import { BACKLINK_LIMIT } from '../../shared/backlinks.js'
import type { Backlink } from '../../shared/backlinks.js'
import { postContent, walkPostBlocks } from '../../shared/comments.js'
import { CONNECTED_WORK_TEXT_MAX } from '../../shared/connected-work.js'
import type {
  ConnectedWorkFile,
  ConnectedWorkItem,
  ConnectedWorkSource,
  GetConnectedWorkResponse,
} from '../../shared/connected-work.js'
import { parseDanaLink } from '../../shared/references.js'
import { idSet, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { backlinksOf } from './backlinks.js'
import { visibleFolder } from './folder-access.js'

function documentKey(row: Backlink): string {
  return `${row.surface}:${row.home}:${row.home_id}:${row.member_id ?? ''}`
}

function clip(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).replace(/\s+/g, ' ').trim()
  if (text === '') return null
  const chars = Array.from(text)
  return chars.length <= CONNECTED_WORK_TEXT_MAX
    ? text
    : `${chars.slice(0, CONNECTED_WORK_TEXT_MAX - 1).join('').trimEnd()}…`
}

function isFacetHref(href: unknown, facetId: string, origin?: string): boolean {
  if (typeof href !== 'string') return false
  const parsed = parseDanaLink(href, origin)
  return parsed !== null && parsed.id === facetId && (parsed.kind === 'facet' || parsed.kind === 'folder')
}

/** The words in one rich-content value except the facet chip itself. */
function richPreview(content: unknown, facetId: string, origin?: string): string | null {
  if (content === null || typeof content !== 'object') return null
  const runs = 'runs' in content ? (content as { runs?: unknown }).runs : undefined
  if (!Array.isArray(runs)) return null
  const words = runs.flatMap((run) => {
    if (run === null || typeof run !== 'object') return []
    const record = run as { text?: unknown; href?: unknown }
    if (typeof record.text !== 'string' || isFacetHref(record.href, facetId, origin)) return []
    return [record.text]
  }).join('')
  return clip(words)
}

/** A Discussion post's words, excluding only the facet chip(s) that created
 * this Connected work edge. Other links and authored words stay visible. */
function postPreview(content: unknown, facetId: string, origin?: string): string | null {
  const parsed = postContent.safeParse(content)
  if (!parsed.success) return null
  const lines: string[] = []
  walkPostBlocks(parsed.data.blocks, (block) => {
    if (block.rich_content !== undefined) {
      const words = block.rich_content.runs
        .filter((run) => !isFacetHref(run.href, facetId, origin))
        .map((run) => run.text)
        .join('')
        .trim()
      if (words !== '') lines.push(words)
      return
    }
    const words = block.text?.trim() ?? ''
    if (words !== '') lines.push(words)
  })
  return clip(lines.join('\n'))
}

/** Merge the historical Page spelling and the canonical Facet spelling. */
export function mergeFacetBacklinks(
  pageRows: readonly Backlink[],
  facetRows: readonly Backlink[],
): Backlink[] {
  const merged = new Map<string, Backlink>()
  for (const row of [...pageRows, ...facetRows]) {
    const key = documentKey(row)
    const existing = merged.get(key)
    if (existing === undefined) {
      merged.set(key, { ...row, block_ids: [...row.block_ids] })
      continue
    }
    const ids = new Set(existing.block_ids)
    for (const id of row.block_ids) {
      if (!ids.has(id)) {
        existing.block_ids.push(id)
        ids.add(id)
      }
    }
  }
  return [...merged.values()].sort(
    (a, b) =>
      a.label.toLowerCase().localeCompare(b.label.toLowerCase()) ||
      a.home_id.localeCompare(b.home_id) ||
      (a.member_id ?? '').localeCompare(b.member_id ?? ''),
  )
}

async function blockSources(
  executor: Executor,
  viewerId: string,
  ids: readonly string[],
  facetId: string,
  origin?: string,
): Promise<Map<string, ConnectedWorkSource>> {
  const map = new Map<string, ConnectedWorkSource>()
  if (ids.length === 0) return map
  const rows = await rowsOf(
    executor,
    sql`SELECT pb.id, pb.kind, pb.rich_content, pb.file_id, f.name AS file_name
          FROM page_blocks pb
          LEFT JOIN files f ON f.id = pb.file_id
         WHERE pb.id IN ${idSet(ids)}
           AND (
             (pb.folder_id IS NOT NULL AND ${visibleFolder(sql`pb.folder_id`, viewerId)})
             OR
             (pb.shelf_id IS NOT NULL AND EXISTS (
               SELECT 1 FROM shelves s
                WHERE s.id = pb.shelf_id AND s.user_id = ${viewerId}
             ))
             OR
             (pb.task_id IS NOT NULL AND EXISTS (
               SELECT 1 FROM tasks t
                WHERE t.id = pb.task_id AND t.deleted_at IS NULL
                  AND ${visibleFolder(sql`t.folder_id`, viewerId)}
             ))
           )`,
  )
  for (const row of rows) {
    const fileId = row.file_id === null || row.file_id === undefined ? null : String(row.file_id)
    const files: ConnectedWorkFile[] = fileId === null
      ? []
      : [{ id: fileId, name: row.file_name === null || row.file_name === undefined ? 'File' : String(row.file_name) }]
    map.set(String(row.id), {
      id: String(row.id),
      kind: 'block',
      block_kind: String(row.kind),
      text: richPreview(row.rich_content, facetId, origin),
      files,
    })
  }
  return map
}

async function postSources(
  executor: Executor,
  viewerId: string,
  ids: readonly string[],
  facetId: string,
  origin?: string,
): Promise<Map<string, ConnectedWorkSource>> {
  const map = new Map<string, ConnectedWorkSource>()
  if (ids.length === 0) return map
  const rows = await rowsOf(
    executor,
    sql`SELECT c.id, c.content
          FROM comments c
          JOIN discussions d
            ON d.id = c.discussion_id AND d.trashed_at IS NULL
         WHERE c.id IN ${idSet(ids)}
           AND ${visibleFolder(sql`c.folder_id`, viewerId)}`,
  )
  const files = await rowsOf(
    executor,
    sql`SELECT cf.comment_id, f.id, f.name
          FROM comment_files cf
          JOIN files f ON f.id = cf.file_id
          JOIN comments c ON c.id = cf.comment_id
          JOIN discussions d
            ON d.id = c.discussion_id AND d.trashed_at IS NULL
         WHERE cf.comment_id IN ${idSet(ids)}
           AND ${visibleFolder(sql`c.folder_id`, viewerId)}
         ORDER BY cf.created_at ASC, cf.file_id ASC`,
  )
  const filesByPost = new Map<string, ConnectedWorkFile[]>()
  for (const row of files) {
    const postId = String(row.comment_id)
    const list = filesByPost.get(postId) ?? []
    list.push({ id: String(row.id), name: String(row.name) })
    filesByPost.set(postId, list)
  }
  for (const row of rows) {
    const id = String(row.id)
    map.set(id, {
      id,
      kind: 'post',
      block_kind: null,
      text: postPreview(row.content, facetId, origin),
      files: filesByPost.get(id) ?? [],
    })
  }
  return map
}

export async function connectedWorkOf(
  executor: Executor,
  viewerId: string,
  facetId: string,
  origin?: string,
): Promise<GetConnectedWorkResponse> {
  const [page, facet] = await Promise.all([
    backlinksOf(executor, viewerId, { kind: 'folder', id: facetId }, origin),
    backlinksOf(executor, viewerId, { kind: 'facet', id: facetId }, origin),
  ])
  const merged = mergeFacetBacklinks(page.results, facet.results)
  const shown = merged.slice(0, BACKLINK_LIMIT)
  const blockIds = [...new Set(shown.filter((row) => row.surface === 'page').flatMap((row) => row.block_ids))]
  const postIds = [...new Set(shown.filter((row) => row.surface === 'post').flatMap((row) => row.block_ids))]
  const [blocks, posts] = await Promise.all([
    blockSources(executor, viewerId, blockIds, facetId, origin),
    postSources(executor, viewerId, postIds, facetId, origin),
  ])

  const results: ConnectedWorkItem[] = shown.map((row) => ({
    surface: row.surface,
    home: row.home,
    home_id: row.home_id,
    folder_id: row.folder_id,
    member_id: row.member_id,
    label: row.label,
    sources: row.block_ids.flatMap((id) => {
      const source = row.surface === 'post' ? posts.get(id) : blocks.get(id)
      return source === undefined ? [] : [source]
    }),
  }))

  return {
    results,
    truncated: page.truncated || facet.truncated || merged.length > BACKLINK_LIMIT,
  }
}
