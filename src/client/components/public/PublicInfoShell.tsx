import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { ArrowUpRight } from '../../lib/icons.js'
import { paths } from '../../routes.js'

/** One quiet public frame for both documentation and release notes. */
export function PublicInfoShell({
  section,
  children,
}: {
  readonly section: 'help' | 'updates'
  readonly children: ReactNode
}): React.JSX.Element {
  return (
    <main className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[var(--help-layout-width)] flex-wrap items-center justify-between gap-x-5 gap-y-2 px-5 py-3 sm:px-8">
          <Link to={paths.help} className="flex shrink-0 items-center gap-2.5 rounded-sm text-foreground hover:text-primary">
            <img src="/dana-mark.svg" alt="" className="size-7 shrink-0" />
            <span className="font-title text-sm">Dana</span>
          </Link>
          <nav className="flex items-center gap-4 text-xs sm:gap-6" aria-label="Site navigation">
            <Link to={paths.help} aria-current={section === 'help' ? 'page' : undefined}
              className={'rounded-sm py-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary ' +
                (section === 'help' ? 'font-section text-foreground' : 'text-muted-foreground')}>
              Help Center
            </Link>
            <Link to={paths.updates} aria-current={section === 'updates' ? 'page' : undefined}
              className={'rounded-sm py-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary ' +
                (section === 'updates' ? 'font-section text-foreground' : 'text-muted-foreground')}>
              What&apos;s New
            </Link>
            <a href={paths.home} className="inline-flex items-center gap-1 rounded-sm py-2 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
              Open Dana <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </a>
          </nav>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[var(--help-layout-width)] flex-wrap items-center justify-between gap-x-5 gap-y-3 px-5 py-5 text-xs text-muted-foreground sm:px-8">
          <span className="font-section text-foreground">Dana</span>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2" aria-label="Footer">
            <a href="/privacy" className="hover:text-foreground">Privacy</a>
            <a href="/terms" className="hover:text-foreground">Terms</a>
          </nav>
        </div>
      </footer>
    </main>
  )
}
