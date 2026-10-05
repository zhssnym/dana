/*
 * A person's colour, derived from their user id (or name where no id exists), never stored. Uses the identity
 * and Shuffle palettes, already held to 3:1 in both themes.
 */
import { IDENTITY_COLOR_FALLBACK, IDENTITY_COLORS, SHUFFLE_COLORS } from './identity-colors.js'

/**
 * The identity colours less grey (grey reads as "unknown"), then Shuffle's sixteen: 23 hues. `rosterTints`
 * removes clashes within a page.
 */
const PERSON_TINTS = [
  ...IDENTITY_COLORS.filter(([name]) => name !== 'Grey').map(([, hex]) => hex),
  ...SHUFFLE_COLORS,
]

function tintSlot(key: string): number {
  let hash = 0
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) % 100000
  }
  return hash % PERSON_TINTS.length
}

/** Keyed by user id where the surface has one: a name can be shared or changed. */
export function personTint(key: string): string {
  return PERSON_TINTS[tintSlot(key)] ?? IDENTITY_COLOR_FALLBACK
}

/**
 * Tints for one page's roster with no two members in the same hue family. Each keeps their `personTint` unless
 * someone earlier in id order holds that family. Deterministic.
 */
export function rosterTints(ids: Iterable<string>): ReadonlyMap<string, string> {
  const takenSlots = new Set<number>()
  const takenFamilies = new Set<number>()
  const out = new Map<string, string>()
  const free = (slot: number, byFamily: boolean): boolean =>
    !takenSlots.has(slot) && (!byFamily || !takenFamilies.has(familyOf(slot)))
  for (const id of [...new Set(ids)].sort()) {
    const own = tintSlot(id)
    let slot = own
    for (const byFamily of [true, false]) {
      let step = 0
      while (step < PERSON_TINTS.length && !free((own + step) % PERSON_TINTS.length, byFamily)) step += 1
      if (step < PERSON_TINTS.length) {
        slot = (own + step) % PERSON_TINTS.length
        break
      }
    }
    takenSlots.add(slot)
    takenFamilies.add(familyOf(slot))
    out.set(id, PERSON_TINTS[slot] ?? IDENTITY_COLOR_FALLBACK)
  }
  return out
}

/* The eight families the 23 hues fall into, by eye. */
const HUE_FAMILIES: readonly (readonly string[])[] = [
  ['#e03e3e', '#c7254e', '#e46a50', '#c2551f'], // reds
  ['#e06a0c', '#c98100', '#a0643c'], // oranges
  ['#b08800', '#8a8f1c', '#6aa10f'], // yellows
  ['#2f9e44', '#22a06f', '#3d8b3d'], // greens
  ['#12a594', '#0f9fb8'], // teals
  ['#2f7fe0', '#1f9bd8', '#607d9b'], // blues
  ['#8b5cf6', '#5b5bd6', '#9a7ce6'], // purples
  ['#e0459a', '#c43fd6'], // pinks
]
function familyOf(slot: number): number {
  const hex = PERSON_TINTS[slot]?.toLowerCase() ?? ''
  const family = HUE_FAMILIES.findIndex((members) => members.includes(hex))
  return family === -1 ? HUE_FAMILIES.length + slot : family
}

/** The default face's paints, computed here because they name ramp steps, which stay out of `components/`. */
export interface PersonFacePaint {
  readonly ink: string
  readonly ground: string
  readonly hair: string
  readonly paper: string
}

export function personFacePaint(key: string, tint?: string): PersonFacePaint {
  const ink = tint ?? personTint(key)
  return {
    ink,
    ground: `color-mix(in oklab, ${ink} 22%, var(--color-graphite-0))`,
    hair: `color-mix(in oklab, ${ink} 55%, var(--color-graphite-950))`,
    paper: 'var(--color-graphite-0)',
  }
}

/** The tint mixed into the page ink: the swatch alone (3:1) is too faint for small text. */
export function personNameInk(tint: string): string {
  return `color-mix(in oklab, ${tint} 60%, var(--foreground))`
}

/** An independent hash for the face's shape, so two people sharing a colour still differ. FNV-1a. */
export function personShapeSeed(key: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}
