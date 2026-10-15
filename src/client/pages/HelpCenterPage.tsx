import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'

import { HELP_SECTIONS, findHelp, helpArticles, helpBySlug } from '../help/content.js'
import { HelpMarkdown } from '../help/markdown.js'
import { paths } from '../routes.js'

function ArticleLink({ slug, compact = false }: { readonly slug: string; readonly compact?: boolean }): React.JSX.Element | null {
  const article = helpBySlug.get(slug)
  if (article === undefined) return null
  return (
    <Link to={paths.helpArticle(article.slug)} className="group block rounded-md border border-border px-4 py-3 hover:bg-hover focus-visible:outline-2 focus-visible:outline-primary">
      <span className="block font-section text-sm group-hover:text-primary">{article.title}</span>
      {!compact ? <span className="mt-1 block text-xs leading-5 text-muted-foreground">{article.summary}</span> : null}
    </Link>
  )
}

function HelpHome(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const results = useMemo(() => findHelp(query), [query])
  const searching = query.trim().length > 0
  return (
    <>
      <section className="py-10 sm:py-14">
        <h1 className="font-title text-[length:var(--text-title-size)] leading-[var(--text-title-line)]">How can we help?</h1>
        <p className="mt-3 text-sm text-muted-foreground">Clear guides for using Dana.</p>
        <label className="mt-7 block max-w-2xl">
          <span className="sr-only">Search help articles</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="Search help articles" autoComplete="off"
            className="w-full rounded-md border border-border bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary" />
        </label>
      </section>
      {searching ? (
        <section aria-live="polite" className="pb-16">
          <h2 className="mb-4 font-section text-sm">{results.length === 0 ? 'No matching articles' : 'Search results (' + String(results.length) + ')'}</h2>
          {results.length === 0 ? <p className="text-sm text-muted-foreground">Try a different word, such as Calendar, task, or teammate.</p> : null}
          <div className="grid gap-2 sm:grid-cols-2">{results.map((article) => <ArticleLink key={article.slug} slug={article.slug} />)}</div>
        </section>
      ) : (
        <div className="space-y-10 pb-20">
          {HELP_SECTIONS.map((section) => {
            const articles = helpArticles.filter((article) => article.section === section)
            if (articles.length === 0) return null
            return (
              <section key={section}>
                <h2 className="mb-4 font-title text-[length:var(--text-h3-size)] leading-[var(--text-h3-line)]">{section}</h2>
                <div className="grid gap-2 sm:grid-cols-2">{articles.map((article) => <ArticleLink key={article.slug} slug={article.slug} />)}</div>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}

function HelpArticleView({ slug }: { readonly slug: string }): React.JSX.Element {
  const article = helpBySlug.get(slug)
  if (article === undefined) {
    return <section className="py-16"><h1 className="font-title text-[length:var(--text-title-size)]">Article not found</h1><p className="mt-3 text-sm text-muted-foreground">This guide may have moved.</p><Link to={paths.help} className="mt-5 inline-block text-sm text-primary underline">Browse help articles</Link></section>
  }
  return (
    <div className="grid gap-8 py-10 lg:grid-cols-4 lg:gap-12">
      <aside className="lg:col-span-1">
        <Link to={paths.help} className="text-sm text-muted-foreground hover:text-foreground">← All help articles</Link>
        <p className="mt-5 text-xs font-section text-muted-foreground">{article.section}</p>
        <nav className="mt-3 space-y-2" aria-label="More help articles">
          {helpArticles.filter((entry) => entry.section === article.section && entry.slug !== slug).slice(0, 6).map((entry) => (
            <Link key={entry.slug} to={paths.helpArticle(entry.slug)} className="block text-sm text-muted-foreground hover:text-foreground">{entry.title}</Link>
          ))}
        </nav>
      </aside>
      <article className="min-w-0 lg:col-span-3">
        <header className="border-b border-border pb-6">
          <h1 className="font-title text-[length:var(--text-title-size)] leading-[var(--text-title-line)]">{article.title}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{article.summary}</p>
        </header>
        <div className="pt-4"><HelpMarkdown body={article.body}/></div>
        {article.related.length > 0 ? (
          <section className="mt-12 border-t border-border pt-6">
            <h2 className="mb-3 font-section text-sm">Related guides</h2>
            <div className="grid gap-2 sm:grid-cols-2">{article.related.map((related) => <ArticleLink key={related} slug={related} compact />)}</div>
          </section>
        ) : null}
      </article>
    </div>
  )
}

export function HelpCenterPage(): React.JSX.Element {
  const { slug } = useParams()
  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link to={paths.help} className="font-title text-sm">Dana <span className="ml-2 font-normal text-muted-foreground">/ Help</span></Link>
          <a href={paths.home} className="text-sm text-muted-foreground hover:text-foreground">Open Dana ↗</a>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-5 sm:px-8">{slug === undefined ? <HelpHome /> : <HelpArticleView slug={slug} />}</div>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-3 px-5 py-6 text-xs text-muted-foreground sm:px-8">
          <span>Dana Help</span>
          <span><a href="/privacy" className="hover:text-foreground">Privacy</a> · <a href="/terms" className="hover:text-foreground">Terms</a></span>
        </div>
      </footer>
    </main>
  )
}
