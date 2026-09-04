import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import express from 'express'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { z } from 'zod'

import { postFoldersBody } from '../../shared/folders.js'
import { putTaskReminderBody } from '../../shared/tasks.js'
import { importWorkflowBody } from '../../shared/workflows.js'
import { createSecurityLogger } from '../security/log.js'
import type { LogSink, SecurityLogger } from '../security/log.js'
import { sendError } from './errors.js'
import { declaredKeysOf, parseBody } from './parse-body.js'

/*
The unit half of issue #104. What this file owns is the helper's own contract:
that it parses exactly as `safeParse` did, that it reaches an object's shape
through every wrapper this repository puts around one, that it stays silent
where silence is the honest answer, and that the line it writes carries no
value. The structural half — that every route in the application uses it — is
AC-399, and the end-to-end half is AC-400; neither belongs here.

The schemas are the shipping ones wherever a shipping one has the shape under
test, so an upgrade that moved zod's internals fails here rather than in a
mock. The constructed ones below exist for shapes `app/src/shared/` has none
of, on errors.test.ts's precedent: 11.14 rules that no request schema in the
contract becomes strict or loose, so the only honest way to drive one through
the real walk is to declare it in the test that needs it.
*/

/** Every line the logger wrote, in order. */
interface Line {
  fields: Record<string, unknown>
  message: string
}
let lines: Line[] = []
const recordingSink: LogSink = {
  info: (fields, message) => lines.push({ fields, message }),
  warn: (fields, message) => lines.push({ fields, message }),
  error: (fields, message) => lines.push({ fields, message }),
}
const log: SecurityLogger = createSecurityLogger(recordingSink)

const unknownFieldLines = (): Line[] =>
  lines.filter((line) => line.fields['event'] === 'unknown_request_fields')

/* One key nobody could mistake for a real one, and a value that would be
   unmistakable in a log line if it ever reached one. */
const PROBE = '__unknown_probe__'
const SECRET = 'the-quick-brown-fox-must-never-be-logged'

/* Everything that can wrap a body schema and still leave a body that is an
   object, which is what 7.0 says a body is and what `parseBody` accepts. The
   two that cannot — a top-level `.nullable()` and a bare `.optional()` — are
   driven against the walk directly further down. */
const wrappedInEveryWay = z
  .object({ a: z.string() })
  .refine(() => true, { error: 'never fires' })
  .optional()
  .default({ a: 'x' })
  .readonly()

const unionOfObjects = z.union([
  z.object({ left: z.string().optional() }),
  z.object({ right: z.string().optional() }),
])

const intersectionOfObjects = z
  .object({ a: z.string().optional() })
  .and(z.object({ b: z.string().optional() }))

const looseShaped = z.looseObject({ a: z.string().optional() })

const preprocessed = z.preprocess(
  (value) => value,
  z.object({ a: z.string().optional() }),
)

const transformedInput = z
  .object({ a: z.string().optional() })
  .transform((value) => value)

let server: Server
let baseUrl: string

beforeAll(() => {
  const app = express()
  app.use(express.json())
  const router = express.Router()

  /* A real shipping schema on a real literal path: the ordinary case. */
  router.post('/folders', (req, res) => {
    const body = parseBody(postFoldersBody, req, res, log)
    if (body === null) return
    res.status(201).json(body)
  })

  /* A parameterised path, so the label can be asserted to be the template
     rather than the uuid the caller actually addressed. */
  router.put('/tasks/:id/reminder', (req, res) => {
    const body = parseBody(putTaskReminderBody, req, res, log)
    if (body === null) return
    res.status(200).json(body)
  })

  /* One route per shape the walk has to reach through, or decline to. */
  const declaring = <Schema extends z.ZodType<object>>(
    path: string,
    schema: Schema,
  ): void => {
    router.post(path, (req, res) => {
      const body = parseBody(schema, req, res, log)
      if (body === null) return
      res.status(200).json(body)
    })
  }
  declaring('/wrapped', wrappedInEveryWay)
  declaring('/union', unionOfObjects)
  declaring('/intersection', intersectionOfObjects)
  declaring('/loose', looseShaped)
  declaring('/record', z.record(z.string(), z.string()))
  declaring('/preprocessed', preprocessed)
  declaring('/transformed', transformedInput)
  declaring('/import', importWorkflowBody)

  /* The override the two endpoints with a one-sentence 422 use. */
  router.post('/own-message', (req, res) => {
    const body = parseBody(postFoldersBody, req, res, log, {
      onInvalid: () => {
        sendError(res, 422, 'validation_failed', 'name: one sentence, whole shape.')
      },
    })
    if (body === null) return
    res.status(201).json(body)
  })

  app.use('/api/v1', router)
  server = app.listen(0)
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${String(address.port)}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()))
  })
})

beforeEach(() => {
  lines = []
})

const post = async (path: string, body: unknown): Promise<Response> =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('parseBody parses exactly as safeParse did', () => {
  test('a valid body answers what the route answers, unknown key or not', async () => {
    const clean = await post('/api/v1/folders', { name: 'Kitchen' })
    expect(clean.status).toBe(201)
    expect(await clean.json()).toEqual({ name: 'Kitchen' })

    /* 7.0's tolerance, unmoved: the unknown key is still stripped and the
       status is still 201. This is the whole point of the issue — the
       observation is added and nothing is refused. */
    const noisy = await post('/api/v1/folders', { name: 'Kitchen', [PROBE]: SECRET })
    expect(noisy.status).toBe(201)
    expect(await noisy.json()).toEqual({ name: 'Kitchen' })
  })

  test('an invalid body answers 7.0’s 422 with the field named', async () => {
    const res = await post('/api/v1/folders', { name: '' })
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('validation_failed')
    expect(body.error.message).toContain('name')
  })

  test('onInvalid replaces the formatter and nothing else', async () => {
    const res = await post('/api/v1/own-message', { name: '' })
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: { message: string } }
    expect(body.error.message).toBe('name: one sentence, whole shape.')
  })

  test('a body that is not an object is refused, not crashed on', async () => {
    const res = await fetch(`${baseUrl}/api/v1/folders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([1, 2, 3]),
    })
    expect(res.status).toBe(422)
    expect(unknownFieldLines()).toHaveLength(0)
  })
})

describe('parseBody logs the unknown key and nothing of its value', () => {
  test('one warn line naming the route template and the key', async () => {
    await post('/api/v1/folders', { name: 'Kitchen', [PROBE]: SECRET })

    const written = unknownFieldLines()
    expect(written).toHaveLength(1)
    const [line] = written as [Line]
    expect(line.fields).toEqual({
      event: 'unknown_request_fields',
      route: 'POST /api/v1/folders',
      fields: [PROBE],
      count: 1,
    })

    /* 10.5, asserted over the whole line rather than over the fields
       somebody thought to name: no value the caller sent is anywhere in it. */
    expect(JSON.stringify(line)).not.toContain(SECRET)
    expect(JSON.stringify(line)).not.toContain('Kitchen')
  })

  test('the route is the mounted template, never the concrete URL', async () => {
    const id = '11111111-2222-4333-8444-555555555555'
    const res = await fetch(`${baseUrl}/api/v1/tasks/${id}/reminder`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ offset_minutes: 10, [PROBE]: 1 }),
    })
    expect(res.status).toBe(200)

    const [line] = unknownFieldLines() as [Line]
    expect(line.fields['route']).toBe('PUT /api/v1/tasks/:id/reminder')
    expect(JSON.stringify(line)).not.toContain(id)
  })

  test('a clean body writes no line at all', async () => {
    await post('/api/v1/folders', { name: 'Kitchen', description: 'the one with the sink' })
    expect(lines).toHaveLength(0)
  })

  test('a body that failed validation writes no line either', async () => {
    /* The caller has already been told which field was wrong, by name. A
       line per rejected request would make the search this exists for
       useless, and the unknown key is not the news. */
    const res = await post('/api/v1/folders', { name: '', [PROBE]: SECRET })
    expect(res.status).toBe(422)
    expect(unknownFieldLines()).toHaveLength(0)
  })

  test('a key name that is not a plain key name is whitelisted away', async () => {
    await post('/api/v1/folders', { name: 'Kitchen', 'note: 4th & Main': 1 })
    const [line] = unknownFieldLines() as [Line]
    expect(line.fields['fields']).toEqual(['other'])
    expect(JSON.stringify(line)).not.toContain('Main')
  })

  test('a body of many unknown keys is clipped, and says how much', async () => {
    const many: Record<string, unknown> = { name: 'Kitchen' }
    for (let index = 0; index < 30; index += 1) many[`extra_${String(index)}`] = index
    await post('/api/v1/folders', many)

    const [line] = unknownFieldLines() as [Line]
    expect((line.fields['fields'] as string[]).length).toBe(20)
    expect(line.fields['count']).toBe(30)
  })
})

describe('parseBody reaches an object’s shape through zod 4’s wrappers', () => {
  test('through optional, nullable, readonly and a refinement', async () => {
    await post('/api/v1/wrapped', { a: 'x', [PROBE]: 1 })
    expect((unknownFieldLines()[0] as Line).fields['fields']).toEqual([PROBE])
  })

  test('a union declares every branch’s keys, so no branch is a false report', async () => {
    /* `right` belongs to the branch that did not match. Nothing here knows
       which branch did, so a key any branch declares is treated as declared:
       the direction that produces no false report. */
    await post('/api/v1/union', { left: 'x', right: 'y' })
    expect(unknownFieldLines()).toHaveLength(0)

    await post('/api/v1/union', { left: 'x', [PROBE]: 1 })
    expect((unknownFieldLines()[0] as Line).fields['fields']).toEqual([PROBE])
  })

  test('an intersection declares both sides', async () => {
    await post('/api/v1/intersection', { a: 'x', b: 'y' })
    expect(unknownFieldLines()).toHaveLength(0)

    await post('/api/v1/intersection', { a: 'x', [PROBE]: 1 })
    expect((unknownFieldLines()[0] as Line).fields['fields']).toEqual([PROBE])
  })

  test('a transform’s input side is what the body is measured against', async () => {
    await post('/api/v1/transformed', { a: 'x', [PROBE]: 1 })
    expect((unknownFieldLines()[0] as Line).fields['fields']).toEqual([PROBE])
  })

  /* The two wrappers no route can mount, driven against the walk itself.
     `parseBody` refuses a schema that could parse to something other than an
     object, because 7.0 says a body is one — so these branches exist for a
     nested object rather than for a body, and this is the only place they can
     be held honest. See the note on the export. */
  test('nullable, optional and catch, which no body may be', () => {
    const object = z.object({ a: z.string(), b: z.number() })
    for (const schema of [
      object.nullable(),
      object.optional(),
      object.nullish(),
      object.catch({ a: 'x', b: 1 }),
      object.readonly().nullable().optional(),
      z.lazy(() => object),
    ]) {
      expect([...(declaredKeysOf(schema) ?? [])].sort()).toEqual(['a', 'b'])
    }
  })

  test('a shape the walk does not know answers “I do not know”, never “no keys”', () => {
    /* The safety of the whole file: an unrecognised shape must not read as an
       object with nothing declared, which would report every key the caller
       sent. */
    for (const schema of [z.string(), z.array(object()), z.any(), z.never(), {}, null]) {
      expect(declaredKeysOf(schema)).toBeNull()
    }
  })
})

function object(): z.ZodObject<{ a: z.ZodString }> {
  return z.object({ a: z.string() })
}

describe('parseBody stays silent where silence is the honest answer', () => {
  test('a loose object tolerates unknown keys by declaration', async () => {
    await post('/api/v1/loose', { a: 'x', [PROBE]: 1 })
    expect(unknownFieldLines()).toHaveLength(0)
  })

  test('a record declares every key through its key type', async () => {
    await post('/api/v1/record', { anything: 'x' })
    expect(unknownFieldLines()).toHaveLength(0)
  })

  test('a preprocessed body is not measured against the shape it becomes', async () => {
    await post('/api/v1/preprocessed', { a: 'x', [PROBE]: 1 })
    expect(unknownFieldLines()).toHaveLength(0)
  })

  test('POST /workflows/import writes no line for the keys its normaliser leaves', async () => {
    /* 11.14 records `normalizeWorkflowFile` copying rather than moving, so a
       DES-206 shaped file still carries `exported_at` when the canonical
       schema sees it. Reaching past the preprocess would report that as a
       loss on the one endpoint most deliberately widened to be forgiving
       about the shape a file arrives in. */
    const res = await post('/api/v1/import', {
      dana: 'workflow',
      version: 1,
      exported_at: '2026-09-04T00:00:00.000Z',
      folders: [{ name: 'Imported', tasks: [] }],
    })
    /* On the success path, which is where this helper writes at all: a 422
       would prove the silence for the wrong reason. */
    expect(res.status).toBe(200)
    expect(unknownFieldLines()).toHaveLength(0)
  })
})
