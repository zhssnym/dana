/*
A member's Responsibilities document (#209, #230) as the plain text its editor
shows, and back.

The editor is one textarea, so the document's whole vocabulary has a way to be
typed: "# " to "### " for a heading, "- " for a bullet (two spaces before it
per level, three levels), anything else a paragraph; **bold**, _italic_ and
[text](link) inside a line. Blank lines separate nothing and are dropped.

A mention has no spelling here, so a mention run comes back as its plain text.
Nothing on the client writes a mention into this document today.
*/
import type { RichContent } from '../../shared/rich-content.js'
import {
  MAX_RESPONSIBILITY_BULLET_DEPTH,
  RESPONSIBILITY_DOCUMENT_VERSION,
} from '../../shared/responsibility.js'
import type { ResponsibilityDocument } from '../../shared/responsibility.js'

type Run = RichContent['runs'][number]

function runText(run: Run): string {
  let text = run.text.replace(/\n/g, ' ')
  if (run.href !== undefined) text = `[${text}](${run.href})`
  if (run.italic === true) text = `_${text}_`
  if (run.bold === true) text = `**${text}**`
  return text
}

function lineOf(content: RichContent): string {
  return content.runs.map(runText).join('')
}

export function documentToText(doc: ResponsibilityDocument | null): string {
  if (doc === null) return ''
  return doc.blocks
    .map((block) => {
      const line = lineOf(block.content)
      if (block.kind === 'heading') return `${'#'.repeat(block.level)} ${line}`
      if (block.kind === 'bullet') return `${'  '.repeat(block.depth)}- ${line}`
      return line
    })
    .join('\n')
}

/* Bold outside, then italic, then a link, which is the order runText writes. */
const INLINE = /\*\*(.+?)\*\*|_(.+?)_|\[([^\]]+)\]\(([^)\s]+)\)/g

function runsOf(
  text: string,
  marks: { bold?: true; italic?: true } = {},
): Run[] {
  const runs: Run[] = []
  let at = 0
  for (const match of text.matchAll(INLINE)) {
    const index = match.index
    if (index > at) runs.push({ text: text.slice(at, index), ...marks })
    const [, bold, italic, label, href] = match
    if (bold !== undefined) runs.push(...runsOf(bold, { ...marks, bold: true }))
    else if (italic !== undefined) runs.push(...runsOf(italic, { ...marks, italic: true }))
    else if (label !== undefined && href !== undefined)
      runs.push({ text: label, ...marks, href })
    at = index + match[0].length
  }
  if (at < text.length) runs.push({ text: text.slice(at), ...marks })
  return runs
}

function contentOf(text: string): RichContent {
  return { version: 1, runs: runsOf(text) }
}

export function textToDocument(text: string): ResponsibilityDocument {
  const blocks: ResponsibilityDocument['blocks'] = []
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue
    const heading = /^\s*(#{1,3})\s+(.*)$/.exec(raw)
    const bullet = /^( *)[-*]\s+(.*)$/.exec(raw)
    if (heading !== null) {
      blocks.push({
        kind: 'heading',
        level: (heading[1] ?? '#').length,
        content: contentOf((heading[2] ?? '').trim()),
      })
    } else if (bullet !== null) {
      const depth = Math.min(
        Math.floor((bullet[1] ?? '').length / 2),
        MAX_RESPONSIBILITY_BULLET_DEPTH,
      )
      blocks.push({ kind: 'bullet', depth, content: contentOf((bullet[2] ?? '').trim()) })
    } else {
      blocks.push({ kind: 'paragraph', content: contentOf(raw.trim()) })
    }
  }
  return { version: RESPONSIBILITY_DOCUMENT_VERSION, blocks }
}
