// Fractional index keys for `position`: base-62 strings with a key between any two, so a drop writes one row.
// Integer-part keys stop appends from growing a digit each time (the `fractional-indexing` algorithm).
// The column is COLLATE "C", so JavaScript and the database sort keys the same way. Ties break by id.

/** Base 62 in ASCII order, which is C collation's order. */
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

/** The integer part's length, encoded by its head: `a` opens two characters, `b` three; capitals run downwards. */
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

/** A stored key needs a readable integer part and a fraction not ending in the least digit. */
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

/** A fractional part strictly between `a` and `b`; empty `a` is no lower bound and null `b` no upper one. */
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
  // Adjacent leading digits leave no room here, so the answer is one place deeper.
  if (b !== null && b.length > 1) return b.slice(0, 1)
  return digit(low) + midpoint(a.slice(1), null)
}

/** The key between two neighbours, either of which may be absent at a list end. */
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

/** `count` ascending keys, built by appending so they stay short. */
export function initialKeys(count: number): string[] {
  const keys: string[] = []
  let previous: string | null = null
  for (let index = 0; index < count; index += 1) {
    previous = keyBetween(previous, null)
    keys.push(previous)
  }
  return keys
}
