import { Link, useParams } from 'react-router'

import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, CheckCircle2, Megaphone, RefreshCw } from '../lib/icons.js'
import { paths } from '../routes.js'
import { formatUpdateDay, productUpdates, updateById } from '../updates/index.js'
import type { ProductUpdate, UpdateKind } from '../updates/index.js'

const TYPE_LABEL: Record<UpdateKind, string> = {
  feature: 'New',
  improvement: 'Improved',
  fix: 'Fixed',
}
const TYPE_ICON = { feature: Megaphone, improvement: RefreshCw, fix: CheckCircle2 }

function UpdateMark({ kind }: { readonly kind: UpdateKind }): React.JSX.Element {
  const Icon = TYPE_ICON[kind]
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
      <Icon className="size-4" strokeWidth={1.6} aria-hidden="true" />
    </span>
  )
}

function UpdateRow({ item }: { readonly item: ProductUpdate }): React.JSX.Element {
  return (
    <Link
      to={paths.updateArticle(item.id)}
      className="group flex items-start gap-4 border-b border-border py-5 text-foreground focus-visible:rounded-sm"
    >
      <UpdateMark kind={item.kind} />
      <span className="min-w-0 flex-1">
        <span className="block font-section text-sm group-hover:text-primary">{item.title}</span>
        <span className="mt-1.5 block text-sm leading-6 text-muted-foreground">{item.summary}</span>
        <span className="mt-2 block text-xs text-muted-foreground">{TYPE_LABEL[item.kind]}</span>
      </span>
      <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
    </Link>
  )
}

function UpdatesHome(): React.JSX.Element {
  const newEntries = productUpdates.filter((item) => !item.historical)
  const historical = productUpdates.filter((item) => item.historical)
  const days = [...new Set(newEntries.map((item) => item.publishedAt))]
  return (
    <div className="mx-auto max-w-[var(--help-layout-width)] px-5 pb-20 sm:px-8">
      <header className="border-b border-border py-12 sm:py-16">
        <h1 className="font-title text-[length:var(--text-title-size)] leading-[var(--text-title-line)] sm:text-[length:var(--help-hero-title-size)] sm:leading-[var(--help-hero-title-line)]">
          What&apos;s new
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">A record of what has changed in Dana.</p>
      </header>
      <div className="grid gap-12 pt-10 lg:grid-cols-[minmax(0,1fr)_var(--help-suggestions-width)]">
        <div className="min-w-0">
          {days.length === 0 ? (
            <p className="border-b border-border pb-7 text-sm text-muted-foreground">
              New updates will appear here after they are released.
            </p>
          ) : days.map((day) => (
            <section key={day} className="mb-12" aria-labelledby={'updates-' + day}>
              <h2 id={'updates-' + day} className="font-title text-[length:var(--text-h2-size)] leading-[var(--text-h2-line)]">
                {formatUpdateDay(day)}
              </h2>
              <div className="mt-3">{newEntries.filter((item) => item.publishedAt === day).map((item) => <UpdateRow item={item} key={item.id} />)}</div>
            </section>
          ))}
          {historical.length > 0 ? (
            <section aria-labelledby="earlier-updates">
              <h2 id="earlier-updates" className="font-title text-[length:var(--text-h2-size)] leading-[var(--text-h2-line)]">Earlier improvements</h2>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">A selection of changes released before this update history began.</p>
              <div className="mt-3">{historical.map((item) => <UpdateRow key={item.id} item={item} />)}</div>
            </section>
          ) : null}
        </div>
        <aside className="space-y-6 lg:border-l lg:border-border lg:pl-8" aria-label="More about Dana">
          <section>
            <h2 className="text-sm font-section">Need help using Dana?</h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Find guides for tasks, writing, planning, and collaboration.</p>
            <Link to={paths.help} className="mt-4 inline-flex items-center gap-2 text-sm text-primary hover:underline">
              Browse the Help Center <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </section>
        </aside>
      </div>
    </div>
  )
}

function UpdateDetail({ id }: { readonly id: string }): React.JSX.Element {
  const item = updateById.get(id)
  if (!item) {
    return <div className="mx-auto max-w-[var(--help-article-width)] px-5 py-16 sm:px-8">
      <h1 className="font-title text-[length:var(--text-title-size)]">Update not found</h1>
      <p className="mt-3 text-sm text-muted-foreground">This update may have moved.</p>
      <Link to={paths.updates} className="mt-5 inline-flex items-center gap-2 text-sm text-primary hover:underline">View all updates <ArrowRight className="size-4" aria-hidden="true" /></Link>
    </div>
  }
  return (
    <article className="mx-auto max-w-[var(--help-article-width)] px-5 pb-20 pt-10 sm:px-8">
      <nav aria-label="Breadcrumb">
        <Link to={paths.updates} className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          All updates
        </Link>
      </nav>
      <div className="mt-9 flex items-center gap-2 text-xs text-muted-foreground">
        <UpdateMark kind={item.kind} />
        <span>{TYPE_LABEL[item.kind]}</span>
        {item.historical ? <span>· Previously shipped</span> : <span>· {formatUpdateDay(item.publishedAt)}</span>}
      </div>
      <h1 className="mt-5 font-title text-[length:var(--text-title-size)] leading-[var(--text-title-line)]">{item.title}</h1>
      <p className="mt-6 text-sm leading-7 text-foreground">{item.summary}</p>
      <section className="mt-12 border-t border-border pt-6">
        <h2 className="text-xs font-section text-muted-foreground">More information</h2>
        <a
          href={'https://github.com/zhssnym/dana/pull/' + item.pr}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          View the change on GitHub <ArrowUpRight className="size-4" aria-hidden="true" />
        </a>
      </section>
      <Link to={paths.updates} className="mt-14 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to all updates
      </Link>
    </article>
  )
}

export function UpdatesPage(): React.JSX.Element {
  const { id } = useParams()
  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[var(--help-layout-width)] items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link to={paths.updates} className="flex min-w-0 items-center gap-3 text-sm font-title text-foreground hover:text-primary">
            <img src="/dana-mark.svg" alt="" className="size-7 shrink-0" />
            <span>Dana <span className="ml-1 font-normal text-muted-foreground">Updates</span></span>
          </Link>
          <nav className="flex shrink-0 items-center gap-5 text-xs text-muted-foreground" aria-label="Site navigation">
            <Link to={paths.help} className="inline-flex items-center gap-1.5 hover:text-foreground">
              <BookOpen className="size-4" aria-hidden="true" /> Help
            </Link>
            <a href={paths.home} className="inline-flex items-center gap-1.5 hover:text-foreground">
              Open Dana <ArrowUpRight className="size-4" aria-hidden="true" />
            </a>
          </nav>
        </div>
      </header>
      {id ? <UpdateDetail id={id} /> : <UpdatesHome />}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[var(--help-layout-width)] flex-wrap justify-between gap-3 px-5 py-6 text-xs text-muted-foreground sm:px-8">
          <span>Dana Updates</span>
          <div className="flex items-center gap-4">
            <Link to={paths.help} className="hover:text-foreground">Help Center</Link>
            <a href="/privacy" className="hover:text-foreground">Privacy</a>
            <a href="/terms" className="hover:text-foreground">Terms</a>
          </div>
        </div>
      </footer>
    </main>
  )
}
