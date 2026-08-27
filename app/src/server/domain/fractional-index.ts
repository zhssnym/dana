/*
The key arithmetic behind 4.5's `position` (RFC 0005 change control item 44,
B4): a string of base-62 digits ordered lexicographically, with a key
computable strictly between any two.

**Why a string and not a number.** Item 44's own words: "a plain integer
renumbers every row below a drop; the shape to use is a fractional index,
which is what Notion, Linear and Figma do". A drop writes one row here,
whatever the list's length, which is also what makes two people dragging one
shared list cheap: they touch different rows and never renumber each other's.

**Why the key has an integer part.** The obvious midpoint alone is not
enough, and the failure is not exotic: every drag to the bottom of a list
appends after the current last key, and a plain midpoint grows the key by a
digit each time, so a folder somebody rearranges often walks into a key
nothing can be appended after. The published shape solves it by splitting a
key into an integer part, whose first character encodes its own length, and a
fractional part; appending increments the integer part instead of extending
it, and prepending decrements it. This is the jitterless
`generateKeyBetween` of the MIT-licensed `fractional-indexing` package,
re-expressed here in TypeScript rather than added as a dependency, because it
is a hundred lines of arithmetic that this repository's own tests can hold
and a supply-chain surface it does not need. `fractional-index.test.ts` is
those tests, and the append and prepend cases are there because they are the
ones the naive version fails.

**Ties are expected and are not this module's problem.** Two placements into
one gap compute the same key by construction. Section 6's preamble ends every
order with id, so the tie resolves to one sequence both readers see, which is
the answer item 44's concurrency question wanted.

**Collation.** The column is `COLLATE "C"`, so the order this module reasons
about (JavaScript's comparison, by code unit) and the order the database
sorts by are the same order in every database Dana runs on. The alphabet is
ASCII digits and letters, whose code units and bytes agree, and 4.5's
`tasks_position_format_check` refuses anything outside it.
*/

/** Base 62, ascending in byte order: digits, then capitals, then lowercase,
 * which is ASCII's own sequence and therefore C collation's. */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

const ZERO = DIGITS[0] as string
const LAST = DIGITS[DIGITS.length - 1] as string

function digit(index: number): string {
  const found = DIGITS[index]
  if (found === undefined) throw new Error(`no digit at ${String(index)}`)
  return found
}

function charAt(key: string, index: number): string {
  return key[index] ?? ZERO
}

/**
 * How long the integer part starting with `head` is, which is what the head
 * character encodes: `a` opens a two-character integer, `b` a three, and so
 * on up to `z`, with the capitals running the same scale downwards for keys
 * below the first one anybody wrote.
 */
function integerLength(head: string): number {
  if (head >= 'a' && head <= 'z') {
    return head.charCodeAt(0) - 'a'.charCodeAt(0) + 2
  }
  if (head >= 'A' && head <= 'Z') {
    return 'Z'.charCodeAt(0) - head.charCodeAt(0) + 2
  }
  throw new Error(`invalid order key head: ${head}`)
}

function integerPartOf(key: string): string {
  const length = integerLength(charAt(key, 0))
  if (length > key.length) throw new Error(`invalid order key: ${key}`)
  return key.slice(0, length)
}

function requireInteger(part: string): void {
  if (part.length !== integerLength(charAt(part, 0))) {
    throw new Error(`invalid integer part of order key: ${part}`)
  }
}

/** The invariant a stored key must satisfy: a readable integer part, and a
 * fractional part that does not end in the least digit, which is what leaves
 * room below every key inside its own prefix. */
function requireKey(key: string): void {
  if (key === `A${ZERO.repeat(26)}`) {
    throw new Error(`invalid order key: ${key}`)
  }
  const integer = integerPartOf(key)
  if (key.slice(integer.length).endsWith(ZERO)) {
    throw new Error(`invalid order key: ${key}`)
  }
}

function incrementInteger(part: string): string | null {
  requireInteger(part)
  const head = charAt(part, 0)
  const body = part.slice(1).split('')
  let carry = true
  for (let index = body.length - 1; carry && index >= 0; index -= 1) {
    const next = DIGITS.indexOf(body[index] as string) + 1
    if (next === DIGITS.length) {
      body[index] = ZERO
    } else {
      body[index] = digit(next)
      carry = false
    }
  }
  if (!carry) return head + body.join('')
  if (head === 'Z') return `a${ZERO}`
  if (head === 'z') return null
  const nextHead = String.fromCharCode(head.charCodeAt(0) + 1)
  if (nextHead > 'a') body.push(ZERO)
  else body.pop()
  return nextHead + body.join('')
}

function decrementInteger(part: string): string | null {
  requireInteger(part)
  const head = charAt(part, 0)
  const body = part.slice(1).split('')
  let borrow = true
  for (let index = body.length - 1; borrow && index >= 0; index -= 1) {
    const next = DIGITS.indexOf(body[index] as string) - 1
    if (next === -1) {
      body[index] = LAST
    } else {
      body[index] = digit(next)
      borrow = false
    }
  }
  if (!borrow) return head + body.join('')
  if (head === 'a') return `Z${LAST}`
  if (head === 'A') return null
  const nextHead = String.fromCharCode(head.charCodeAt(0) - 1)
  if (nextHead < 'Z') body.push(LAST)
  else body.pop()
  return nextHead + body.join('')
}

/**
 * A fractional part strictly between `a` and `b`, where the empty string is
 * no lower bound and null is no upper one. Shared prefixes are peeled off,
 * then either a digit exists between the two leading digits or the recursion
 * descends one place.
 */
function midpoint(a: string, b: string | null): string {
  if (b !== null && a >= b) {
    throw new Error(`order keys are not in sequence: ${a} is not below ${b}`)
  }
  if (a.endsWith(ZERO) || (b !== null && b.endsWith(ZERO))) {
    throw new Error('an order key never ends in the least digit (4.5)')
  }
  if (b !== null) {
    let shared = 0
    while (charAt(a, shared) === b[shared]) shared += 1
    if (shared > 0) {
      return b.slice(0, shared) + midpoint(a.slice(shared), b.slice(shared))
    }
  }
  const low = a === '' ? 0 : DIGITS.indexOf(charAt(a, 0))
  const high = b === null ? DIGITS.length : DIGITS.indexOf(charAt(b, 0))
  if (high - low > 1) return digit(Math.round(0.5 * (low + high)))
  // The two leading digits are adjacent, so nothing fits between them at
  // this place and the answer lives one place deeper.
  if (b !== null && b.length > 1) return b.slice(0, 1)
  return digit(low) + midpoint(a.slice(1), null)
}

/**
 * The key for a task dropped between two neighbours, either of which may be
 * absent because the drop was at an end of the list.
 *
 * Both absent is the one-row list, which has one place to be.
 */
export function keyBetween(
  lower: string | null,
  upper: string | null,
): string {
  if (lower !== null) requireKey(lower)
  if (upper !== null) requireKey(upper)
  if (lower !== null && upper !== null && lower >= upper) {
    throw new Error(
      `order keys are not in sequence: ${lower} is not below ${upper}`,
    )
  }
  if (lower === null) {
    if (upper === null) return `a${ZERO}`
    const integer = integerPartOf(upper)
    const fraction = upper.slice(integer.length)
    if (integer === `A${ZERO.repeat(26)}`) return integer + midpoint('', fraction)
    if (integer < upper) return integer
    const decremented = decrementInteger(integer)
    if (decremented === null) throw new Error('no room below the first key')
    return decremented
  }
  const lowInteger = integerPartOf(lower)
  const lowFraction = lower.slice(lowInteger.length)
  if (upper === null) {
    const incremented = incrementInteger(lowInteger)
    return incremented === null
      ? lowInteger + midpoint(lowFraction, null)
      : incremented
  }
  const highInteger = integerPartOf(upper)
  const highFraction = upper.slice(highInteger.length)
  if (lowInteger === highInteger) {
    return lowInteger + midpoint(lowFraction, highFraction)
  }
  const incremented = incrementInteger(lowInteger)
  if (incremented === null) throw new Error('no room above the last key')
  if (incremented < upper) return incremented
  return lowInteger + midpoint(lowFraction, null)
}

/**
 * `count` keys in ascending order, for the pass that gives a folder's list
 * its first arrangement.
 *
 * Built by appending, which is the operation the integer part makes cheap:
 * a thousand keys stay three characters long, where a plain midpoint would
 * have grown one a digit at a time.
 */
export function initialKeys(count: number): string[] {
  const keys: string[] = []
  let previous: string | null = null
  for (let index = 0; index < count; index += 1) {
    previous = keyBetween(previous, null)
    keys.push(previous)
  }
  return keys
}
