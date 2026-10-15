import { Link, useParams } from 'react-router'

import { PublicInfoShell } from '../components/public/PublicInfoShell.js'
import { ArrowLeft, ArrowRight, ArrowUpRight, CheckCircle2, Megaphone, RefreshCw } from '../lib/icons.js'
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
    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
      <Icon className="size-4" strokeWidth={1.6} aria-hidden="true" />
    </span>
  )
}

function UpdateRow({ item }: { readonly item: ProductUpdate }): React.JSX.Element {
  return (
    <Link
      to={paths.updateArticle(item.id)}
      className="group flex items-start gap-4 rounded-md px-3 py-4 text-foreground transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-primary"
    >
      <UpdateMark kind={item.kind} />
      <span className="min-w-0 flex-1">
        <span className="block font-section text-sm group-hover:text-primary">{item.title}</span>
        <span className="mt-1.5 block text-sm leading-6 text-muted-foreground">{item.summary}</span>
        <span className="mt-2 block text-xs text-muted-foreground">
          {TYPE_LABEL[item.kind]}
          {!item.historical ? ' · ' + formatUpdateDay(item.publishedAt) : ''}
        </span>
      </span>
      <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
    </Link>
  )
}

function UpdatesHome(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-[var(--help-layout-width)] px-5 pb-20 sm:px-8">
      <header className="py-12 sm:py-16">
        <h1 className="font-title text-[length:var(--text-title-size)] leading-[var(--text-title-line)] sm:text-[length:var(--help-hero-title-size)] sm:leading-[var(--help-hero-title-line)]">
          What&apos;s New
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Features, improvements, and fixes across Dana.
        </p>
      </header>
      <section className="max-w-[var(--help-article-width)]" aria-label="Recent updates">
        <div className="-mx-3 space-y-1">
          {productUpdates.map((item) => <UpdateRow key={item.id} item={item} />)}
        </div>
      </section>
    </div>
  )
}

function UpdateDetail({ id }: { readonly id: string }): React.JSX.Element {
  const item = updateById.get(id)
  if (!item) {
    return (
      <div className="mx-auto max-w-[var(--help-article-width)] px-5 py-16 sm:px-8">
        <h1 className="font-title text-[length:var(--text-title-size)]">Update not found</h1>
        <p className="mt-3 text-sm text-muted-foreground">This article is unavailable.</p>
        <Link to={paths.updates} className="mt-6 inline-flex items-center gap-2 text-sm text-primary hover:underline">
          View all updates <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    )
  }
  const Icon = TYPE_ICON[item.kind]
  return (
    <article className="mx-auto max-w-[var(--help-article-width)] px-5 pb-16 pt-9 sm:px-8 sm:pt-12">
      <nav aria-label="Breadcrumb">
        <Link to={paths.updates}
          className="inline-flex items-center gap-2 rounded-sm py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
          <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
          What&apos;s New
        </Link>
      </nav>

      <header className="mt-9 sm:mt-11">
        <p className="flex items-center gap-2 text-xs font-section text-muted-foreground">
          <Icon className="size-4 shrink-0" strokeWidth={1.6} aria-hidden="true" />
          <span>{TYPE_LABEL[item.kind]}</span>
          {!item.historical ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{formatUpdateDay(item.publishedAt)}</span>
            </>
          ) : null}
        </p>
        <h1 className="mt-4 font-title text-[length:var(--text-title-size)] leading-[var(--text-title-line)]">
          {item.title}
        </h1>
        <p className="mt-5 text-sm leading-7 text-muted-foreground">{item.summary}</p>
      </header>

      <a
        href={'https://github.com/zhssnym/dana/pull/' + item.pr}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-8 inline-flex items-center gap-2 rounded-sm py-1 text-xs text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
      >
        Technical details <ArrowUpRight className="size-4" aria-hidden="true" />
      </a>
    </article>
  )
}

export function UpdatesPage(): React.JSX.Element {
  const { id } = useParams()
  return (
    <PublicInfoShell section="updates">
      {id ? <UpdateDetail id={id} /> : <UpdatesHome />}
    </PublicInfoShell>
  )
}
