import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

import { Button } from '../../ui/button.js'
import { CanvasHydrationError } from './adapters.js'

interface Props {
  readonly children: ReactNode
}

interface State {
  readonly failure: unknown
}

/** Keep a malformed document inside the canvas instead of taking down React's root. */
export class CanvasErrorBoundary extends Component<Props, State> {
  override state: State = { failure: null }

  static getDerivedStateFromError(failure: unknown): State {
    return { failure }
  }

  override componentDidCatch(failure: Error, info: ErrorInfo): void {
    console.error('The folder canvas could not render.', failure, info.componentStack)
  }

  override render(): ReactNode {
    if (this.state.failure === null) return this.props.children

    const message = this.state.failure instanceof CanvasHydrationError
      ? this.state.failure.message
      : 'The writing canvas could not be opened. Reload the page and try again.'

    return <section role="alert" className="rounded-md border border-border bg-muted/30 p-4">
      <p className="font-medium text-foreground">Writing could not be opened</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <Button className="mt-3" variant="outline" onClick={() => globalThis.location.reload()}>Reload page</Button>
    </section>
  }
}
