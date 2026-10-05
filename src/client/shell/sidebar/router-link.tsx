import { Link } from 'react-router'
import type { ReactElement } from 'react'

/** For base-ui's `render` prop, which clones it with the primitive's props merged in. */
export function routerLink(to: string): ReactElement<Record<string, unknown>> {
  return (<Link to={to} />) as unknown as ReactElement<Record<string, unknown>>
}
