// Public guides are separate from internal engineering docs. The source files are
// the publishing input for future documentation automation (#678).
const sources = import.meta.glob('./articles/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export const HELP_SECTIONS = [
  'Getting started',
  'Tasks and planning',
  'Pages and writing',
  'Collaboration',
  'Navigation',
  'Account and settings',
  'Troubleshooting',
] as const

export type HelpSection = typeof HELP_SECTIONS[number]

export interface HelpArticle {
  readonly slug: string
  readonly title: string
  readonly summary: string
  readonly section: HelpSection
  readonly body: string
  readonly related: readonly string[]
}

function parseArticle(path: string, raw: string): HelpArticle {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  if (frontmatter === null) throw new Error('Missing help article metadata: ' + path)
  const fields = new Map<string, string>()
  for (const line of frontmatter[1]!.split(/\r?\n/)) {
    const colon = line.indexOf(':')
    if (colon > 0) fields.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim())
  }
  const title = fields.get('title')
  const summary = fields.get('summary')
  const section = fields.get('section')
  if (!title || !summary || !HELP_SECTIONS.some((name) => name === section)) {
    throw new Error('Invalid help article metadata: ' + path)
  }
  return {
    slug: path.split('/').at(-1)!.replace(/\.md$/, ''),
    title,
    summary,
    section: section as HelpSection,
    body: raw.slice(frontmatter[0].length).trim(),
    related: (fields.get('related') ?? '').split(',').map((slug) => slug.trim()).filter(Boolean),
  }
}

export const helpArticles: readonly HelpArticle[] = Object.entries(sources)
  .map(([path, raw]) => parseArticle(path, raw))
  .sort((a, b) => a.title.localeCompare(b.title))

export const helpBySlug = new Map(helpArticles.map((article) => [article.slug, article]))

// A local index avoids a public database and never sends a visitor's query to the API.
export function findHelp(query: string): HelpArticle[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return helpArticles.slice()
  return helpArticles
    .filter((article) => {
      const haystack = (article.title + ' ' + article.summary + ' ' + article.section + ' ' + article.body)
        .toLocaleLowerCase()
      return terms.every((term) => haystack.includes(term))
    })
    .sort((a, b) => {
      const titleA = a.title.toLocaleLowerCase().includes(terms[0]!) ? 0 : 1
      const titleB = b.title.toLocaleLowerCase().includes(terms[0]!) ? 0 : 1
      return titleA - titleB || a.title.localeCompare(b.title)
    })
}
