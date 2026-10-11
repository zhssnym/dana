// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NativeTitleTooltips } from './native-title-tooltips.js'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  document.getElementById('root')?.remove()
})

function mount(children: React.ReactNode): HTMLDivElement {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.append(root)
  render(<>{children}<NativeTitleTooltips /></>, { container: root })
  return root
}

describe('native title tooltip fallback', () => {
  it('uses Dana styling instead of browser title and retains the accessible label', () => {
    const root = mount(<button type="button" title="Filter tasks" />)
    const button = root.querySelector('button')!
    expect(button.hasAttribute('title')).toBe(false)
    expect(button.getAttribute('aria-label')).toBe('Filter tasks')

    vi.useFakeTimers()
    fireEvent.pointerOver(button, { pointerType: 'mouse' })
    act(() => vi.advanceTimersByTime(500))
    const hint = screen.getByRole('tooltip')
    expect(hint.textContent).toBe('Filter tasks')
    expect(hint.className).toContain('bg-foreground')

    fireEvent.pointerOut(button, { pointerType: 'mouse' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('converts labels added after mount and handles keyboard focus', async () => {
    const root = mount(<div />)
    const button = document.createElement('button')
    button.setAttribute('title', 'New action')
    root.append(button)
    await act(async () => { await Promise.resolve() })
    expect(button.hasAttribute('title')).toBe(false)

    vi.useFakeTimers()
    // Focus-visible is normally true for keyboard focus; emulate that in jsdom.
    const match = button.matches.bind(button)
    const spy = vi.spyOn(button, 'matches').mockImplementation((selector: string) =>
      selector === ':focus-visible' ? true : match(selector))
    fireEvent.focusIn(button)
    act(() => vi.advanceTimersByTime(500))
    expect(screen.getByRole('tooltip').textContent).toBe('New action')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
    spy.mockRestore()
  })
})
