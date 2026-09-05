// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, test } from 'vitest'
import { MemoryRouter } from 'react-router'

import { ComposerExplorationPage } from './ComposerExplorationPage.js'

afterEach(cleanup)

function renderCanvas(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ComposerExplorationPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('whole-page compose-first canvas', () => {
  test('keeps idle writing positions out of the page layout', () => {
    renderCanvas()

    expect(screen.queryByText('Do or write something…')).toBeNull()
    expect(screen.queryByText('Make this a task')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Write here' })).toHaveLength(6)
  })

  test('writes between native task rows and transforms the sentence in place', () => {
    renderCanvas()

    const firstTask = screen.getByText('Confirm the launch narrative')
      .closest('[data-canvas-node-id]')
    expect(firstTask).not.toBeNull()

    fireEvent.click(within(firstTask as HTMLElement).getByRole('button', { name: 'Write here' }))

    const editor = screen.getByRole('textbox', { name: 'Page paragraph' })
    expect(editor.getAttribute('data-placeholder')).toBe('Do or write something…')
    expect(screen.getByText('Make this a task')).toBeDefined()

    fireEvent.input(editor, { target: { innerText: 'Send the final launch brief' } })
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })

    expect(screen.getByText('Send the final launch brief')).toBeDefined()
    expect(screen.queryByRole('textbox', { name: 'Page paragraph' })).toBeNull()
    expect(screen.queryByText('Make this a task')).toBeNull()
  })

  test('keeps a pristine writing position alive while its structure menu is open', async () => {
    renderCanvas()

    const firstTask = screen.getByText('Confirm the launch narrative')
      .closest('[data-canvas-node-id]')
    expect(firstTask).not.toBeNull()

    fireEvent.click(within(firstTask as HTMLElement).getByRole('button', { name: 'Insert into page' }))

    await waitFor(() => expect(screen.getByText('Add here')).toBeDefined())
    expect(screen.getByText('Task')).toBeDefined()
    expect(screen.getByText('Section')).toBeDefined()
    expect(screen.getByText('Image')).toBeDefined()
    expect(screen.getByRole('textbox', { name: 'Page paragraph' })).toBeDefined()
  })

  test('a collapsed section inserts after its hidden span in the loose folder hierarchy', async () => {
    renderCanvas()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse section Next actions' }))
    expect(screen.queryByText('Confirm the launch narrative')).toBeNull()

    const section = screen.getByRole('heading', { name: 'Next actions' })
      .closest('[data-canvas-node-id]')
    expect(section).not.toBeNull()
    fireEvent.click(within(section as HTMLElement).getByRole('button', { name: 'Insert into page' }))

    await waitFor(() => expect(screen.getByText('Add to No section')).toBeDefined())
    expect(screen.getByRole('textbox', { name: 'Page paragraph' })).toBeDefined()
  })
})
