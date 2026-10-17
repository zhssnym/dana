// Public guides are separate from internal engineering docs. The source files are
// the publishing input for future documentation automation (#678).
const sources = import.meta.glob('./articles/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export interface HelpArticle {
  readonly slug: string
  readonly title: string
  readonly summary: string
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
  if (!title || !summary) {
    throw new Error('Invalid help article metadata: ' + path)
  }
  return {
    slug: path.split('/').at(-1)!.replace(/\.md$/, ''),
    title,
    summary,
    body: raw.slice(frontmatter[0].length).trim(),
    related: (fields.get('related') ?? '').split(',').map((slug) => slug.trim()).filter(Boolean),
  }
}

// Reading order. A new article goes last until it is placed here.
const ORDER = ['how-dana-works', 'tasks-and-dates', 'views', 'writing', 'working-together', 'find-and-shortcuts', 'account-and-data']
const order = (slug: string): number => ORDER.indexOf(slug) + 1 || ORDER.length + 1

export const helpArticles: readonly HelpArticle[] = Object.entries(sources)
  .map(([path, raw]) => parseArticle(path, raw))
  .sort((a, b) => order(a.slug) - order(b.slug) || a.title.localeCompare(b.title))

export const helpBySlug = new Map(helpArticles.map((article) => [article.slug, article]))

// Old article links stay valid after the 16 guides were merged into concept pages.
export const MOVED_HELP: Readonly<Record<string, string>> = {
  'getting-started': 'how-dana-works',
  'desk-and-pages': 'how-dana-works',
  'create-and-complete-tasks': 'tasks-and-dates',
  'schedule-a-task': 'tasks-and-dates',
  'today-and-upcoming': 'tasks-and-dates',
  'work-views': 'views',
  'writing-and-blocks': 'writing',
  'collaborate-on-work': 'working-together',
  'teammate-profiles': 'working-together',
  'discussions-and-messages': 'working-together',
  'find-work': 'find-and-shortcuts',
  'keyboard-shortcuts': 'find-and-shortcuts',
  'account-and-preferences': 'account-and-data',
  'archived-work': 'account-and-data',
  'common-questions': 'account-and-data',
  feedback: 'account-and-data',
}

// A local index avoids a public database and never sends a visitor's query to the API.
export function findHelp(query: string): HelpArticle[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return helpArticles.slice()
  return helpArticles
    .filter((article) => {
      const haystack = (article.title + ' ' + article.summary + ' ' + article.body)
        .toLocaleLowerCase()
      return terms.every((term) => haystack.includes(term))
    })
    .sort((a, b) => {
      const titleA = a.title.toLocaleLowerCase().includes(terms[0]!) ? 0 : 1
      const titleB = b.title.toLocaleLowerCase().includes(terms[0]!) ? 0 : 1
      return titleA - titleB || a.title.localeCompare(b.title)
    })
}
