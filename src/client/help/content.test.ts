import { describe, expect, it } from 'vitest'

import { findHelp, HELP_SECTIONS, helpArticles, helpBySlug } from './content.js'

describe('public help articles', () => {
  it('has valid titles, categories, unique slugs, and related links', () => {
    expect(helpArticles.length).toBeGreaterThanOrEqual(10)
    expect(new Set(helpArticles.map((article) => article.slug)).size).toBe(helpArticles.length)
    for (const article of helpArticles) {
      expect(article.title.length).toBeGreaterThan(5)
      expect(article.summary.length).toBeGreaterThan(12)
      expect(HELP_SECTIONS).toContain(article.section)
      expect(article.body.length).toBeGreaterThan(40)
      for (const related of article.related) {
        expect(helpBySlug.has(related), article.slug + ' references ' + related).toBe(true)
      }
      for (const link of article.body.matchAll(/\]\(\/help\/([a-z-]+)\)/g)) {
        expect(helpBySlug.has(link[1]!), article.slug + ' links to ' + link[1]).toBe(true)
      }
    }
  })

  it('finds information by article title and body without a server', () => {
    expect(findHelp('calendar').some((item) => item.slug === 'schedule-a-task')).toBe(true)
    expect(findHelp('keyboard').some((item) => item.slug === 'keyboard-shortcuts')).toBe(true)
    expect(findHelp('search').length).toBeGreaterThan(0)
    expect(findHelp('does-not-match-any-known-help-article')).toEqual([])
  })
})
