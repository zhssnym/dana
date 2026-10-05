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
  it('shows one label vocabulary and hides choices the viewer cannot apply', async () => {
    render(<TaskLabels taskId="task" folderId="folder" sharedName="Work" worn={[]} canManageFolder={false} canApplyFolder={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Labels: Add labels' }))
    expect(screen.queryByText('Personal')).toBeNull()
    expect(screen.queryByText('Work')).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: 'Assign label Private' }))
    expect(mocks.assign).toHaveBeenCalledWith({ taskId: 'task', labelId: 'personal', on: true })
    expect(screen.queryByRole('button', { name: 'Assign label Shared' })).toBeNull()
  })

  it('keeps an already-worn shared label visible but read-only without apply permission', () => {
    const worn = [definitions[1]!] as LabelRef[]
    render(<TaskLabels taskId="task" folderId="folder" sharedName="Work" worn={worn} canManageFolder={false} canApplyFolder={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Labels: Shared' }))
    const shared = screen.getByRole('button', { name: 'Remove label Shared' })
    expect(shared.hasAttribute('disabled')).toBe(true)
    fireEvent.click(shared)
    expect(mocks.assign).not.toHaveBeenCalled()
  })

  it('creates a contextual shared label without asking for a scope', async () => {
    render(<TaskLabels taskId="task" folderId="folder" sharedName="Work" worn={[]} canManageFolder canApplyFolder />)
    fireEvent.click(screen.getByRole('button', { name: 'Labels: Add labels' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Search labels' }), { target: { value: 'Roadmap' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create “Roadmap”' }))
    expect(screen.getByText('New label')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save label' }))
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ folderId: 'folder', name: 'Roadmap' }), expect.anything())
  })

  it('keeps archived labels on the task and manages them behind Manage labels', async () => {
    const worn = [definitions[1]!, definitions[2]!] as LabelRef[]
    render(<TaskLabels taskId="task" folderId="folder" sharedName="Work" worn={worn} canManageFolder canApplyFolder />)
    expect(screen.getByText('Old')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Labels: Shared, Old' }))
    expect(screen.queryByRole('button', { name: 'Assign label Old' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Remove label Shared' }))
    expect(mocks.assign).toHaveBeenCalledWith({ taskId: 'task', labelId: 'work', on: false })
    fireEvent.click(screen.getByRole('button', { name: 'Manage labels' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit label Old' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(mocks.archive).toHaveBeenCalledWith({ label: definitions[2], archived: false }, expect.anything())
  })
})
