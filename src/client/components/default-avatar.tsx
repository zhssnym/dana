// A person's default face, generated from their user id so it is the same
// everywhere. Decorative: the name beside it is what a reader is told.
import { createContext, useContext, useMemo } from 'react'

import { personFacePaint, personShapeSeed, rosterTints } from '../parts/person-tint.js'

import { cn } from './ui/utils.js'

// Inside a page roster, faces use `rosterTints` so no two members share a hue.
const RosterTintContext = createContext<ReadonlyMap<string, string> | null>(null)

export function RosterTints({ ids, children }: { readonly ids: readonly string[]; readonly children: React.ReactNode }): React.JSX.Element {
  // Keyed by the roster's content, not the array's identity.
  const key = [...new Set(ids)].sort().join(',')
  const tints = useMemo(() => rosterTints(key === '' ? [] : key.split(',')), [key])
  return <RosterTintContext.Provider value={tints}>{children}</RosterTintContext.Provider>
}

export function usePersonTint(id: string): string {
  const roster = useContext(RosterTintContext)
  return personFacePaint(id, roster?.get(id)).ink
}

function HairBehind({ style, fill }: { style: number; fill: string }): React.JSX.Element | null {
  if (style === 3) return <path d="M8 15a8 8 0 0 1 16 0v9H8z" fill={fill} />
  if (style === 6)
    return (
      <>
        <circle cx="8.2" cy="16" r="3" fill={fill} />
        <circle cx="23.8" cy="16" r="3" fill={fill} />
      </>
    )
  return null
}

function HairTop({ style, fill }: { style: number; fill: string }): React.JSX.Element | null {
  switch (style) {
    case 0: // short crop
      return <path d="M9 14a7 7 0 0 1 14 0c-2-2.6-4.6-3.6-7-3.6S11 11.4 9 14z" fill={fill} />
    case 1: // side fringe
      return <path d="M9 13.6a7 7 0 0 1 14 0c-3.2 0-6-1.4-7.6-3.8C14 12.2 11.6 13.6 9 13.6z" fill={fill} />
    case 2: // bun
      return (
        <>
          <circle cx="16" cy="6" r="3" fill={fill} />
          <path d="M9 14a7 7 0 0 1 14 0c-2-2.6-4.6-3.6-7-3.6S11 11.4 9 14z" fill={fill} />
        </>
      )
    case 3: // long, fringe over the brow
      return <path d="M9 14a7 7 0 0 1 14 0c-1.6-1.8-4-3.2-7-3.2S10.6 12.2 9 14z" fill={fill} />
    case 4: // curls
      return (
        <>
          <circle cx="10.2" cy="11.4" r="2.8" fill={fill} />
          <circle cx="13" cy="8.6" r="2.8" fill={fill} />
          <circle cx="16" cy="7.6" r="2.8" fill={fill} />
          <circle cx="19" cy="8.6" r="2.8" fill={fill} />
          <circle cx="21.8" cy="11.4" r="2.8" fill={fill} />
        </>
      )
    case 5: // beanie
      return (
        <>
          <circle cx="16" cy="5.6" r="1.9" fill={fill} />
          <path d="M8.6 13a7.4 7.4 0 0 1 14.8 0z" fill={fill} />
        </>
      )
    case 6: // pigtails (the tails are behind), parted crown
      return <path d="M9 14a7 7 0 0 1 14 0c-2.4-1.6-4.6-2.8-7-3.2-2.4.4-4.6 1.6-7 3.2z" fill={fill} />
    default: // swoop
      return <path d="M9 14c0-5 3.4-7.6 7-7.6 4.4 0 7 3 7 7.2-3-3.4-8-4-14 .4z" fill={fill} />
  }
}

export function DefaultAvatar({
  id,
  name,
  className,
}: {
  readonly id?: string | null | undefined
  /** Used only where no id is held. */
  readonly name: string
  readonly className?: string
}): React.JSX.Element {
  const key = id ?? name
  const roster = useContext(RosterTintContext)
  const paint = personFacePaint(key, id == null ? undefined : roster?.get(id))
  const seed = personShapeSeed(key)
  const hair = seed % 8
  const happy = Math.floor(seed / 8) % 2 === 1
  const glasses = Math.floor(seed / 16) % 4 === 0
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className={cn('size-full', className)}
      data-slot="default-avatar"
    >
      <rect width="32" height="32" fill={paint.ground} />
      <HairBehind style={hair} fill={paint.hair} />
      <path d="M4 33c0-6.6 5.4-10.4 12-10.4S28 26.4 28 33z" fill={paint.ink} />
      <circle cx="16" cy="14.4" r="7" fill={paint.ink} />
      <HairTop style={hair} fill={paint.hair} />
      {happy ? (
        <g fill="none" stroke={paint.paper} strokeWidth="1.3" strokeLinecap="round">
          <path d="M12.2 15.6q1.1-1.2 2.2 0M17.6 15.6q1.1-1.2 2.2 0" />
          <path d="M13.8 18q2.2 1.8 4.4 0" />
        </g>
      ) : (
        <>
          <circle cx="13.3" cy="15.4" r="1.15" fill={paint.paper} />
          <circle cx="18.7" cy="15.4" r="1.15" fill={paint.paper} />
          <path
            d="M14 18.2q2 1.5 4 0"
            fill="none"
            stroke={paint.paper}
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </>
      )}
      {glasses ? (
        <g fill="none" stroke={paint.hair} strokeWidth="0.9">
          <circle cx="13.3" cy="15.3" r="2.1" />
          <circle cx="18.7" cy="15.3" r="2.1" />
          <path d="M15.4 15.3h1.2" />
        </g>
      ) : null}
    </svg>
  )
}
