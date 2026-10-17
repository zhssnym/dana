import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'

import { findHelp, helpArticles, helpBySlug, MOVED_HELP } from '../help/content.js'
import { HelpMarkdown } from '../help/markdown.js'
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  CalendarDays,
  Compass,
  FileText,
  ListTodo,
  Pencil,
  Search,
  Settings,
  UsersRound,
  X,
} from '../lib/icons.js'
import type { LucideIcon } from '../lib/icons.js'
import { paths } from '../routes.js'

// An article without an entry here uses FileText.
const ARTICLE_ICONS: Readonly<Record<string, LucideIcon>> = {
  'how-dana-works': Compass,
  'tasks-and-dates': ListTodo,
  views: CalendarDays,
  writing: Pencil,
  'working-together': UsersRound,
  'find-and-shortcuts': Search,
  'account-and-data': Settings,
}

function SearchField({ query, onQuery }: {
  readonly query: string
  readonly onQuery: (query: string) => void
}): React.JSX.Element {
  return (
    <div role="search" className="flex items-center gap-2 rounded-md border border-input bg-background px-4 focus-within:border-primary">
      <Search className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.6} aria-hidden="true" />
      <input
        type="search"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        aria-label="Search help articles"
        placeholder="Search help articles"
        autoComplete="off"
        className="h-12 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
      />
      {query ? (
        <button
          type="button"
          onClick={() => onQuery('')}
          aria-label="Clear search"
          className="rounded-sm p-1 text-muted-foreground hover:bg-hover hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

function HelpShell({ children }: { readonly children: ReactNode }): React.JSX.Element {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-10 h-(--help-header-height) border-b border-border bg-background">
        <div className="mx-auto flex h-full max-w-[var(--help-layout-width)] items-center justify-between gap-4 px-5 sm:px-8">
          <Link to={paths.help} className="flex items-center gap-2.5 rounded-sm text-foreground">
            <img src="/dana-mark.svg" alt="" className="size-7 shrink-0" />
            <span className="font-title text-sm">Dana Help</span>
          </Link>
          <a href={paths.home} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-hover hover:text-foreground">
            Open Dana <ArrowUpRight className="size-4" aria-hidden="true" />
          </a>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}

function SearchResults({ query }: { readonly query: string }): React.JSX.Element {
  const results = useMemo(() => findHelp(query), [query])
  if (results.length === 0) {
    return (
      <div aria-live="polite">
        <h2 className="text-sm font-section">No matching articles</h2>
        <p className="mt-1 text-xs text-muted-foreground">Try a different word.</p>
      </div>
    )
  }
  return (
    <ul aria-label="Search results" aria-live="polite" className="-mx-3">
      {results.map((article) => (
        <li key={article.slug}>
          <Link to={paths.helpArticle(article.slug)} className="block rounded-md px-3 py-2.5 hover:bg-hover">
            <span className="block text-sm text-foreground">{article.title}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{article.summary}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function HelpHome(): React.JSX.Element {
  const [query, setQuery] = useState('')
  return (
    <div className="mx-auto max-w-[var(--help-layout-width)] px-5 pb-24 sm:px-8">
      <div className="mx-auto max-w-[var(--help-search-width)] pb-12 pt-14 text-center sm:pt-20">
        <h1 className="font-title text-[length:var(--text-title-size)] leading-[var(--text-title-line)] sm:text-[length:var(--help-hero-title-size)] sm:leading-[var(--help-hero-title-line)]">
          How can we help?
        </h1>
        <div className="mt-7 text-left"><SearchField query={query} onQuery={setQuery} /></div>
      </div>
      {query.trim() ? (
        <div className="mx-auto max-w-[var(--help-search-width)]"><SearchResults query={query} /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {helpArticles.map((article) => {
            const Icon = ARTICLE_ICONS[article.slug] ?? FileText
            return (
              <Link key={article.slug} to={paths.helpArticle(article.slug)}
                className="group rounded-lg border border-border p-5 transition-colors hover:bg-hover">
                <Icon className="block size-5 shrink-0 text-muted-foreground group-hover:text-foreground" strokeWidth={1.6} aria-hidden="true" />
                <h2 className="mt-4 text-sm font-section text-foreground">{article.title}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{article.summary}</p>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ArticleNavigation({ current }: { readonly current: string }): React.JSX.Element {
  return (
    <nav aria-label="Help articles">
      <ul>
        {helpArticles.map((article) => (
          <li key={article.slug}>
            <Link
              to={paths.helpArticle(article.slug)}
              aria-current={article.slug === current ? 'page' : undefined}
              className={'block truncate rounded-md px-2 py-1.5 text-sm transition-colors ' +
                (article.slug === current ? 'bg-selected font-section text-foreground' : 'text-muted-foreground hover:bg-hover hover:text-foreground')}
            >
              {article.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function HelpArticleView({ slug }: { readonly slug: string }): React.JSX.Element {
  const article = helpBySlug.get(slug)
  // A new guide opens at its top, not at the scroll position of the last one.
  useEffect(() => { window.scrollTo(0, 0) }, [slug])
  if (!article) {
    const moved = MOVED_HELP[slug]
    if (moved !== undefined) return <Navigate to={paths.helpArticle(moved)} replace />
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

  return (
    <div className="mx-auto grid max-w-[var(--help-layout-width)] px-5 sm:px-8 lg:grid-cols-[var(--help-nav-width)_minmax(0,1fr)] lg:gap-12">
      <aside className="hidden lg:block">
        <div className="sticky top-(--help-header-height) max-h-[calc(100dvh_-_var(--help-header-height))] overflow-y-auto py-8 [scrollbar-width:thin]">
          <ArticleNavigation current={slug} />
        </div>
      </aside>
      <div className="min-w-0 pb-24">
        <details className="group border-b border-border py-3 lg:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm py-1 text-sm font-section [&::-webkit-details-marker]:hidden">
            Browse articles
            <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="mt-3 max-h-[var(--help-mobile-nav-height)] overflow-y-auto">
            <ArticleNavigation current={slug} />
          </div>
        </details>
        <article className="max-w-[var(--help-article-width)] pt-8 lg:pt-10">
          <h1 className="font-title text-[length:var(--text-title-size)] leading-[var(--text-title-line)]">{article.title}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{article.summary}</p>
          <div className="pt-4"><HelpMarkdown body={article.body} /></div>
        </article>
      </div>
    </div>
  )
}

export function HelpCenterPage(): React.JSX.Element {
  const { slug } = useParams()
  return <HelpShell>{slug === undefined ? <HelpHome /> : <HelpArticleView slug={slug} />}</HelpShell>
}
