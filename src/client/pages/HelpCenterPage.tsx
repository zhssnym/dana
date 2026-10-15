import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'

import { HELP_SECTIONS, findHelp, helpArticles, helpBySlug, type HelpArticle, type HelpSection } from '../help/content.js'
import { HelpMarkdown, helpHeadings } from '../help/markdown.js'
import {
  ArrowRight, BookOpen, CalendarDays, ChevronDown, ChevronRight, CircleAlert, FileText,
  Keyboard, ListChecks, Rocket, Search, Settings, UsersRound, X,
  type LucideIcon,
} from '../lib/icons.js'
import { paths } from '../routes.js'

const TOPICS: Record<HelpSection, { icon: LucideIcon; description: string }> = {
  'Getting started': { icon: Rocket, description: 'The essentials for your first day with Dana' },
  'Tasks and planning': { icon: CalendarDays, description: 'Organize tasks, dates, and views' },
  'Pages and writing': { icon: FileText, description: 'Write and structure your work' },
  Collaboration: { icon: UsersRound, description: 'Work with teammates and communicate' },
  Navigation: { icon: Search, description: 'Find things and move around faster' },
  'Account and settings': { icon: Settings, description: 'Personal preferences and account data' },
  Troubleshooting: { icon: CircleAlert, description: 'Answers when something is not working' },
}

const START_HERE = [
  { slug: 'getting-started', icon: Rocket },
  { slug: 'create-and-complete-tasks', icon: ListChecks },
  { slug: 'keyboard-shortcuts', icon: Keyboard },
] as const

function sectionId(section: HelpSection): string {
  return 'topic-' + section.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function ArticleRow({ article, summary = false }: { readonly article: HelpArticle; readonly summary?: boolean }): React.JSX.Element {
  return (
    <Link to={paths.helpArticle(article.slug)}
      className="group flex min-w-0 items-center justify-between gap-4 rounded-md px-2 py-2 text-sm text-foreground hover:bg-hover focus-visible:outline-2 focus-visible:outline-primary">
      <span className="min-w-0">
        <span className="block font-section">{article.title}</span>
        {summary ? <span className="mt-1 block text-xs leading-5 text-muted-foreground">{article.summary}</span> : null}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" strokeWidth={1.75} aria-hidden="true" />
    </Link>
  )
}

function TopicNavigation({ article }: { readonly article?: HelpArticle }): React.JSX.Element {
  return (
    <nav aria-label="Help topics" className="space-y-1">
      <Link to={paths.help}
        aria-current={article === undefined ? 'page' : undefined}
        className="mb-3 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-section text-foreground hover:bg-hover aria-[current=page]:bg-muted">
        <BookOpen className="size-4" strokeWidth={1.75} aria-hidden="true" />
        All guides
      </Link>
      {HELP_SECTIONS.map((section) => {
        const TopicIcon = TOPICS[section].icon
        const active = article?.section === section
        const to = paths.help + '#' + sectionId(section)
        return (
          <div key={section}>
            <Link to={to} aria-current={active ? 'location' : undefined}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-hover hover:text-foreground aria-[current=location]:bg-muted aria-[current=location]:text-foreground">
              <TopicIcon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span>{section}</span>
            </Link>
            {active ? (
              <div className="ml-5 border-l border-border py-1 pl-3">
                {helpArticles.filter((entry) => entry.section === section).map((entry) => (
                  <Link key={entry.slug} to={paths.helpArticle(entry.slug)}
                    aria-current={entry.slug === article?.slug ? 'page' : undefined}
                    className="block rounded-md px-2 py-1.5 text-xs leading-5 text-muted-foreground hover:bg-hover hover:text-foreground aria-[current=page]:font-section aria-[current=page]:text-foreground">
                    {entry.title}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        )
      })}
    </nav>
  )
}

function HelpHome(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const results = useMemo(() => findHelp(query), [query])
  const searching = query.trim().length > 0
  return (
    <>
      <section className="pb-9 pt-8 sm:pb-12 sm:pt-12">
        <h1 className="font-title text-[length:var(--text-title-size)] leading-[var(--text-title-line)]">How can we help?</h1>
        <p className="mt-3 max-w-prose text-sm leading-6 text-muted-foreground">
          Find the guidance you need to plan, organize, and share work in Dana.
        </p>
        <div role="search" className="relative mt-7">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          <label className="sr-only" htmlFor="help-search">Search help articles</label>
          <input id="help-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Escape') setQuery('') }}
            placeholder="Search articles, tasks, calendar, shortcuts…"
            className="w-full rounded-lg border border-border bg-background py-3 pl-12 pr-12 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary/20" />
          {searching ? (
            <button type="button" aria-label="Clear search" onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground">
              <X className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </section>

      {searching ? (
        <section aria-live="polite" className="pb-20">
          <h2 className="mb-4 font-section text-[length:var(--text-h3-size)]">
            {results.length === 0 ? 'No matching articles' : 'Search results'}
          </h2>
          {results.length === 0 ? (
            <p className="text-sm leading-6 text-muted-foreground">Try a different term, such as Calendar, task, or teammate.</p>
          ) : (
            <div className="divide-y divide-border border-y border-border py-1">
              {results.map((article) => (
                <div key={article.slug} className="py-1">
                  <p className="px-2 pt-2 text-xs text-muted-foreground">{article.section}</p>
                  <ArticleRow article={article} summary />
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <div className="pb-20">
          <section className="border-t border-border pt-7">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-title text-[length:var(--text-h2-size)] leading-[var(--text-h2-line)]">Start here</h2>
              <span className="text-xs text-muted-foreground">Recommended guides</span>
            </div>
            <div className="divide-y divide-border rounded-lg border border-border bg-muted px-3">
              {START_HERE.map(({ slug, icon: GuideIcon }) => {
                const article = helpBySlug.get(slug)
                if (article === undefined) return null
                return (
                  <Link to={paths.helpArticle(slug)} key={slug}
                    className="group flex items-center gap-4 rounded-md px-2 py-4 hover:bg-hover focus-visible:outline-2 focus-visible:outline-primary">
                    <GuideIcon className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-section">{article.title}</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">{article.summary}</span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" strokeWidth={1.75} aria-hidden="true" />
                  </Link>
                )
              })}
            </div>
          </section>

          <section className="mt-12" aria-label="Browse help topics">
            <h2 className="mb-6 font-title text-[length:var(--text-h2-size)] leading-[var(--text-h2-line)]">Browse by topic</h2>
            <div className="grid gap-x-12 gap-y-9 md:grid-cols-2">
              {HELP_SECTIONS.map((section) => {
                const TopicIcon = TOPICS[section].icon
                const articles = helpArticles.filter((article) => article.section === section)
                if (articles.length === 0) return null
                return (
                  <section key={section} id={sectionId(section)} className="scroll-mt-24 border-t border-border pt-5">
                    <div className="flex items-start gap-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                        <TopicIcon className="size-4" strokeWidth={1.75} aria-hidden="true" />
                      </div>
                      <div>
                        <h3 className="font-section text-[length:var(--text-h3-size)] leading-[var(--text-h3-line)]">{section}</h3>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{TOPICS[section].description}</p>
                      </div>
                    </div>
                    <div className="mt-4 -mx-2">
                      {articles.map((article) => <ArticleRow key={article.slug} article={article} />)}
                    </div>
                  </section>
                )
              })}
            </div>
          </section>
        </div>
      )}
    </>
  )
}

function HelpArticleView({ slug }: { readonly slug: string }): React.JSX.Element {
  const article = helpBySlug.get(slug)
  if (article === undefined) {
    return (
      <section className="py-16">
        <h1 className="font-title text-[length:var(--text-title-size)]">Article not found</h1>
        <p className="mt-3 text-sm text-muted-foreground">This guide may have moved.</p>
        <Link to={paths.help} className="mt-5 inline-flex items-center gap-2 text-sm text-primary underline underline-offset-2">
          Browse help articles <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </section>
    )
  }
  const headings = helpHeadings(article.body)
  return (
    <div className="py-8 sm:py-12">
      <nav aria-label="Breadcrumb" className="mb-8 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Link to={paths.help} className="hover:text-foreground">Help</Link>
        <ChevronRight className="size-3" aria-hidden="true" />
        <Link to={paths.help + '#' + sectionId(article.section)} className="hover:text-foreground">{article.section}</Link>
        <ChevronRight className="size-3" aria-hidden="true" />
        <span className="text-foreground">{article.title}</span>
      </nav>
      <div className="grid gap-10 xl:grid-cols-4">
        <article className="min-w-0 xl:col-span-3">
          <header className="border-b border-border pb-7">
            <h1 className="font-title text-[length:var(--text-title-size)] leading-[var(--text-title-line)]">{article.title}</h1>
            <p className="mt-3 max-w-prose text-sm leading-6 text-muted-foreground">{article.summary}</p>
          </header>
          <div className="max-w-prose pt-5"><HelpMarkdown body={article.body} /></div>
          {article.related.length > 0 ? (
            <section className="mt-12 border-t border-border pt-7">
              <h2 className="mb-3 font-title text-[length:var(--text-h3-size)] leading-[var(--text-h3-line)]">Related guides</h2>
              <div className="divide-y divide-border border-y border-border">
                {article.related.map((related) => {
                  const item = helpBySlug.get(related)
                  return item ? <ArticleRow key={related} article={item} /> : null
                })}
              </div>
            </section>
          ) : null}
        </article>
        {headings.length > 0 ? (
          <aside className="hidden xl:block" aria-label="On this page">
            <div className="sticky top-24">
              <h2 className="mb-3 text-xs font-section text-muted-foreground">On this page</h2>
              <nav className="space-y-1 border-l border-border pl-3" aria-label="Article outline">
                {headings.map((heading) => (
                  <a key={heading.id} href={'#' + heading.id}
                    className="block py-1 text-xs leading-5 text-muted-foreground hover:text-foreground">
                    {heading.title}
                  </a>
                ))}
              </nav>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}

export function HelpCenterPage(): React.JSX.Element {
  const { slug } = useParams()
  const location = useLocation()
  const article = slug === undefined ? undefined : helpBySlug.get(slug)
  useEffect(() => {
    if (!location.hash) return
    document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView()
  }, [location.hash, location.pathname])
  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link to={paths.help} className="flex items-center gap-3 text-sm font-title">
            <BookOpen className="size-5" strokeWidth={1.75} aria-hidden="true" />
            <span>Dana <span className="ml-2 border-l border-border pl-3 font-normal text-muted-foreground">Help center</span></span>
          </Link>
          <a href={paths.home} className="inline-flex shrink-0 items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground">
            Open Dana <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </a>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="lg:grid lg:grid-cols-4 lg:gap-10">
          <aside className="hidden border-r border-border py-10 pr-5 lg:block">
            <div className="sticky top-24">
              <h2 className="mb-4 px-3 text-xs font-section text-muted-foreground">Browse topics</h2>
              <TopicNavigation article={article} />
            </div>
          </aside>
          <div className="min-w-0 lg:col-span-3">
            <details className="group mt-5 rounded-md border border-border lg:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-section">
                Browse topics <ChevronDown className="size-4 text-muted-foreground group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="border-t border-border px-2 py-3"><TopicNavigation article={article} /></div>
            </details>
            {slug === undefined ? <HelpHome /> : <HelpArticleView slug={slug} />}
          </div>
        </div>
      </div>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-muted-foreground sm:px-8">
          <span>Dana Help Center</span>
          <span className="flex gap-4">
            <a href="/privacy" className="hover:text-foreground">Privacy</a>
            <a href="/terms" className="hover:text-foreground">Terms</a>
          </span>
        </div>
      </footer>
    </main>
  )
}
