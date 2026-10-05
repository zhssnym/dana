/* A router link in the shape base-ui's `render` prop takes. */
import { Link } from 'react-router'
import type { ReactElement } from 'react'

/**
 * React Router's `Link` as base-ui's `render` prop takes it. `render` clones it
 * with the primitive's props merged in.
 */
export function routerLink(to: string): ReactElement<Record<string, unknown>> {
  return (<Link to={to} />) as unknown as ReactElement<Record<string, unknown>>
}
