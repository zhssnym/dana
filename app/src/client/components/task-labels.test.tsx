// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import type { LabelDefinition, LabelRef } from '../../shared/labels.js'

const mocks = vi.hoisted(() => ({
  assign: vi.fn(), create: vi.fn(), patch: vi.fn(), archive: vi.fn(),
}))
const definitions: LabelDefinition[] = [
  { id: 'personal', scope: 'personal', name: 'Private', color: '#8a8a8a', description: null, archived: false, folder_id: null },
  { id: 'work', scope: 'folder', name: 'Shared', color: '#2f7fe0', description: null, archived: false, folder_id: 'folder' },
  { id: 'old', scope: 'folder', name: 'Old', color: '#e03e3e', description: null, archived: true, folder_id: 'folder' },
]
vi.mock('../api/labels.js', () => ({
  useLabels: () => ({ data: { rows: definitions }, isError: false }),
  useSetTaskLabel: () => ({ mutate: mocks.assign, isPending: false }),
  useCreateLabel: () => ({ mutate: mocks.create, isPending: false }),
  usePatchLabel: () => ({ mutate: mocks.patch, isPending: false }),
  useArchiveLabel: () => ({ mutate: mocks.archive, isPending: false }),
}))

import { TaskLabels } from './task-labels.js'

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Task Labels', () => {
  it('offers Personal assignment to a viewer who cannot edit Work labels', async () => {
    render(<TaskLabels taskId="task" folderId="folder" sharedName="Work" worn={[]} canManageFolder={false} canApplyFolder={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Labels: Add labels' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Assign Personal label Private' }))
    expect(mocks.assign).toHaveBeenCalledWith({ taskId: 'task', labelId: 'personal', on: true })
    expect(screen.getByRole('button', { name: 'Assign Work label Shared' }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByRole('button', { name: 'Create work label' })).toBeNull()
  })

  it('removes an assigned label and keeps an archived label visible but out of normal choices', async () => {
    const worn = [definitions[1]!, definitions[2]!] as LabelRef[]
    render(<TaskLabels taskId="task" folderId="folder" sharedName="Work" worn={worn} canManageFolder canApplyFolder />)
    expect(screen.getByText('Old')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Labels: Shared, Old' }))
    expect(screen.queryByRole('button', { name: 'Assign Work label Old' })).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Work label Shared' }))
    expect(mocks.assign).toHaveBeenCalledWith({ taskId: 'task', labelId: 'work', on: false })
    fireEvent.click(screen.getByRole('button', { name: 'Show archived' }))
    expect(screen.getByRole('button', { name: 'Remove Work label Old' }).hasAttribute('disabled')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Work label Old' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(mocks.archive).toHaveBeenCalledWith({ label: definitions[2], archived: false }, expect.anything())
  })
})
