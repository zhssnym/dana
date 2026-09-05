/*
The ownership boundary of issue #85's Important slice.

The browser criteria prove the visible page. This source-level case protects
the architectural move itself: Important's content may render the props it is
given, but route wiring, reads, mutations, navigation and application state
stay in `pages/ImportantPage.tsx`.
*/
import { describe, expect, test } from 'vitest'

const modules = import.meta.glob(
  [
    '/src/client/components/important-page-content.tsx',
    '/src/client/pages/ImportantPage.tsx',
  ],
  { eager: true, query: '?raw', import: 'default' },
) as Record<string, string>

const content = modules['/src/client/components/important-page-content.tsx'] ?? ''
const page = modules['/src/client/pages/ImportantPage.tsx'] ?? ''

describe('Important page ownership', () => {
  test('the component cannot acquire route, data or application-state responsibilities', () => {
    expect(content).not.toMatch(
      /from\s+["'](?:react-router|\.\.\/(?:api|pages|parts|routes|shell|state|views)(?:\/|\.[jt]s))/,
    )
    expect(content).not.toMatch(/\buse[A-Z][A-Za-z0-9]*\s*\(/)
  })

  test('the page owns the query and actions and supplies the content boundary', () => {
    expect(page).toContain('useImportantView()')
    expect(page).toContain('useRowActions()')
    expect(page).toContain('<ImportantPageContent')

    for (const prop of [
      'page={{',
      'previewState={',
      'tasks={',
      'onRetry={',
      'onOpenTask={',
      'onToggleComplete={',
      'onToggleImportant={',
      'onRestore={',
      'onAbandon={',
      'onDelete={',
    ]) {
      expect(page).toContain(prop)
    }
  })
})
