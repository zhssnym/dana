/*
`parseBody`, the one way a route reads a JSON body (issue #104).

## What it is for

7.0 tolerates unknown fields on purpose and 11.14 rules that no schema in
`app/src/shared/` becomes strict, so a key nobody declared is stripped by
`z.object`, the route answers 200, and nothing on the wire separates that from
a request that never carried it. 11.14 admitted the cheaper remedy and did not
build it: **observe the unknown key rather than refusing it.** This is that.

**No status code moves and no message changes.** A body that parsed before
parses now, a body that failed before fails now with the same 422 through
`sendValidationError`, and the only new thing in the world is one warn-level
line per request that carried a key its schema does not declare.

## The class this catches, and the one it does not

11.15 and docs/troubleshooting.md name two ways a request field is lost, and they
are constantly confused, so it is written here beside the code rather than
left to a reader to look up:

- **class two**, a key nobody declared — this file sees it;
- **class one**, a key the schema *declares* and the route never reads — this
  file is blind to it, because the key is in the shape. That is the class the
  reminder incident in `app/src/shared/tasks.ts` was, and only a behavioural
  test catches it.

Nothing here is a substitute for the second, and a session that reads this
helper as covering "dropped request fields" will believe the wrong thing.

## Top level only, and that is deliberate for tonight

Only the body's own keys are compared. A key nested inside a declared object
or an array element is dropped exactly as silently as it was before this file
existed. The walk below would extend to it — every wrapper it already reaches
through is the same one level down — but the arrays of 7.6's steps and 7.11's
blocks would need a per-element path in the line, and a line that says
`blocks.17.colour` is a different design decision from one that says `colour`.
Left undone rather than half done; issue #104 records the scope.
*/
import type { Request, Response } from 'express'
import type { ZodError, ZodType, output } from 'zod'

import type { SecurityLogger } from '../security/log.js'
import { sendValidationError } from './errors.js'

/**
 * How the walk below reads a schema, restated from the installed zod rather
 * than recalled, because the shape of these internals is a version fact and
 * the hazard list (11.15) says so. **Measured against zod 4.4.3 on
 * 2026-09-04**, by constructing one schema of every form in this repository
 * and printing `schema._zod.def`:
 *
 * | form | `def.type` | where the object is |
 * | - | - | - |
 * | `z.object({...})` | `object` | `def.shape` |
 * | `.refine`, `.superRefine`, `.check`, `.partial`, `.extend` | `object` | `def.shape`, unchanged — **a refinement is not a wrapper in zod 4**, it is a check on the same object, so `putTaskReminderBody` and `putPlaceCoverBody` need no unwrapping at all |
 * | `.optional`, `.nullable`, `.nullish`, `.readonly`, `.default`, `.catch` | that name | `def.innerType` |
 * | `z.union`, `z.discriminatedUnion` | `union` | `def.options` |
 * | `.and(...)` | `intersection` | `def.left`, `def.right` |
 * | `z.preprocess`, `.transform`, `.pipe` | `pipe` | `def.in` and `def.out` |
 * | `z.lazy` | `lazy` | `def.getter()` |
 * | `z.strictObject` | `object` with `def.catchall` of type `never` | `def.shape` |
 * | `z.looseObject`, `.catchall(...)` | `object` with a `def.catchall` | tolerates unknown keys **by declaration** |
 *
 * This is a structural read of another package's internals and it can go
 * wrong on an upgrade. It goes wrong in one direction: an unrecognised shape
 * answers "I do not know", the request is not inspected, and nothing is
 * logged. It cannot make a route refuse a body it used to accept, and it
 * cannot invent an unknown key that was not there.
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
 * The key names a schema declares for the value it is handed, or `null` when
 * that question has no honest answer.
 *
 * `null` is not "no keys" and the difference is the whole safety of this
 * file: it means *do not report anything*, and every shape this walk does not
 * understand takes that branch. Three of them are reached by real schemas in
 * this repository and each is a deliberate silence rather than a gap:
 *
 * - **`z.preprocess`**, which is `importWorkflowBody`. A pipe's `def.in` is
 *   what the raw body meets, and for `z.preprocess` that is a `transform`,
 *   which declares nothing. Reaching past it to the canonical object would
 *   compare the *normalised* key set against the *raw* body and report the
 *   five keys 11.14 records the normaliser deliberately leaving behind —
 *   `exported_at`, `colour`, `items`, `priority`, `note` — as losses on the
 *   one endpoint most deliberately widened to be forgiving about the shape a
 *   file arrives in. A warn line on every successful import, naming keys the
 *   endpoint was built to accept, is worse than no line.
 * - **a loose object or one with a `catchall`**, which declares that it takes
 *   unknown keys. There is nothing unknown to report.
 * - **`z.record`**, whose keys are all declared by its key type.
 *
 * A union answers with the union of its branches' keys, not the
 * intersection: nothing here knows which branch matched, so a key any branch
 * declares is treated as declared. That is the direction that produces no
 * false report.
 *
 * **Exported for its own test, which is a deliberate exception rather than an
 * oversight.** This is the one function here that reads another package's
 * internals, so it is the one an upgrade breaks, and a broken walk fails
 * silently by design — it stops logging. Driving every branch through a route
 * is not possible either: `parseBody` below refuses a schema that could parse
 * to something other than an object, because 7.0 says a body is an object, so
 * a top-level `.nullable()` or `.optional()` cannot be mounted on a route at
 * all. Those two branches exist for the day this walk descends into a nested
 * object, where they are ordinary, and this is the only place they can be
 * held honest today.
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
        // A catchall of `never` is `z.strictObject`, which refuses unknown
        // keys itself and answers 422 before this ever runs; anything else
        // tolerates them by declaration. Neither has a loss to report.
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
      // The input side, which is what the caller's body is measured against.
      // For `.transform` and `.pipe` that is the object the caller sent; for
      // `z.preprocess` it is a transform, and the walk stops there.
      return declaredKeysOf(def.in, depth + 1)
    case 'lazy':
      return typeof def.getter === 'function'
        ? declaredKeysOf(def.getter(), depth + 1)
        : null
    default:
      return null
  }
}

/** Own enumerable string keys of a JSON object body, or `null` for anything
 * that is not one — an array, `null`, a string, or the `undefined` express
 * leaves when no JSON body was parsed at all. */
function bodyKeysOf(body: unknown): readonly string[] | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null
  }
  return Object.keys(body)
}

/**
 * `PATCH /api/v1/folders/:id` — method, mount and path template, never the
 * concrete URL.
 *
 * Express sets `req.route` on the request before it dispatches to a route's
 * handlers, so any handler, and anything a handler calls while the response is
 * still open, reads the template it was registered under. Verified against
 * express 5 on 2026-09-04 rather than recalled, including through a wrapper:
 * `req.route.path` is the router-relative template and `req.baseUrl` the mount
 * it was reached through.
 *
 * `req.baseUrl` is the *concrete* prefix rather than a template, which is
 * exact here because every router in this application is mounted at a literal
 * path (`/api/v1`, `/api/health`, `/api/csp-report`), and would carry a row id
 * the day one is mounted under a parameterised one. `safeRoute` in
 * `security/log.ts` refuses a uuid-shaped segment for that day; this is the
 * other half of the same guard and neither is load-bearing alone.
 */
function routeLabelOf(req: Request): string {
  const template = (req as { route?: { path?: unknown } }).route?.path
  const path = typeof template === 'string' ? `${req.baseUrl}${template}` : req.baseUrl
  return `${req.method} ${path}`
}

export interface ParseBodyOptions {
  /**
   * Replaces the 7.0 per-field formatter for the two endpoints that answer
   * one sentence about the whole shape instead: `POST /files`, whose body is
   * multipart and whose parts are not the JSON paths
   * `sendFieldValidationError` builds, and `POST /covers/photo`, which takes
   * one field. Both predate this helper and neither changed; the option
   * exists so that using the helper is not a reason to restate their message.
   */
  onInvalid?: (res: Response, error: ZodError) => void
}

/**
 * Parse `req.body` against a shared schema, answer 7.0's 422 if it fails, and
 * log one line if it carried a key the schema does not declare.
 *
 * Returns the parsed body, or `null` once the response has been answered — the
 * `const body = parseBody(...); if (body === null) return` shape every route
 * in this repository already uses for `database(res)` and `parsedId(res, …)`.
 *
 * `null` is unambiguous because `Schema` is constrained to schemas whose
 * output is an `object`, which `null` is not; a schema that could parse to
 * `null` would not compile against this signature.
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

  /* On success only. A body that failed has already been told which fields
     were wrong, by name, in the 422 it just received; an unknown key beside
     them is not the news, and a line per rejected request would make the
     search this exists to enable useless. */
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
