// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { CanvasSurfaceSpy } from '../../../../../tests/support/folder-canvas-harness.js'
import { canvasIds, mountCanvas, pageBlock } from '../../../../../tests/support/folder-canvas-harness.js'
import type { PageView } from '../../../../shared/pages.js'
import { CanvasErrorBoundary } from './CanvasErrorBoundary.js'

const surface = vi.hoisted((): CanvasSurfaceSpy => ({ props: null }))

vi.mock('./CanvasSurface.js', () => ({
  CanvasSurface: (props: NonNullable<CanvasSurfaceSpy['props']>) => { surface.props = props; return null },
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  surface.props = null
})

function renderBroken(page: PageView): void {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mountCanvas(page)
}

function expectRecovery(message: string): void {
  expect(screen.getByRole('alert').textContent).toContain('Writing could not be opened')
  expect(screen.getByRole('alert').textContent).toContain(message)
  expect(screen.getByRole('button', { name: 'Reload page' })).toBeDefined()
  expect(surface.props).toBeNull()
}

describe('folder canvas hydration recovery', () => {
  test('an outline entry without its block keeps the page mounted and explains recovery', () => {
    renderBroken({
      revision: 'r1',
      blocks: [],
      items: [{ kind: 'block', id: canvasIds.prose }],
      task_placements: [],
    })

    expectRecovery('The page contains an unavailable block. Reload before editing.')
  })

  test('content grouped under a non-section keeps the page mounted and explains recovery', () => {
    renderBroken({
      revision: 'r1',
      blocks: [
        pageBlock(canvasIds.section, 'paragraph', 'Not a section'),
        pageBlock(canvasIds.prose, 'paragraph', 'Grouped content', { section_block_id: canvasIds.section }),
      ],
      items: [canvasIds.section, canvasIds.prose].map((id) => ({ kind: 'block' as const, id })),
      task_placements: [],
    })

    expectRecovery('The page has an invalid group. Its content has been preserved; reload before editing.')
  })

  test('an unexpected canvas failure does not expose its internal message', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const UnexpectedFailure = (): React.JSX.Element => {
      throw new Error('sentinel-internal-detail')
    }

    render(<CanvasErrorBoundary><UnexpectedFailure /></CanvasErrorBoundary>)

    expect(screen.getByRole('alert').textContent).toContain('The writing canvas could not be opened. Reload the page and try again.')
    expect(screen.getByRole('alert').textContent).not.toContain('sentinel-internal-detail')
  })
})
