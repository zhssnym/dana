// @vitest-environment jsdom
/*
AC-1008, the canvas half: a stored diagram hydrates to a Diagram block and
dehydrates back to the same record (a projection that dropped the source would
lose the diagram on the next save), and its labels are drawn as text, never as
markup (#222).
*/
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import type { PageView } from '../../../../shared/pages.js'
import { dehydrateCanvas, hydrateCanvas } from './adapters.js'
import { DiagramPicture } from './CanvasDiagram.js'
import type { CanvasBlock } from './schema.js'

afterEach(cleanup)

const SOURCE = 'flowchart LR\nIdea -> Draft: send\n<img src=x onerror=alert(1)> -> Draft'
const ID = '11111111-1111-4111-8111-111111111111'

describe('AC-1008 a diagram round-trips as its source (canvas)', () => {
  test('hydrate then dehydrate keeps kind and source', () => {
    const page = {
      blocks: [{ id: ID, kind: 'diagram', position: 0, page_position: 'a', section_block_id: null, list_parent_block_id: null, checked: null, rich_content: null, text: SOURCE, file_id: null, file_width: null, file_height: null, ref_folder_id: null, width_pct: null, updated_at: '2026-09-24T00:00:00.000Z' }],
      items: [{ kind: 'block', id: ID }],
    } as unknown as PageView
    const hydrated = hydrateCanvas(page, 600)
    expect(hydrated).toEqual([{ id: ID, type: 'diagram', props: { source: SOURCE }, children: [] }])
    expect(dehydrateCanvas(hydrated as unknown as CanvasBlock[], 600, new Map()).blocks).toEqual([
      { id: ID, block_kind: 'diagram', text: SOURCE, rich_content: null, file_id: null, ref_folder_id: null, width_pct: null, checked: null, toggleable: null },
    ])
  })

  test('labels are text, not markup', () => {
    const { container } = render(<DiagramPicture source={SOURCE} />)
    expect(container.querySelector('img')).toBeNull()
    expect([...container.querySelectorAll('svg text')].map((t) => t.textContent)).toContain('<img src=x onerror=alert(1)>')
  })
})
