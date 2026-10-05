// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { ProjectPicker } from './project-picker.js'

afterEach(cleanup)

describe('ProjectPicker', () => {
  test('applies the usual Work structure without presenting a choice', async () => {
    const onPick = vi.fn()
    const { rerender } = render(
      <ProjectPicker editable pending={false} discussion={true} onPick={onPick} />,
    )

    await waitFor(() => expect(onPick).toHaveBeenCalledWith('usual'))
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText('How do you want to start?')).toBeNull()

    rerender(<ProjectPicker editable pending discussion={true} onPick={onPick} />)
    rerender(<ProjectPicker editable pending={false} discussion={true} onPick={onPick} />)
    expect(onPick).toHaveBeenCalledTimes(1)
  })

  test('shows only a quiet transitional state to a reader', () => {
    const onPick = vi.fn()
    render(<ProjectPicker editable={false} pending={false} discussion={true} onPick={onPick} />)

    expect(screen.getByText('This work is still being set up.')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(onPick).not.toHaveBeenCalled()
  })
})
