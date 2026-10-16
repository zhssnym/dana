import { PublicInfoShell } from '../components/public/PublicInfoShell.js'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'

import { findHelp, helpBySlug, HELP_SECTIONS } from '../help/content.js'
import type { HelpArticle } from '../help/content.js'
import { HelpMarkdown } from '../help/markdown.js'
import { ArrowRight, ChevronDown, ChevronRight, Search, X } from '../lib/icons.js'
import { paths } from '../routes.js'

function SearchField({ query, onQuery, compact = false }: {
  readonly query: string
  readonly onQuery: (query: string) => void
  readonly compact?: boolean
}): React.JSX.Element {
  return (
    <div role="search" className={'flex items-center gap-2 rounded-md border border-input bg-background focus-within:border-primary ' + (compact ? 'px-2' : 'max-w-[var(--help-search-width)] px-3')}>
      <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.6} aria-hidden="true" />
      <input
        type="search"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        aria-label="Search help articles"
        placeholder="Search help articles"
        autoComplete="off"
        className={'min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground ' + (compact ? 'h-(--control-height) text-xs' : 'h-11 text-sm')}
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

// Every guide, grouped by section. The home page and the article sidebar use the same list.
function ArticleIndex({ query, current, className }: {
  readonly query: string
  readonly current?: string
  readonly className: string
}): React.JSX.Element {
  const found = useMemo(() => findHelp(query), [query])
  const groups = HELP_SECTIONS
    .map((section) => [section, found.filter((article) => article.section === section)] as const)
    .filter(([, articles]) => articles.length > 0)

  if (groups.length === 0) {
    return (
      <div className="py-6" aria-live="polite">
        <h2 className="text-sm font-section">No matching articles</h2>
        <p className="mt-1 text-xs text-muted-foreground">Try a different word.</p>
      </div>
    )
  }
  return (
    <div className={className} aria-live="polite">
      {groups.map(([section, articles]) => (
        <section key={section} className="break-inside-avoid">
          <h2 className="px-2 text-xs font-section text-muted-foreground">{section}</h2>
          <ul className="mt-1">
            {articles.map((article) => (
              <li key={article.slug}>
                <Link
                  to={paths.helpArticle(article.slug)}
                  aria-current={article.slug === current ? 'page' : undefined}
                  className={'block rounded-md px-2 py-1.5 text-sm transition-colors ' +
                    (article.slug === current ? 'bg-selected font-section text-foreground' : 'text-foreground hover:bg-hover')}
                >
                  {article.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function HelpHome(): React.JSX.Element {
  const [query, setQuery] = useState('')
  return (
    <div className="mx-auto max-w-[var(--help-layout-width)] px-5 pb-20 pt-12 sm:px-8 sm:pt-16">
      <h1 className="font-title text-[length:var(--text-title-size)] leading-[var(--text-title-line)] sm:text-[length:var(--help-hero-title-size)] sm:leading-[var(--help-hero-title-line)]">
        How can we help?
      </h1>
      <div className="mt-6"><SearchField query={query} onQuery={setQuery} /></div>
      <ArticleIndex query={query} className="-mx-2 mt-10 gap-x-8 sm:columns-2 lg:columns-3 [&>section]:mb-8" />
    </div>
  )
}

function ArticleNavigation({ current }: { readonly current: string }): React.JSX.Element {
  const [query, setQuery] = useState('')
  return (
    <nav aria-label="Help articles" className="space-y-5">
      <SearchField query={query} onQuery={setQuery} compact />
      <ArticleIndex query={query} current={current} className="space-y-5" />
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
  const related = article.related.map((related) => helpBySlug.get(related)).filter((entry): entry is HelpArticle => entry !== undefined)

  return (
    <div className="mx-auto grid max-w-[var(--help-layout-width)] gap-8 px-5 pb-20 pt-8 sm:px-8 lg:grid-cols-[var(--help-nav-width)_minmax(0,1fr)] lg:gap-12">
      <aside className="hidden min-w-0 lg:block">
        <div className="sticky top-8 max-h-[calc(100dvh_-_var(--help-nav-viewport-gap))] overflow-y-auto pb-8">
          <ArticleNavigation current={slug} />
        </div>
      </aside>
      <div className="min-w-0">
        <details className="group mb-8 border-b border-border pb-4 lg:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm py-2 text-sm font-section [&::-webkit-details-marker]:hidden">
            Browse articles
            <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="mt-4 max-h-[var(--help-mobile-nav-height)] overflow-y-auto pb-3">
            <ArticleNavigation current={slug} />
          </div>
        </details>

        <article className="max-w-[var(--help-article-width)]">
          <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-xs text-muted-foreground">
            <Link to={paths.help} className="hover:text-foreground">Help</Link>
            <ChevronRight className="size-3.5" aria-hidden="true" />
            <span>{article.section}</span>
          </nav>
          <header className="border-b border-border pb-6">
            <h1 className="font-title text-[length:var(--text-title-size)] leading-[var(--text-title-line)]">{article.title}</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{article.summary}</p>
          </header>
          <div className="pt-4"><HelpMarkdown body={article.body} /></div>
          {related.length > 0 ? (
            <section className="mt-12 border-t border-border pt-6">
              <h2 className="text-sm font-section">Related guides</h2>
              <ul className="mt-2">
                {related.map((entry) => (
                  <li key={entry.slug}>
                    <Link to={paths.helpArticle(entry.slug)} className="inline-block py-1.5 text-sm text-primary hover:underline">
                      {entry.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </article>
      </div>
    </div>
  )
}

export function HelpCenterPage(): React.JSX.Element {
  const { slug } = useParams()
  return (
    <PublicInfoShell section="help">
      {slug === undefined ? <HelpHome /> : <HelpArticleView key={slug} slug={slug} />}
    </PublicInfoShell>
  )
}
