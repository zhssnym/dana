/*
A post's content (`shared/comments.ts` `postContent`) and the editor's blocks,
both ways. The editor is the page canvas's own schema less its pages-only
blocks (`PostEditor.tsx`), so the rich-text half is the canvas adapter's
`richRuns` / `contentOf` exactly, and only the block kinds are mapped here.

A media block names its file by the served URL (`/api/v1/files/<id>`), which
is what the canvas upload answers; the post names the id, and the same id
must ride in the request's `file_ids` (the server refuses anything else).
*/
import { plainContentToString } from '@blocknote/core'

import { postFileIds, postPlainText } from '../../../shared/comments.js'
import type { CommentFile, PostBlock, PostBlockKind, PostContent } from '../../../shared/comments.js'
import { contentOf, richRuns } from '../page/canvas/adapters.js'
import type { CanvasBlock } from '../page/canvas/schema.js'

/** The editor block, loosely: the post schema is a subset of the canvas's. */
export interface LooseBlock {
  readonly id: string
  readonly type: string
  readonly props?: Record<string, unknown>
  readonly content?: unknown
  readonly children?: readonly LooseBlock[]
}

/** An editor block to insert: the shape `replaceBlocks` / `initialContent` take. */
export interface EditorInput {
  type: string
  props?: Record<string, unknown>
  content?: unknown
  children?: EditorInput[]
}

export const fileUrl = (id: string): string => `/api/v1/files/${id}`
export const fileIdOfUrl = (url: string): string | null =>
  /(?:^|\/)api\/v1\/files\/([0-9a-f-]{36})$/i.exec(url)?.[1] ?? null

const RICH: Readonly<Record<string, PostBlockKind>> = {
  paragraph: 'paragraph',
  bulletListItem: 'bullet',
  numberedListItem: 'numbered',
  checkListItem: 'checklist',
  toggleListItem: 'toggle',
  quote: 'quote',
  callout: 'callout',
}
const MEDIA = new Set(['image', 'file', 'audio', 'video'])

/** The editor's blocks as a post's blocks. Throws when a media block points
 * somewhere other than a Dana file (a pasted outside URL). */
export function postBlocksOf(blocks: readonly LooseBlock[]): PostBlock[] {
  const out: PostBlock[] = []
  for (const block of blocks) {
    const children = postBlocksOf(block.children ?? [])
    const kids = children.length > 0 ? { children } : {}
    if (MEDIA.has(block.type)) {
      const url = typeof block.props?.url === 'string' ? block.props.url : ''
      if (url === '') {
        out.push(...children)
        continue
      }
      const id = fileIdOfUrl(url)
      if (id === null) throw new Error('Upload this file to Dana before posting. Links to files elsewhere are not supported.')
      out.push({ kind: block.type as PostBlockKind, file_id: id, ...kids })
      continue
    }
    if (block.type === 'codeBlock') {
      const text = plainContentToString(block.content as never)
      out.push({ kind: 'code', text: text.slice(0, 4000), ...kids })
      continue
    }
    if (block.type === 'divider') {
      out.push({ kind: 'divider', ...kids })
      continue
    }
    const runs = richRuns(block as unknown as CanvasBlock)
    const rich = { rich_content: { version: 1 as const, runs } }
    if (block.type === 'heading') {
      const level = Math.min(3, Math.max(1, Number(block.props?.level ?? 1)))
      out.push({ kind: `heading${String(level)}` as PostBlockKind, ...rich, ...kids })
      continue
    }
    if (block.type === 'checkListItem') {
      out.push({ kind: 'checklist', checked: block.props?.checked === true, ...rich, ...kids })
      continue
    }
    out.push({ kind: RICH[block.type] ?? 'paragraph', ...rich, ...kids })
  }
  return out
}

function blank(block: PostBlock): boolean {
  return block.kind === 'paragraph' && (block.children?.length ?? 0) === 0 &&
    (block.rich_content?.runs ?? []).every((run) => run.text.trim() === '')
}

/** The post the editor holds, empty paragraphs at either end trimmed; null
 * when it says nothing (no words, no file, no divider). */
export function postContentOf(blocks: readonly LooseBlock[]): PostContent | null {
  const all = postBlocksOf(blocks)
  let start = 0
  let end = all.length
  while (start < end && blank(all[start]!)) start += 1
  while (end > start && blank(all[end - 1]!)) end -= 1
  const trimmed = all.slice(start, end)
  const content: PostContent = { version: 1, blocks: trimmed }
  if (postPlainText(content) === '' && postFileIds(content).length === 0) return null
  return content
}

/** A post's blocks as editor blocks, for editing it in place. */
export function editorBlocksOf(blocks: readonly PostBlock[], files: readonly CommentFile[] = []): EditorInput[] {
  const names = new Map(files.map((file) => [file.id, file.name]))
  const visit = (list: readonly PostBlock[]): EditorInput[] =>
    list.map((block): EditorInput => {
      const children = block.children ? visit(block.children) : []
      const content = contentOf(null, block.rich_content ?? null)
      switch (block.kind) {
        case 'heading1': case 'heading2': case 'heading3':
          return { type: 'heading', props: { level: Number(block.kind.slice(-1)), isToggleable: false }, content, children }
        case 'bullet': return { type: 'bulletListItem', content, children }
        case 'numbered': return { type: 'numberedListItem', content, children }
        case 'checklist': return { type: 'checkListItem', props: { checked: block.checked === true }, content, children }
        case 'toggle': return { type: 'toggleListItem', content, children }
        case 'quote': return { type: 'quote', content, children }
        case 'callout': return { type: 'callout', content, children }
        case 'code': return { type: 'codeBlock', content: block.text ?? '', children }
        case 'divider': return { type: 'divider', children }
        case 'image': case 'audio': case 'video':
          return { type: block.kind, props: { url: fileUrl(block.file_id ?? '') }, children }
        case 'file':
          return { type: 'file', props: { url: fileUrl(block.file_id ?? ''), name: names.get(block.file_id ?? '') ?? 'File' }, children }
        default: return { type: 'paragraph', content, children }
      }
    })
  return visit(blocks)
}

/** A post written before posts: its plain body, one paragraph per line. */
export function editorBlocksOfBody(body: string | null): EditorInput[] {
  return (body ?? '').split('\n').map((line) => ({ type: 'paragraph', content: line }))
}
