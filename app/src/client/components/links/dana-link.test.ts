/*
AC-988 and AC-989: a Dana Link chip survives a save byte for byte, and the
client never turns a string that is not an in-app path into a chip.

Data loss and an open redirect are the two silent failures this unit could
ship: a chip that saves as nothing (the run dropped, the link gone on the next
keystroke), and a pasted `//evil.example/app/tasks/<id>` drawn as an in-app
chip whose click leaves the product.
*/
import { describe, expect, test } from 'vitest'

import type { PageView } from '../../../shared/pages.js'
import { hydrateCanvas, richRuns } from '../page/canvas/adapters.js'
import type { CanvasBlock } from '../page/canvas/schema.js'
import { danaLinkOf } from './dana-link.js'

const TASK = '6ef63646-498f-4a6d-add2-041265756933'
const FOLDER = '039353c7-910f-4cf3-88a1-abbcb73eed16'

describe('Dana Link chips', () => {
  test('AC-988: a stored Dana Link run hydrates as a chip and projects back to the same runs', () => {
    const runs = [
      { text: 'See ' },
      { text: 'Write press release', href: `/app/tasks/${TASK}` },
      { text: ' and ' },
      { text: 'Research notes', href: `/app/folders/${FOLDER}` },
      { text: 'Research notes', href: `/app/folders/${FOLDER}` },
      { text: ' and ', bold: true },
      { text: 'the site', href: 'https://example.com/x' },
    ]
    const block = { id: '11111111-1111-4111-8111-111111111111', kind: 'paragraph', text: runs.map((r) => r.text).join(''), rich_content: { version: 1, runs }, section_block_id: null, list_parent_block_id: null, file_id: null, ref_folder_id: null, width_pct: null, checked: null }
    const page = { blocks: [block], items: [{ kind: 'block', id: block.id }] } as unknown as PageView
    const [node] = hydrateCanvas(page, 700)
    const content = node!.content as { type: string }[]
    expect(content.map((inline) => inline.type)).toEqual(['text', 'danaLink', 'text', 'danaLink', 'danaLink', 'text', 'link'])
    // The editor's own block shape: a chip carries its href and label as props.
    const editorBlock = { ...node, content: content.map((inline) => inline.type === 'link'
      ? { ...inline, content: (inline as unknown as { content: { text: string }[] }).content.map((t) => ({ type: 'text', text: t.text, styles: {} })) }
      : inline.type === 'text' ? { ...inline, styles: (inline as { styles?: object }).styles ?? {} } : inline) } as unknown as CanvasBlock
    // Two adjacent chips to one target stay two runs, not one merged label.
    expect(richRuns(editorBlock)).toEqual(runs)
  })

  test('AC-989: only an in-app /app/<kind>/<uuid> path is a Dana Link; anything else stays a plain link', () => {
    expect(danaLinkOf(`/app/tasks/${TASK}`)).toMatchObject({ kind: 'task', id: TASK })
    expect(danaLinkOf(`/app/tasks/${TASK}?x=1#y`)).toMatchObject({ kind: 'task', path: `/app/tasks/${TASK}` })
    expect(danaLinkOf(`/app/facets/${TASK}`)).toMatchObject({ kind: 'facet' })
    for (const bad of [
      `//evil.example/app/tasks/${TASK}`,
      `https://evil.example/app/tasks/${TASK}`,
      `javascript:alert(1)//app/tasks/${TASK}`,
      `/app/tasks/not-a-uuid`,
      `/app/widgets/${TASK}`, // a kind this client does not know: a plain link, never an error
      `/x/app/tasks/${TASK}`,
      `/app/tasks/${TASK}/extra`,
    ]) expect(danaLinkOf(bad), bad).toBeNull()
  })
})
