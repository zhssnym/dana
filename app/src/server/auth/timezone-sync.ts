/*
8.1's alias rule, which needs one predicate the shared validator does not
provide: whether two identifiers name the same zone. "US/Eastern" and
"America/New_York" are one zone, so a login reporting the alias of a stored
canonical name must not write over it, and a plain string comparison would.

Intl resolves an identifier to its canonical tzdb name, which is exactly the
question being asked, and it also folds the case-insensitivity 11.15 records.
Anything that fails to resolve is not a zone at all and cannot be the same
zone as anything; the caller has already refused it through the shared
validator by the time it gets here.
*/
export function canonicalZone(value: string): string | null {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions()
      .timeZone
  } catch {
    return null
  }
}

export function sameZone(a: string, b: string): boolean {
  const left = canonicalZone(a)
  const right = canonicalZone(b)
  return left !== null && left === right
}
