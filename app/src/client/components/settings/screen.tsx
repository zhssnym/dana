/*
The frame the account's own screens share: Settings, People and Trash.

One column at the page measure, left-aligned under a plain title, so moving
between the three from the account menu changes the content and nothing else.
No mark, no cover, no card: the title says where you are.
*/
import type { ReactNode } from 'react'

export function Screen({
  title,
  description,
  actions,
  children,
}: {
  readonly title: string
  readonly description?: ReactNode
  /* At most one quiet control on the title's line. */
  readonly actions?: ReactNode
  readonly children: ReactNode
}): React.JSX.Element {
  return (
    <div className="w-full max-w-[720px] pt-2 pb-16">
      <header className="flex items-start justify-between gap-4 pb-8">
        <div className="min-w-0">
          <h1 className="text-[length:var(--text-title-size)] leading-[var(--text-title-line)] font-bold text-foreground">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0 pt-1">{actions}</div> : null}
      </header>
      {children}
    </div>
  )
}

/* A named part of a screen: a 16px heading and what it heads. */
export function ScreenSection({
  id,
  title,
  children,
}: {
  readonly id: string
  readonly title: ReactNode
  readonly children: ReactNode
}): React.JSX.Element {
  return (
    <section aria-labelledby={id} className="pb-8">
      <h2 id={id} className="pb-2 text-base font-semibold text-foreground">
        {title}
      </h2>
      {children}
    </section>
  )
}
