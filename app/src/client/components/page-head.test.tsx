// @vitest-environment jsdom

/*
Issue #84 makes People share the page-heading structure without sharing the
stored identity features of a place. These cases guard that boundary at the
component that defines it: fixed prose and caller actions are present, while
the cover and editable-description controls are not exposed.
*/
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

vi.mock('../lib/page-identity.js', () => ({
  coverPhotoPicker: () => undefined,
  coverStoresPosition: () => true,
  coverTiersFor: () => [],
  coverUploader: () => undefined,
  savePageIdentity: vi.fn(),
  usePageIdentity: () => ({}),
}))

import { UsersRound } from '../lib/icons.js'
import { PageHead, PageHeading } from './page-head.js'

afterEach(cleanup)

describe('PageHeading: the fixed People-compatible heading', () => {
  test('renders the shared heading content and caller action', () => {
    render(
      <PageHeading
        icon={UsersRound}
        title="People"
        description="Connections for quick folder sharing"
        actions={<button type="button">Invite someone</button>}
      />,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'People' })).toBeDefined()
    expect(screen.getByText('Connections for quick folder sharing')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Invite someone' })).toBeDefined()
  })

  test('does not expose cover or editable-description controls', () => {
    const { container } = render(
      <PageHeading
        icon={UsersRound}
        title="People"
        description="Connections for quick folder sharing"
      />,
    )

    expect(screen.queryByRole('button', { name: 'Add cover' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'People description' })).toBeNull()
    expect(container.querySelector('h1')?.closest('header')?.querySelector('svg')?.closest('button')).toBeNull()
  })
})

describe('PageHead: stored place identity', () => {
  test('retains the editable description control', () => {
    render(
      <PageHead
        storageName="today"
        icon={UsersRound}
        title="Today"
        description="A clear view of today"
      />,
    )

    expect(screen.getByRole('textbox', { name: 'Today description' })).toBeDefined()
  })
})
