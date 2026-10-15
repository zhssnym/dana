import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'

import { findHelp, helpArticles, helpBySlug } from '../help/content.js'
import type { HelpArticle, HelpSection } from '../help/content.js'
import { helpHeadings, HelpMarkdown } from '../help/markdown.js'
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Compass,
  FileText,
  ListTodo,
  Search,
  Settings,
  UsersRound,
  X,
} from '../lib/icons.js'
import type { LucideIcon } from '../lib/icons.js'
import { paths } from '../routes.js'

const TOPICS: readonly {
  section: HelpSection
  summary: string
  icon: LucideIcon
}[] = [
  { section: 'Getting started', summary: 'Your first steps, Desk, and pages', icon: Compass },
  { section: 'Tasks and planning', summary: 'Tasks, dates, views, and priorities', icon: ListTodo },
  { section: 'Pages and writing', summary: 'Writing and organizing your work', icon: FileText },
  { section: 'Collaboration', summary: 'Teammates, access, and discussions', icon: UsersRound },
  { section: 'Navigation', summary: 'Find work and use keyboard shortcuts', icon: Search },
  { section: 'Account and settings', summary: 'Preferences, archives, and your data', icon: Settings },
  { section: 'Troubleshooting', summary: 'Answers to common problems', icon: CircleAlert },
]

const START_HERE = ['getting-started', 'desk-and-pages', 'create-and-complete-tasks'] as const
const USEFUL_GUIDES = ['schedule-a-task', 'work-views', 'collaborate-on-work', 'keyboard-shortcuts'] as const

function topicUrl(section: HelpSection): string {
  return paths.help + '?section=' + encodeURIComponent(section)
}

function articlesIn(section: HelpSection): HelpArticle[] {
  return helpArticles.filter((article) => article.section === section)
}

function TopicIcon({ icon: Icon }: { readonly icon: LucideIcon }): React.JSX.Element {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
      <Icon className="size-5" strokeWidth={1.6} aria-hidden="true" />
    </span>
  )
}

function GuideLink({ article }: { readonly article: HelpArticle }): React.JSX.Element {
  return (
    <Link
      to={paths.helpArticle(article.slug)}
      className="group flex items-start gap-3 border-b border-border py-4 text-foreground transition-colors hover:text-primary focus-visible:rounded-sm"
    >
      <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.6} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-section">{article.title}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{article.summary}</span>
      </span>
      <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
    </Link>
  )
}

function TopicList(): React.JSX.Element {
  return (
    <section aria-labelledby="browse-topics">
      <h2 id="browse-topics" className="mb-4 font-title text-[length:var(--text-h2-size)] leading-[var(--text-h2-line)]">
        Browse by topic
      </h2>
      <div className="grid gap-x-9 sm:grid-cols-2">
        {TOPICS.map((topic) => (
          <Link
            key={topic.section}
            to={topicUrl(topic.section)}
            className="group flex items-center gap-4 border-b border-border py-5 focus-visible:rounded-sm"
          >
            <TopicIcon icon={topic.icon} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-section text-foreground group-hover:text-primary">{topic.section}</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">{topic.summary}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  )
}

function SuggestedGuides(): React.JSX.Element {
  return (
    <aside className="space-y-9 lg:border-l lg:border-border lg:pl-9" aria-label="Suggested guides">
      <section>
        <h2 className="flex items-center gap-2 text-sm font-title">
          <BookOpen className="size-4 text-muted-foreground" strokeWidth={1.6} aria-hidden="true" />
          Start here
        </h2>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">New to Dana? These guides cover the basics.</p>
        <div className="mt-3">
          {START_HERE.map((slug) => {
            const article = helpBySlug.get(slug)
            return article ? (
              <Link key={slug} to={paths.helpArticle(slug)} className="group flex items-center justify-between gap-3 border-b border-border py-3 text-sm hover:text-primary">
                {article.title}
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
              </Link>
            ) : null
          })}
        </div>
      </section>
      <section>
        <h2 className="text-sm font-title">Useful guides</h2>
        <div className="mt-2">
          {USEFUL_GUIDES.map((slug) => {
            const article = helpBySlug.get(slug)
            return article ? (
              <Link key={slug} to={paths.helpArticle(slug)} className="group flex items-center justify-between gap-3 py-2 text-sm text-muted-foreground hover:text-foreground">
                {article.title}
                <ChevronRight className="size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
              </Link>
            ) : null
          })}
        </div>
      </section>
    </aside>
  )
}

function TopicView({ section }: { readonly section: HelpSection }): React.JSX.Element {
  const topic = TOPICS.find((entry) => entry.section === section)!
  const articles = articlesIn(section)
  return (
    <section className="pb-20 pt-9">
      <Link to={paths.help} className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4 rotate-180" aria-hidden="true" />
        All topics
      </Link>
      <div className="mt-8 flex items-start gap-4 border-b border-border pb-8">
        <TopicIcon icon={topic.icon} />
        <div>
          <h2 className="font-title text-[length:var(--text-h2-size)] leading-[var(--text-h2-line)]">{section}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{topic.summary}</p>
        </div>
      </div>
      <div className="max-w-[var(--help-article-width)]">
        {articles.map((article) => <GuideLink key={article.slug} article={article} />)}
      </div>
    </section>
  )
}

function HelpHome(): React.JSX.Element {
  const [searchParams] = useSearchParams()
  const selected = TOPICS.find((topic) => topic.section === searchParams.get('section'))?.section
  const [query, setQuery] = useState('')
  const results = useMemo(() => findHelp(query), [query])
  const searching = query.trim().length > 0

  return (
    <div className="mx-auto max-w-[var(--help-layout-width)] px-5 sm:px-8">
      <section className="border-b border-border py-12 sm:py-16">
        <h1 className="font-title text-[length:var(--text-title-size)] leading-[var(--text-title-line)] sm:text-[length:var(--help-hero-title-size)] sm:leading-[var(--help-hero-title-line)]">
          How can we help?
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">Find answers and learn how to work in Dana.</p>
        <div role="search" className="mt-7 flex max-w-[var(--help-search-width)] items-center gap-3 rounded-md border border-input bg-background px-4 focus-within:border-primary">
          <Search className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.6} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search help articles"
            placeholder="Search help articles"
            autoFocus={searchParams.get('search') === '1'}
            autoComplete="off"
            className="h-12 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="rounded-sm p-1 text-muted-foreground hover:bg-hover hover:text-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </section>

      {searching ? (
        <section className="pb-20 pt-8" aria-live="polite">
          <h2 className="text-sm font-title">
            {results.length === 0 ? 'No matching articles' : 'Search results'}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {results.length === 0 ? 'Try a different word or browse the topics.' : String(results.length) + (results.length === 1 ? ' guide' : ' guides') + ' found'}
          </p>
          {results.length > 0 ? (
            <div className="mt-5 max-w-[var(--help-article-width)]">
              {results.map((article) => <GuideLink key={article.slug} article={article} />)}
            </div>
          ) : (
            <Link to={paths.help} onClick={() => setQuery('')} className="mt-5 inline-flex items-center gap-2 text-sm text-primary hover:underline">
              Browse all topics <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          )}
        </section>
      ) : selected ? (
        <TopicView section={selected} />
      ) : (
        <div className="grid gap-12 pb-20 pt-10 lg:grid-cols-[minmax(0,1fr)_var(--help-suggestions-width)]">
          <TopicList />
          <SuggestedGuides />
        </div>
      )}
    </div>
  )
}

function DocumentationNavigation({ current }: { readonly current: string }): React.JSX.Element {
  return (
    <nav aria-label="Help articles" className="space-y-6">
      {TOPICS.map((topic) => {
        const Icon = topic.icon
        return (
          <section key={topic.section}>
            <Link to={topicUrl(topic.section)} className="flex items-center gap-2 text-xs font-section text-foreground hover:text-primary">
              <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.6} aria-hidden="true" />
              {topic.section}
            </Link>
            <div className="mt-2 space-y-0.5">
              {articlesIn(topic.section).map((entry) => {
                const active = entry.slug === current
                return (
                  <Link
                    key={entry.slug}
                    to={paths.helpArticle(entry.slug)}
                    aria-current={active ? 'page' : undefined}
                    className={'block rounded-md px-3 py-2 text-xs leading-5 transition-colors ' +
                      (active ? 'bg-selected font-section text-foreground' : 'text-muted-foreground hover:bg-hover hover:text-foreground')}
                  >
                    {entry.title}
                  </Link>
                )
              })}
            </div>
          </section>
        )
      })}
    </nav>
  )
}

function HelpArticleView({ slug }: { readonly slug: string }): React.JSX.Element {
  const article = helpBySlug.get(slug)
  if (!article) {
    return (
      <div className="mx-auto max-w-[var(--help-layout-width)] px-5 py-16 sm:px-8">
        <h1 className="font-title text-[length:var(--text-title-size)]">Article not found</h1>
        <p className="mt-3 text-sm text-muted-foreground">This guide may have moved.</p>
        <Link to={paths.help} className="mt-6 inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <ArrowRight className="size-4 rotate-180" aria-hidden="true" /> Browse help articles
        </Link>
      </div>
    )
  }
  const headings = helpHeadings(article.body)
  const related = article.related.map((related) => helpBySlug.get(related)).filter((entry): entry is HelpArticle => entry !== undefined)

  return (
    <div className="mx-auto grid max-w-[var(--help-layout-width)] gap-8 px-5 pb-20 pt-8 sm:px-8 lg:grid-cols-[var(--help-nav-width)_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[var(--help-nav-width)_minmax(0,1fr)_var(--help-toc-width)] xl:gap-12">
      <aside className="hidden min-w-0 border-r border-border pr-5 lg:block">
        <div className="sticky top-8 max-h-[calc(100dvh_-_var(--help-nav-viewport-gap))] overflow-y-auto pb-8">
          <Link to={paths.help} className="mb-7 inline-flex items-center gap-2 text-xs font-section text-foreground hover:text-primary">
            <BookOpen className="size-4 text-muted-foreground" aria-hidden="true" /> All guides
          </Link>
          <DocumentationNavigation current={slug} />
        </div>
      </aside>
      <div className="min-w-0">
        <details className="group mb-8 border-b border-border pb-4 lg:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-3 rounded-sm py-2 text-sm font-section [&::-webkit-details-marker]:hidden">
            <BookOpen className="size-4 text-muted-foreground" aria-hidden="true" />
            Browse articles
            <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="mt-4 max-h-[var(--help-mobile-nav-height)] overflow-y-auto pb-3">
            <DocumentationNavigation current={slug} />
          </div>
        </details>

        <article className="mx-auto max-w-[var(--help-article-width)]">
          <nav aria-label="Breadcrumb" className="mb-8 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Link to={paths.help} className="hover:text-foreground">Help</Link>
            <ChevronRight className="size-3.5" aria-hidden="true" />
            <Link to={topicUrl(article.section)} className="hover:text-foreground">{article.section}</Link>
          </nav>
          <header className="border-b border-border pb-8">
            <h1 className="font-title text-[length:var(--text-title-size)] leading-[var(--text-title-line)]">{article.title}</h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">{article.summary}</p>
          </header>
          <div className="pt-4"><HelpMarkdown body={article.body} /></div>
          {related.length > 0 ? (
            <section className="mt-14 border-t border-border pt-6">
              <h2 className="text-sm font-title">Related guides</h2>
              <div className="mt-3">
                {related.map((entry) => (
                  <Link key={entry.slug} to={paths.helpArticle(entry.slug)} className="group flex items-center justify-between gap-3 border-b border-border py-3 text-sm hover:text-primary">
                    {entry.title}
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </article>
      </div>
      <aside className="hidden xl:block">
        {headings.length > 1 ? (
          <nav className="sticky top-8" aria-label="On this page">
            <h2 className="mb-4 text-xs font-section text-foreground">On this page</h2>
            <div className="space-y-1 border-l border-border">
              {headings.map((heading) => (
                <a
                  key={heading.id}
                  href={'#' + heading.id}
                  className={'block py-1 text-xs leading-5 text-muted-foreground hover:text-foreground ' + (heading.level === 3 ? 'pl-6' : 'pl-3')}
                >
                  {heading.title}
                </a>
              ))}
            </div>
          </nav>
        ) : null}
      </aside>
    </div>
  )
}

export function HelpCenterPage(): React.JSX.Element {
  const { slug } = useParams()
  const [params] = useSearchParams()
  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[var(--help-layout-width)] items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link to={paths.help} className="flex items-center gap-3 font-title text-sm text-foreground hover:text-primary">
            <img src="/dana-mark.svg" alt="" className="size-7 shrink-0" />
            <span>Dana <span className="ml-1 font-normal text-muted-foreground">Help Center</span></span>
          </Link>
          <nav aria-label="Help actions" className="flex items-center gap-5">
            {slug ? (
              <Link to={paths.help + '?search=1'} className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
                <Search className="size-4" aria-hidden="true" /> Search help
              </Link>
            ) : null}
            <a href={paths.home} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              Open Dana <ArrowUpRight className="size-4" aria-hidden="true" />
            </a>
          </nav>
        </div>
      </header>
      {slug === undefined ? <HelpHome key={params.get('section') ?? 'all'} /> : <HelpArticleView slug={slug} />}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[var(--help-layout-width)] flex-wrap items-center justify-between gap-4 px-5 py-6 text-xs text-muted-foreground sm:px-8">
          <span>Dana Help Center</span>
          <span className="flex items-center gap-4">
            <Link to={paths.updates} className="hover:text-foreground">What's new</Link>
            <a href="/privacy" className="hover:text-foreground">Privacy</a>
            <a href="/terms" className="hover:text-foreground">Terms</a>
            <a href={paths.home} className="hover:text-foreground">Open Dana</a>
          </span>
        </div>
      </footer>
    </main>
  )
}
