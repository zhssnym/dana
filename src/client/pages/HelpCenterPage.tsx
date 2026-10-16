import { PublicInfoShell } from '../components/public/PublicInfoShell.js'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'

import { findHelp, helpArticles, helpBySlug, HELP_SECTIONS } from '../help/content.js'
import type { HelpArticle } from '../help/content.js'
import { HelpMarkdown } from '../help/markdown.js'
import { ArrowRight, ChevronDown, ChevronRight, Search, X } from '../lib/icons.js'
import { paths } from '../routes.js'

// Sections fold like a Notion sidebar. The section of the open article starts open.
function HelpSidebar({ current }: { readonly current?: string }): React.JSX.Element {
  const currentSection = current === undefined ? undefined : helpBySlug.get(current)?.section
  return (
    <nav aria-label="Help articles">
      <Link to={paths.help} className="block px-2 pb-2 text-xs text-muted-foreground hover:text-foreground">Help Center</Link>
      {HELP_SECTIONS.map((section) => (
        <details key={section} open={section === currentSection} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-hover [&::-webkit-details-marker]:hidden">
            {section}
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
          </summary>
          <ul className="mb-1">
            {helpArticles.filter((article) => article.section === section).map((article) => (
              <li key={article.slug}>
                <Link
                  to={paths.helpArticle(article.slug)}
                  aria-current={article.slug === current ? 'page' : undefined}
                  className={'block rounded-md py-1.5 pl-5 pr-2 text-sm transition-colors ' +
                    (article.slug === current ? 'bg-selected text-foreground' : 'text-muted-foreground hover:bg-hover hover:text-foreground')}
                >
                  {article.title}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </nav>
  )
}

function HelpLayout({ current, children }: { readonly current?: string; readonly children: ReactNode }): React.JSX.Element {
  return (
    <div className="mx-auto grid w-full max-w-[var(--help-layout-width)] flex-1 content-start px-5 sm:px-8 lg:content-stretch lg:grid-cols-[var(--help-nav-width)_minmax(0,1fr)] lg:gap-12">
      <aside className="hidden min-w-0 border-r border-border pr-4 lg:block">
        <div className="sticky top-0 max-h-[calc(100dvh_-_var(--help-nav-viewport-gap))] overflow-y-auto py-8">
          <HelpSidebar current={current} />
        </div>
      </aside>
      <div className="min-w-0 pb-20">
        <details className="group border-b border-border py-3 lg:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm py-1 text-sm font-section [&::-webkit-details-marker]:hidden">
            Browse articles
            <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="mt-3 max-h-[var(--help-mobile-nav-height)] overflow-y-auto">
            <HelpSidebar current={current} />
          </div>
        </details>
        {children}
      </div>
    </div>
  )
}

function HelpHome(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const results = useMemo(() => findHelp(query), [query])
  const searching = query.trim().length > 0

  return (
    <HelpLayout>
      <div className="mx-auto max-w-[var(--help-search-width)] pt-12 sm:pt-20">
        <h1 className="text-center font-title text-[length:var(--text-title-size)] leading-[var(--text-title-line)] sm:text-[length:var(--help-hero-title-size)] sm:leading-[var(--help-hero-title-line)]">
          How can we help?
        </h1>
        <div role="search" className="mt-6 flex items-center gap-2 rounded-md border border-input bg-background px-3 focus-within:border-primary">
          <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.6} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search help articles"
            placeholder="Search help articles"
            autoComplete="off"
            className="h-11 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
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
        {searching ? (
          <div className="mt-6" aria-live="polite">
            {results.length === 0 ? (
              <>
                <h2 className="text-sm font-section">No matching articles</h2>
                <p className="mt-1 text-xs text-muted-foreground">Try a different word.</p>
              </>
            ) : (
              <ul>
                {results.map((article) => (
                  <li key={article.slug}>
                    <Link to={paths.helpArticle(article.slug)} className="block rounded-md px-3 py-2.5 hover:bg-hover">
                      <span className="block text-sm text-foreground">{article.title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{article.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </HelpLayout>
  )
}

function HelpArticleView({ slug }: { readonly slug: string }): React.JSX.Element {
  const article = helpBySlug.get(slug)
  if (!article) {
    return (
      <HelpLayout>
        <div className="pt-12">
          <h1 className="font-title text-[length:var(--text-title-size)]">Article not found</h1>
          <p className="mt-3 text-sm text-muted-foreground">This guide may have moved.</p>
          <Link to={paths.help} className="mt-6 inline-flex items-center gap-2 text-sm text-primary hover:underline">
            <ArrowRight className="size-4 rotate-180" aria-hidden="true" /> Browse help articles
          </Link>
        </div>
      </HelpLayout>
    )
  }
  const related = article.related.map((related) => helpBySlug.get(related)).filter((entry): entry is HelpArticle => entry !== undefined)

  return (
    <HelpLayout current={slug}>
      <article className="max-w-[var(--help-article-width)] pt-8">
        <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-xs text-muted-foreground">
          <Link to={paths.help} className="hover:text-foreground">Help</Link>
          <ChevronRight className="size-3.5" aria-hidden="true" />
          <span>{article.section}</span>
        </nav>
        <h1 className="font-title text-[length:var(--text-title-size)] leading-[var(--text-title-line)]">{article.title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{article.summary}</p>
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
    </HelpLayout>
  )
}

export function HelpCenterPage(): React.JSX.Element {
  const { slug } = useParams()
  return (
    <PublicInfoShell section="help">
      {slug === undefined ? <HelpHome /> : <HelpArticleView slug={slug} />}
    </PublicInfoShell>
  )
}
