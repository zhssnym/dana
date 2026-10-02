// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

import { TaskRow } from './task-row.js'

afterEach(cleanup)

describe('TaskRow labels', () => {
  it('draws the task labels in row metadata', () => {
    render(
      <TaskRow
        id="task"
        title="Ship labels"
        labels={[{ id: 'enhancement', name: 'enhancement', color: '#22c55e' }]}
      />,
    )

    const row = screen.getByRole('listitem')
    expect(within(row).getByText('enhancement')).toBeTruthy()
  })
})
