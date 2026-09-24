/*
The single door between this client and the section 7 API.

Nothing in `src/client` calls `fetch` except this file, and since issue #72 a
lint rule says so rather than this comment: `no-restricted-syntax` in
`app/eslint.config.ts` fails a `fetch` call anywhere in `src/client` but here.
One file is exempt by a disable comment, `lib/viewer.ts`, which round-trips a
`data:` URL into a Blob and reaches no network. The reason for the rule is
that two of section 7's obligations are properties of every request rather
than of any one call site:

- **Every view request carries tz** (7.0, and its absent half ruled on
  2026-08-07). `getView` appends it; there is no way to read a view without
  one, because the parameter is not a caller's to pass.
- **Every mutation echoes the CSRF token** (11.6's double submit).
  `mutateApi` sets the header; there is no way to write without one.

A client can satisfy both on the endpoint a criterion happens to read and omit
them elsewhere, and every criterion still passes. Making them structural is
what closes that gap.

Responses are parsed with the schemas of `src/shared`, which is 11.4's reuse
rule read in the read direction: the shared schemas are the contract both
sides were written against, so a response that does not satisfy one is a
finding rather than something to render around. A parse failure answers the
same way a transport failure does, so a page's error state covers both.

Errors come in three kinds because section 9 gives them three treatments:
offline (the 9.1 banner and the offline write toast), a refused request with
the server's own message (5.1's conflict copy, which 9.1 requires verbatim),
and everything else (the 9.1 error toast). Which toast a failure earns is
decided once, in `queryClient.ts`, off these three types.
*/
import type { z } from 'zod'

import { errorEnvelope } from '../../shared/error-envelope.js'
import { postAvatarResponse, postFilesResponse } from '../../shared/files.js'
import type {
  PostAvatarResponse,
  PostFilesResponse,
  UploadFileKind,
} from '../../shared/files.js'

import { isOnline, reportReachable, reportUnreachable } from '../state/connectivity.js'

import { csrfToken } from './csrf.js'
import { browserTimezone } from './tz.js'

const BASE = '/api/v1'

/**
 * A request that never reached the network because this browser has none.
 *
 * Thrown before the fetch rather than after it, which is what "writes fail
 * fast" means in 10.6's ISSUE-19 contract: the call does not sit in a retry,
 * it does not enter a queue, and it does not become a background sync. There
 * is no offline write path in this client at all, and this type is where that
 * decision is expressed rather than merely intended.
 */
export class OfflineError extends Error {
  constructor() {
    super('offline')
    this.name = 'OfflineError'
  }
}

/** A request the server answered with one of 7.0's error statuses. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/** The response did not satisfy the shared schema its endpoint answers. */
export class ResponseShapeError extends Error {
  constructor(path: string, detail: string) {
    super(`${path}: ${detail}`)
    this.name = 'ResponseShapeError'
  }
}

export type QueryParams = Record<string, string | number | boolean | undefined>

interface RequestOptions {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  readonly path: string
  readonly params?: QueryParams
  readonly body?: unknown
  /** Mutations only. GETs are safe (7.0) and carry no token. */
  readonly csrf: boolean
  readonly onHeaders?: (headers: Headers) => void
}

function urlOf(path: string, params: QueryParams | undefined): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined) continue
    search.set(key, String(value))
  }
  const query = search.toString()
  return query === '' ? `${BASE}${path}` : `${BASE}${path}?${query}`
}

async function send(options: RequestOptions): Promise<unknown> {
  // The fail-fast check of 10.6: a write attempted with no connection does
  // not enter a queue, a retry or a background sync, and the shortest way to
  // guarantee that is not to make the request at all. What "no connection"
  // means is state/connectivity.ts's judgment rather than navigator.onLine's,
  // for the reason recorded there.
  if (!isOnline()) throw new OfflineError()

  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.csrf) {
    const token = csrfToken()
    if (token !== null) headers['X-CSRF-Token'] = token
  }

  let response: Response
  try {
    response = await fetch(urlOf(options.path, options.params), {
      method: options.method,
      headers,
      // One origin serves everything (11.1), so this is the browser's own
      // default; it is spelled out because the session is a cookie and a
      // silent default is a bad place for that to live.
      credentials: 'same-origin',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    // fetch rejects for exactly one class of reason on a same-origin request
    // that nobody aborted: it did not complete. That is the offline condition
    // itself, whatever the platform's flag says, and it is the sharpest
    // evidence the client ever gets, so the banner is told here.
    reportUnreachable()
    throw new OfflineError()
  }
  // Any status at all is the server answering, which is a connection.
  reportReachable()
  options.onHeaders?.(response.headers)

  if (response.status === 204) return undefined
  const text = await response.text()
  const payload: unknown = text === '' ? undefined : safeJson(text)

  if (!response.ok) {
    const envelope = errorEnvelope.safeParse(payload)
    // 9.1 requires a 409 to show 5.1's copy verbatim, and the server is what
    // holds that copy: the message is carried through unchanged rather than
    // mapped to anything of this client's own.
    const code = envelope.success ? envelope.data.error.code : 'error'
    const message = envelope.success ? envelope.data.error.message : 'Request failed.'
    throw new ApiError(response.status, code, message)
  }
  return payload
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function parsed<T>(schema: z.ZodType<T>, path: string, payload: unknown): T {
  const result = schema.safeParse(payload)
  if (!result.success) {
    throw new ResponseShapeError(path, result.error.issues[0]?.message ?? 'unexpected shape')
  }
  return result.data
}

/**
 * A read of one of 7.10's view endpoints, or of any other GET that evaluates
 * dates. tz is this function's, never the caller's.
 */
export async function getView<T>(
  schema: z.ZodType<T>,
  path: string,
  params?: QueryParams,
): Promise<T> {
  const payload = await send({
    method: 'GET',
    path,
    params: { ...params, tz: browserTimezone() },
    csrf: false,
  })
  return parsed(schema, path, payload)
}

/**
 * A read that evaluates no date: the roster, the folder list, settings, /me.
 * 7.0 scopes its tz sentence to view endpoints, so these carry none, and
 * sending one anyway would put a parameter on the wire that the contract does
 * not give those endpoints.
 */
export async function getPlain<T>(
  schema: z.ZodType<T>,
  path: string,
  params?: QueryParams,
): Promise<T> {
  const payload = await send({ method: 'GET', path, params, csrf: false })
  return parsed(schema, path, payload)
}

interface MutateOptions {
  readonly method: 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  readonly path: string
  readonly params?: QueryParams
  readonly body?: unknown
  /** The one write whose answer is a header on a 204 (item 60's DELETE
   * /sample) reads it here; every other caller has no use for this. */
  readonly onHeaders?: (headers: Headers) => void
}

/**
 * Any write. The CSRF header is this function's; a caller that forgets it
 * cannot exist.
 *
 * The schema is optional because three of section 7's mutations answer 204
 * with no body, and a caller that wants nothing back says so by passing
 * nothing rather than by parsing `undefined` against a schema.
 */
export async function mutateApi<T>(
  schema: z.ZodType<T>,
  options: MutateOptions,
): Promise<T>
export async function mutateApi(schema: null, options: MutateOptions): Promise<void>
export async function mutateApi<T>(
  schema: z.ZodType<T> | null,
  options: MutateOptions,
): Promise<T | void> {
  const payload = await send({ ...options, csrf: true })
  if (schema === null) return
  return parsed(schema, options.path, payload)
}

/** The tz a date-evaluating mutation carries (7.6's transitions, 7.8's pull). */
export function requestTimezone(): string {
  return browserTimezone()
}

/**
 * The non-JSON writes: 7.15's two multipart routes.
 *
 * `send` above stringifies a JSON body and says so in its Content-Type; a
 * multipart body must let the browser write the boundary itself, so this is
 * a sibling rather than a flag on `send`. Everything else is the same
 * contract: fail fast offline, CSRF on the mutation, the error envelope
 * carried through verbatim, the answer parsed through a schema.
 */
async function postMultipart(path: string, form: FormData): Promise<unknown> {
  if (!isOnline()) throw new OfflineError()
  const headers: Record<string, string> = {}
  const token = csrfToken()
  if (token !== null) headers['X-CSRF-Token'] = token

  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers,
      credentials: 'same-origin',
      body: form,
    })
  } catch {
    reportUnreachable()
    throw new OfflineError()
  }
  reportReachable()

  const text = await response.text()
  const payload: unknown = text === '' ? undefined : safeJson(text)
  if (!response.ok) {
    const envelope = errorEnvelope.safeParse(payload)
    const code = envelope.success ? envelope.data.error.code : 'error'
    const message = envelope.success ? envelope.data.error.message : 'Request failed.'
    throw new ApiError(response.status, code, message)
  }
  return payload
}

/**
 * 7.15's upload.
 *
 * **`folderId` takes null, and null means the part is not sent at all**
 * (issues #20, #100, #118). 7.15 made `folder_id` optional for `kind: cover`
 * alone on 2026-09-03, so a shelf and a built-in place page — neither of which
 * is a folder — can hold a picture of their own; every other kind still
 * requires it and is refused 422 naming the field.
 *
 * The distinction belongs at this line rather than at the call site, because
 * the wrong way to say it is available and looks right: `form.set('folder_id',
 * '')` sends a part carrying the empty string, which is not a uuid, so the
 * upload is refused 422 rather than stored folder-less. Omitting the part is
 * the only spelling 7.15 reads as "no folder".
 */
export async function uploadFile(
  kind: UploadFileKind,
  folderId: string | null,
  file: File,
): Promise<PostFilesResponse> {
  const form = new FormData()
  form.set('kind', kind)
  if (folderId !== null) form.set('folder_id', folderId)
  form.set('file', file)
  return parsed(
    postFilesResponse,
    '/files',
    await postMultipart('/files', form),
  )
}

/**
 * 7.15's avatar arm: `POST /me/avatar`, one part named `file`, answering the
 * serving path it pointed `users.avatar_url` at.
 *
 * It sits beside `uploadFile` rather than in `lib/viewer.ts`, where it was a
 * second hand-written `fetch` written before this file had one. The copy was
 * missing the offline check and the error envelope, so a picture chosen with
 * no connection was the one write in the client that did not fail fast and
 * did not carry 9.1's "Couldn't save. You're offline." One multipart path,
 * one contract, and 10.6's offline rule reaches the avatar with it.
 */
export async function uploadAvatar(file: File): Promise<PostAvatarResponse> {
  const form = new FormData()
  form.set('file', file)
  return parsed(
    postAvatarResponse,
    '/me/avatar',
    await postMultipart('/me/avatar', form),
  )
}
