/*
Editing a member's Responsibilities goes through plain text and back, so a
save that changed nothing must hand the server the same document: otherwise
opening the editor and pressing Save quietly drops a heading, a nesting level,
a mark or a link from somebody's written scope (#209).
*/
import { describe, expect, it } from 'vitest'

import { responsibilityDocument } from '../../shared/responsibility.js'
import type { ResponsibilityDocument } from '../../shared/responsibility.js'
import { documentToText, textToDocument } from './responsibility-text.js'

const written: ResponsibilityDocument = {
  version: 1,
  blocks: [
    { kind: 'heading', level: 2, content: { version: 1, runs: [{ text: 'Releases' }] } },
    {
      kind: 'paragraph',
      content: {
        version: 1,
        runs: [
          { text: 'Owns the ' },
          { text: 'release notes', bold: true },
          { text: ' and ' },
          { text: 'the checklist', italic: true, href: 'https://example.com/list' },
        ],
      },
    },
    { kind: 'bullet', depth: 0, content: { version: 1, runs: [{ text: 'Tag builds' }] } },
    { kind: 'bullet', depth: 2, content: { version: 1, runs: [{ text: 'Hotfixes', bold: true }] } },
  ],
}

describe('Responsibilities text round trip (#209)', () => {
  it('an unchanged edit saves the document it opened', () => {
    const text = documentToText(written)
    const back = responsibilityDocument.parse(textToDocument(text))
    expect(back).toEqual(responsibilityDocument.parse(written))
  })

  it('typed shorthand becomes headings, nested bullets and paragraphs', () => {
    const doc = textToDocument('# Scope\n\n- one\n    - deep\nplain')
    expect(doc.blocks.map((b) => [b.kind, 'depth' in b ? b.depth : 'level' in b ? b.level : null])).toEqual([
      ['heading', 1],
      ['bullet', 0],
      ['bullet', 2],
      ['paragraph', null],
    ])
  })
})
