import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const team = readFileSync(
  new URL('../../src/client/pages/FolderSharingPanel.tsx', import.meta.url),
  'utf8',
)
const folderPage = readFileSync(
  new URL('../../src/client/pages/FolderPage.tsx', import.meta.url),
  'utf8',
)

describe('Team collaboration views', () => {
  test('keeps sidebar and full page as two presentations of one Team surface', () => {
    expect(team).toContain("type TeamView = 'sidebar' | 'full'")
    expect(team).toContain("const viewLabel = fullPage ? 'Sidebar view' : 'Open full page'")
    expect(team).toContain("setView(fullPage ? 'sidebar' : 'full')")
    expect(team).toContain('<UsersRound')
    expect(team).toContain('max-w-4xl')
  })

  test('keeps the project header entry and its existing teammate label transition', () => {
    expect(folderPage).toContain('aria-expanded={sharing}')
    expect(folderPage).toContain("{members.length <= 1 ? 'Add teammates' : 'Team'}")
  })
})
