/*
 * The only place the client calls `fetch` (a lint rule enforces it). Every view read carries tz and every write
 * the CSRF header. Responses are parsed with the shared schemas; a parse failure is handled like a transport
 * failure. queryClient.ts picks the toast from the error type: OfflineError, ApiError or any other.
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

/** Thrown before fetch: an offline write fails fast, with no queue or retry (spec 10.6). */
export class OfflineError extends Error {
  constructor() {
    super('offline')
    this.name = 'OfflineError'
  }
}

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
  readonly csrf: boolean
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
      // Same-origin is the default; spelled out because the session is a cookie.
      credentials: 'same-origin',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    // A same-origin fetch that rejects without an abort did not complete: treat it as offline.
    reportUnreachable()
    throw new OfflineError()
  }
  reportReachable()

  if (response.status === 204) return undefined
  const text = await response.text()
  const payload: unknown = text === '' ? undefined : safeJson(text)

  if (!response.ok) {
    const envelope = errorEnvelope.safeParse(payload)
    // The server holds the 409 copy (spec 5.1), so pass its message through unchanged.
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

/** A view read. This function adds tz, never the caller. */
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

/** A read with no date logic, so it sends no tz. */
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
}

/** Any write; this function adds the CSRF header. Pass no schema for a 204 with no body. */
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

export function requestTimezone(): string {
  return browserTimezone()
}

/** Multipart writes (spec 7.15). The browser must write the boundary, so no Content-Type is set here. */
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

/** A null `folderId` omits the part. An empty `folder_id` string is not a uuid and is refused 422. */
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

/** Read the stored type for a file chip without downloading its bytes. */
export async function fileMime(id: string): Promise<string | null> {
  if (!isOnline()) return null
  try {
    const response = await fetch(urlOf(`/files/${id}`, undefined), {
      method: 'HEAD',
      credentials: 'same-origin',
    })
    return response.ok ? response.headers.get('content-type') : null
  } catch {
    return null
  }
}

export async function uploadAvatar(file: File): Promise<PostAvatarResponse> {
  const form = new FormData()
  form.set('file', file)
  return parsed(
    postAvatarResponse,
    '/me/avatar',
    await postMultipart('/me/avatar', form),
  )
}
