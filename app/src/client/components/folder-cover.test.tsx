// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { FolderCoverPicker } from './folder-cover.js'

const api = vi.hoisted(() => ({ getPlain: vi.fn() }))

vi.mock('../api/http.js', () => ({ getPlain: api.getPlain }))

beforeEach(() => {
  api.getPlain.mockReset()
  api.getPlain.mockResolvedValue({
    results: [
      {
        id: 'photo-1',
        title: 'Quiet lake',
        creator: 'A photographer',
        thumb: '/api/v1/covers/photos/photo-1/thumb',
      },
    ],
  })
})

afterEach(cleanup)

describe('FolderCoverPicker photo search', () => {
  test('uses the shared API client and renders its validated result', async () => {
    render(
      <FolderCoverPicker
        value={undefined}
        folderName="Desk"
        tiers={['photos']}
        onPick={() => undefined}
        onRemove={() => undefined}
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Search openly licensed photos' }), {
      target: { value: 'lake and trees' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => expect(api.getPlain).toHaveBeenCalledTimes(1))
    expect(api.getPlain.mock.calls[0]?.[1]).toBe('/covers/photos')
    expect(api.getPlain.mock.calls[0]?.[2]).toEqual({ q: 'lake and trees' })
    expect(await screen.findByRole('option', { name: 'Quiet lake by A photographer' })).toBeDefined()
  })
})
