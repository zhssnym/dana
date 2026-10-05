/*
`parseBody`, the one way a route reads a JSON body. Schemas strip unknown keys
(never strict, 11.14), so this logs a warn line naming them; status and
messages are unchanged. It catches only undeclared keys at the top level. A
declared key the route never reads is invisible here; only a behavioural test
catches that.
*/
import type { Request, Response } from 'express'
import type { ZodError, ZodType, output } from 'zod'

import type { SecurityLogger } from '../security/log.js'
import { sendValidationError } from './errors.js'

/**
 * A structural read of zod 4 internals (`schema._zod.def`), checked against
 * zod 4.4.3. Refinements are not wrappers in zod 4; optional/nullable/default
 * wrap `innerType`; unions use `options`; pipes use `in`. An upgrade that
 * changes this fails safe: the walk answers "unknown" and logs nothing.
 */
interface ZodDefShape {
  type?: string
  shape?: Record<string, unknown>
  catchall?: unknown
  innerType?: unknown
  options?: readonly unknown[]
  left?: unknown
  right?: unknown
  in?: unknown
  getter?: () => unknown
}

function defOf(schema: unknown): ZodDefShape | undefined {
  if (typeof schema !== 'object' || schema === null) return undefined
  const core = (schema as { _zod?: { def?: unknown } })._zod
  const def = core?.def
  if (typeof def !== 'object' || def === null) return undefined
  return def as ZodDefShape
}

/**
 * Declared top-level keys, or `null` meaning "do not report". Null for
 * z.preprocess (importWorkflowBody tolerates extra keys on purpose), loose or
 * catchall objects, and records. A union answers all branches' keys, so it never
 * reports a false loss. Exported for its own test, since an upgrade breaks it silently.
 */
export function declaredKeysOf(
  schema: unknown,
  depth = 0,
): ReadonlySet<string> | null {
  if (depth > 8) return null
  const def = defOf(schema)
  if (def === undefined) return null

  switch (def.type) {
    case 'object': {
      if (def.catchall !== undefined) {
        // strictObject refuses unknown keys itself; other catchalls accept them.
        return null
      }
      return new Set(Object.keys(def.shape ?? {}))
    }
    case 'optional':
    case 'nullable':
    case 'readonly':
    case 'default':
    case 'prefault':
    case 'nonoptional':
    case 'catch':
      return declaredKeysOf(def.innerType, depth + 1)
    case 'union': {
      if (!Array.isArray(def.options)) return null
      const keys = new Set<string>()
      for (const option of def.options) {
        const branch = declaredKeysOf(option, depth + 1)
        if (branch === null) return null
        for (const key of branch) keys.add(key)
      }
      return keys
    }
    case 'intersection': {
      const left = declaredKeysOf(def.left, depth + 1)
      const right = declaredKeysOf(def.right, depth + 1)
      if (left === null || right === null) return null
      return new Set([...left, ...right])
    }
    case 'pipe':
      // The input side. For z.preprocess that is a transform, and the walk stops.
      return declaredKeysOf(def.in, depth + 1)
    case 'lazy':
      return typeof def.getter === 'function'
        ? declaredKeysOf(def.getter(), depth + 1)
        : null
    default:
      return null
  }
}

/** Keys of a JSON object body, or null for anything else (including no body). */
function bodyKeysOf(body: unknown): readonly string[] | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null
  }
  return Object.keys(body)
}

/**
 * `PATCH /api/v1/folders/:id`: method and path template, never the concrete URL.
 * `req.baseUrl` is concrete, which is safe only while every router is mounted at
 * a literal path; `safeRoute` in security/log.ts guards the other case.
 */
function routeLabelOf(req: Request): string {
  const template = (req as { route?: { path?: unknown } }).route?.path
  const path = typeof template === 'string' ? `${req.baseUrl}${template}` : req.baseUrl
  return `${req.method} ${path}`
}

export interface ParseBodyOptions {
  /** Replaces the per-field 422 formatter (multipart `POST /files`, `POST /covers/photo`). */
  onInvalid?: (res: Response, error: ZodError) => void
}

/**
 * Parse `req.body`, answer 7.0's 422 on failure, and log any undeclared keys.
 * Returns null once the response is sent; the schema's output is an object, so
 * null is unambiguous.
 */
export function parseBody<Schema extends ZodType<object>>(
  schema: Schema,
  req: Request,
  res: Response,
  log: SecurityLogger,
  options: ParseBodyOptions = {},
): output<Schema> | null {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    if (options.onInvalid === undefined) {
      sendValidationError(res, parsed.error)
    } else {
      options.onInvalid(res, parsed.error)
    }
    return null
  }

  /* On success only: a rejected body's 422 already named its fields. */
  const declared = declaredKeysOf(schema)
  const present = bodyKeysOf(req.body)
  if (declared !== null && present !== null) {
    const unknown = present.filter((key) => !declared.has(key))
    if (unknown.length > 0) {
      log.unknownRequestFields({ route: routeLabelOf(req), fields: unknown })
    }
  }

  return parsed.data
}
