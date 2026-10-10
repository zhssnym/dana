// First touch: the first visit that carries a tag or an outside referrer wins and is never replaced.
const KEY = 'dana-signup-source'

interface SignupSource { src?: string, cmp?: string, ref?: string }

export function rememberSignupSource(): void {
  try {
    if (window.localStorage.getItem(KEY) !== null) return
    const query = new URLSearchParams(window.location.search)
    let ref: string | undefined
    try {
      const host = new URL(document.referrer).hostname
      // The sign-in return from Google is not a source.
      if (host !== window.location.hostname && host !== 'accounts.google.com') ref = host
    } catch { /* no referrer */ }
    const found: SignupSource = {
      src: query.get('utm_source') ?? query.get('ref') ?? undefined,
      cmp: query.get('utm_campaign') ?? undefined,
      ref,
    }
    if (found.src === undefined && found.ref === undefined) return
    window.localStorage.setItem(KEY, JSON.stringify(found))
  } catch { /* storage unavailable */ }
}

/** Query text for the sign-in link, empty when nothing was found. */
export function signupSourceQuery(): string {
  try {
    const found = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as SignupSource
    const query = new URLSearchParams()
    for (const key of ['src', 'cmp', 'ref'] as const) {
      const value = found[key]
      if (typeof value === 'string' && value !== '') query.set(key, value)
    }
    const text = query.toString()
    return text === '' ? '' : `&${text}`
  } catch {
    return ''
  }
}
