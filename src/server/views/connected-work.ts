/*
Connected work: a facet's references from inline Dana Links and from explicit
block edges, de-duplicated by source document and block id. No proximity
inference. Project-local: a link to another project's facet is not a relationship.
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
import type { PageBlock } from '../../shared/pages.js'
import { parseDanaLink } from '../../shared/references.js'
import { idSet, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { backlinksOf } from '../domain/backlinks.js'
import { visibleFolder } from '../domain/folder-access.js'

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

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

function nullableInt(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value)
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString()
}

function nullableIso(value: unknown): string | null {
  return value === null || value === undefined ? null : iso(value)
}

function isFacetHref(href: unknown, facetId: string, origin?: string): boolean {
  if (typeof href !== 'string') return false
  const parsed = parseDanaLink(href, origin)
  return parsed !== null && parsed.id === facetId && (parsed.kind === 'facet' || parsed.kind === 'folder')
}

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

/** Merge rows by source document, then exact source ids inside the row. */
export function mergeFacetBacklinks(...groups: readonly (readonly Backlink[])[]): Backlink[] {
  const merged = new Map<string, Backlink>()
  for (const row of groups.flat()) {
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

/** Exact persisted whole-block sources for this facet, already project-local. */
async function persistedBlockBacklinks(
  executor: Executor,
  viewerId: string,
  facetId: string,
  projectId: string,
): Promise<Backlink[]> {
  const rows = await rowsOf(
    executor,
    sql`SELECT b.id AS block_id,
               CASE WHEN b.task_id IS NULL THEN 'folder' ELSE 'task' END AS home,
               COALESCE(t.id, sf.id) AS home_id,
               COALESCE(t.folder_id, sf.id) AS folder_id,
               COALESCE(t.title, sf.name) AS label
          FROM page_block_facets pbf
          JOIN page_blocks b ON b.id = pbf.block_id
          LEFT JOIN folders sf ON sf.id = b.folder_id
          LEFT JOIN tasks t ON t.id = b.task_id AND t.deleted_at IS NULL
         WHERE pbf.facet_id = ${facetId}::uuid
           AND COALESCE(sf.project_id, t.project_id) = ${projectId}::uuid
           AND COALESCE(t.folder_id, sf.id) IS NOT NULL
           AND ${visibleFolder(sql`COALESCE(t.folder_id, sf.id)`, viewerId)}
         ORDER BY lower(COALESCE(t.title, sf.name)), COALESCE(t.id, sf.id), b.id`,
  )
  const byDocument = new Map<string, Backlink>()
  for (const row of rows) {
    const home = String(row.home) as Backlink['home']
    const homeId = String(row.home_id)
    const folderId = String(row.folder_id)
    const key = `${home}:${homeId}`
    const found = byDocument.get(key)
    if (found === undefined) {
      byDocument.set(key, {
        surface: 'page',
        home,
        home_id: homeId,
        folder_id: folderId,
        member_id: null,
        label: String(row.label),
        block_ids: [String(row.block_id)],
      })
    } else found.block_ids.push(String(row.block_id))
  }
  return [...byDocument.values()]
}

/** Sources carry the canonical block read model, so the facet renders the same block. */
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
    sql`SELECT pb.id, pb.kind, pb.position, pb.page_position,
               pb.section_block_id, pb.list_parent_block_id, pb.toggleable,
               pb.checked, pb.rich_content, pb.text, pb.file_id,
               pb.ref_folder_id, pb.width_pct, pb.updated_at, pb.file_reclaimed_at,
               f.width AS file_width, f.height AS file_height, f.name AS file_name
          FROM page_blocks pb
          LEFT JOIN files f ON f.id = pb.file_id
         WHERE pb.id IN ${idSet(ids)}
           AND (
             (pb.folder_id IS NOT NULL AND ${visibleFolder(sql`pb.folder_id`, viewerId)})
             OR
             (pb.task_id IS NOT NULL AND EXISTS (
               SELECT 1 FROM tasks t
                WHERE t.id = pb.task_id AND t.deleted_at IS NULL
                  AND ${visibleFolder(sql`t.folder_id`, viewerId)}
             ))
           )`,
  )
  for (const row of rows) {
    const fileId = nullableString(row.file_id)
    const fileName = nullableString(row.file_name)
    const files: ConnectedWorkFile[] = fileId === null
      ? []
      : [{ id: fileId, name: fileName ?? 'File' }]
    const block: PageBlock = {
      id: String(row.id),
      kind: String(row.kind) as PageBlock['kind'],
      position: Number(row.position),
      page_position: nullableString(row.page_position),
      section_block_id: nullableString(row.section_block_id),
      list_parent_block_id: nullableString(row.list_parent_block_id),
      toggleable: row.toggleable === null || row.toggleable === undefined ? null : row.toggleable === true,
      checked: row.checked === null || row.checked === undefined ? null : row.checked === true,
      rich_content: row.rich_content as PageBlock['rich_content'],
      text: nullableString(row.text),
      file_id: fileId,
      file_width: nullableInt(row.file_width),
      file_height: nullableInt(row.file_height),
      file_reclaimed_at: nullableIso(row.file_reclaimed_at),
      file_name: fileName,
      ref_folder_id: nullableString(row.ref_folder_id),
      width_pct: nullableInt(row.width_pct),
      updated_at: iso(row.updated_at),
    }
    map.set(block.id, {
      id: block.id,
      kind: 'block',
      block_kind: block.kind,
      text: richPreview(row.rich_content, facetId, origin) ?? clip(row.text) ?? clip(row.file_name),
      files,
      block,
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
          JOIN discussions d ON d.id = c.discussion_id AND d.trashed_at IS NULL
         WHERE c.id IN ${idSet(ids)}
           AND ${visibleFolder(sql`c.folder_id`, viewerId)}`,
  )
  const files = await rowsOf(
    executor,
    sql`SELECT cf.comment_id, f.id, f.name
          FROM comment_files cf
          JOIN files f ON f.id = cf.file_id
          JOIN comments c ON c.id = cf.comment_id
          JOIN discussions d ON d.id = c.discussion_id AND d.trashed_at IS NULL
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
  const target = await rowsOf(
    executor,
    sql`SELECT project_id FROM folders
         WHERE id = ${facetId}::uuid AND kind = 'doc' AND tab_position IS NOT NULL
           AND id <> project_id AND deleted_at IS NULL AND archived_at IS NULL`,
  )
  const projectId = target[0]?.project_id == null ? null : String(target[0].project_id)
  if (projectId === null) return { results: [], truncated: false }
  const localFolders = await rowsOf(
    executor,
    sql`SELECT id FROM folders WHERE project_id = ${projectId}::uuid`,
  )
  const local = new Set(localFolders.map((row) => String(row.id)))

  const [page, facet, explicit] = await Promise.all([
    backlinksOf(executor, viewerId, { kind: 'folder', id: facetId }, origin),
    backlinksOf(executor, viewerId, { kind: 'facet', id: facetId }, origin),
    persistedBlockBacklinks(executor, viewerId, facetId, projectId),
  ])
  /* A cross-project facet link still navigates but is not a relationship;
     shelves have no Work directory. */
  const inlinePage = page.results.filter((row) => row.folder_id !== null && local.has(row.folder_id))
  const inlineFacet = facet.results.filter((row) => row.folder_id !== null && local.has(row.folder_id))
  const merged = mergeFacetBacklinks(inlinePage, inlineFacet, explicit)
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
    block_ids: row.block_ids,
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
