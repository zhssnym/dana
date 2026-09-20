/*
The Dana Link grammar, unit-tested where it lives (issue #223).

This file is not a criterion. It proves the parser and the path builder are
inverses and that the rejections are the ones the module claims, which is the
half of "malformed or unsupported internal URLs are rejected safely" that
needs no database and no HTTP: AC-426 drives the other half through the
endpoint.

The distinction worth keeping in view while reading: every case below is about
**shape**. Whether a well-formed link points at anything, and whether the
person asking may have it, is the server's and is asserted in
`tests/criteria/ac-424` to `ac-430`.
*/
import { describe, expect, test } from 'vitest'

import {
  REFERENCE_KINDS,
  parseDanaLink,
  referencePath,
} from './references.js'
import type { ReferenceKind } from './references.js'

const ID = '4f1c6a2e-8f0b-4f4a-9a1e-2d3c4b5a6f70'
const OTHER_ID = '9b2d7c31-1e44-4a1b-8c9d-0f1e2a3b4c5d'
const ORIGIN = 'https://dana.example'

describe('the Dana Link grammar', () => {
  test('every kind round-trips through its canonical path', () => {
    for (const kind of REFERENCE_KINDS) {
      const path = referencePath(kind, ID)
      expect(
        parseDanaLink(path),
        `${path} is the path this module emits for a ${kind}, so it must be a path this module accepts`,
      ).toEqual({ kind, id: ID })
    }
  })

  test('the three client routes are the three the issue names', () => {
    const paths = REFERENCE_KINDS.map((kind: ReferenceKind) =>
      referencePath(kind, ID),
    )
    expect(paths, 'M1 targets Task, Folder and Shelf and nothing else').toEqual(
      [`/app/tasks/${ID}`, `/app/folders/${ID}`, `/app/shelves/${ID}`],
    )
  })

  test('a query or fragment after the path is ignored rather than fatal', () => {
    expect(parseDanaLink(`/app/tasks/${ID}?from=chip`)).toEqual({
      kind: 'task',
      id: ID,
    })
    expect(parseDanaLink(`/app/tasks/${ID}#notes`)).toEqual({
      kind: 'task',
      id: ID,
    })
  })

  test('surrounding whitespace is trimmed, because a paste carries it', () => {
    expect(parseDanaLink(`  /app/folders/${ID}\n`)).toEqual({
      kind: 'folder',
      id: ID,
    })
  })

  test('an absolute URL resolves only against this deployment origin', () => {
    expect(
      parseDanaLink(`${ORIGIN}/app/tasks/${ID}`, ORIGIN),
      'a person pastes the whole URL out of the address bar',
    ).toEqual({ kind: 'task', id: ID })
    expect(
      parseDanaLink(`${ORIGIN.toUpperCase()}/app/tasks/${ID}`, ORIGIN),
      'the origin comparison is case-insensitive, as a host is',
    ).toEqual({ kind: 'task', id: ID })
    expect(
      parseDanaLink(`https://not-dana.example/app/tasks/${ID}`, ORIGIN),
      'somebody else\'s URL shaped like ours is not a Dana Link',
    ).toBeNull()
    expect(
      parseDanaLink(`${ORIGIN}/app/tasks/${ID}`),
      'with no origin to compare against, no absolute URL can be known to be ours',
    ).toBeNull()
  })

  test('the rejections', () => {
    const refused: readonly [string, string][] = [
      ['', 'the empty string'],
      ['   ', 'whitespace alone'],
      [`//evil.example/app/tasks/${ID}`, 'a protocol-relative URL'],
      [`/app/tasks/${ID}/edit`, 'a fourth segment'],
      ['/app/tasks', 'a missing id'],
      [`/tasks/${ID}`, 'a missing /app prefix'],
      [`/app/comments/${ID}`, 'a kind outside the closed set'],
      [`/app/pages/${ID}`, 'a kind that has no stable route yet'],
      ['/app/tasks/not-a-uuid', 'an id that is not a uuid'],
      [`/app/tasks/${ID}${OTHER_ID}`, 'two ids run together'],
      [`javascript:/app/tasks/${ID}`, 'a scheme that is not a URL of ours'],
      [`/APP/TASKS/${ID}`, 'the wrong case in the segments'],
    ]
    for (const [raw, why] of refused) {
      expect(
        parseDanaLink(raw, ORIGIN),
        `${why} must not parse as a Dana Link: ${JSON.stringify(raw)}`,
      ).toBeNull()
    }
  })
})
