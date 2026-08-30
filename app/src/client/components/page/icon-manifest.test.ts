/*
The three standing rules of the identity library, as a test.

Each is true the day it is written and quietly false a session later, because
each is broken by *adding* a key rather than by editing a line anybody is
looking at. They are checked here rather than trusted, which is the argument
`components/ui/foundation.test.ts` makes for its own three.

Unit tests of this module, not acceptance criteria: protocol section 8's
second category. Nothing here asserts a numbered criterion.
*/
import { describe, expect, test } from 'vitest'

import { FOLDER_ICON_KEYS } from '../../lib/icons.js'
import { EMOJI_SECTIONS, emojiKeyOf, emojiOf } from './emoji-mark.js'
import { FOLDER_ICONS, ICON_LABELS, ICON_SECTIONS, markIcon } from './icon-manifest.js'

describe('the glyph set', () => {
  /*
  The picker draws sections rather than one grid, so a key present in the
  manifest and absent from every section is a glyph nobody can reach and a
  key in a section and not the manifest is a crash. Neither shows up in a
  typecheck, because both sides are typed against the same union.
  */
  test('every key the manifest draws is offered in exactly one section', () => {
    const offered = ICON_SECTIONS.flatMap((section) => section.keys)
    expect(new Set(offered).size, 'no key is offered twice').toBe(offered.length)
    expect([...offered].sort()).toEqual(Object.keys(FOLDER_ICONS).sort())
  })

  /*
  Imran's rule, which the prototype's picker states in its own header: seven
  columns, whole rows, "adding a glyph means adding seven, or accepting the
  hole". The grid became sections on 2026-08-30, so the rule is now per
  section, which is where a person actually sees the gap.
  */
  test('every section fills whole rows of seven', () => {
    for (const section of ICON_SECTIONS) {
      expect(section.keys.length % 7, `${section.label} leaves an orphan cell`).toBe(0)
    }
  })

  test('every key is labelled, and 4.3 can store every one of them', () => {
    for (const key of Object.keys(FOLDER_ICONS)) {
      expect(ICON_LABELS[key as keyof typeof FOLDER_ICONS]).toBeTruthy()
      /* `shared/folders.ts`'s own regex. A key that fails it is written, is
         refused with a 422, and the mark silently stays as it was. */
      expect(key, `${key} is not a storable icon key`).toMatch(/^[a-z0-9-]{1,40}$/)
    }
  })

  /*
  The owner, 2026-08-30: "the default Desk icon is not available in the icon
  library, so it cannot be restored". The prototype kept it out on purpose
  (`folder-icon-picker.tsx`), which is the decision this reverses.
  */
  test("Desk's own lamp is in the library", () => {
    expect(FOLDER_ICON_KEYS).toContain('lamp-desk')
    expect(markIcon('lamp-desk')).toBe(FOLDER_ICONS['lamp-desk'])
    expect(markIcon('lamp-desk')).not.toBe(markIcon(null))
  })

  test('an unset or unknown key is the plain folder', () => {
    expect(markIcon(null)).toBe(FOLDER_ICONS.folder)
    expect(markIcon('no-such-glyph')).toBe(FOLDER_ICONS.folder)
  })
})

describe('an emoji is a key like any other', () => {
  test('every emoji the picker offers survives the round trip', () => {
    for (const section of EMOJI_SECTIONS) {
      for (const character of section.emoji) {
        const key = emojiKeyOf(character)
        expect(key, `${character} is not one codepoint`).not.toBeNull()
        expect(key).toMatch(/^[a-z0-9-]{1,40}$/)
        expect(emojiOf(key as string)).toBe(character)
      }
    }
  })

  test('the offered set has no duplicate and fills whole rows of eight', () => {
    const offered = EMOJI_SECTIONS.flatMap((section) => section.emoji)
    expect(new Set(offered).size).toBe(offered.length)
    for (const section of EMOJI_SECTIONS) {
      expect(section.emoji.length % 8, `${section.label} leaves an orphan cell`).toBe(0)
    }
  })

  test('the resolver answers a drawing for an emoji key, and the same one twice', () => {
    const key = emojiKeyOf('🌱') as string
    const first = markIcon(key)
    expect(first).not.toBe(markIcon(null))
    /* One component per key, kept: a fresh function each call would remount
       the mark on every parent render. */
    expect(markIcon(key)).toBe(first)
  })

  test('a malformed emoji key falls back rather than throwing', () => {
    expect(emojiOf('emoji-')).toBeNull()
    expect(emojiOf('emoji-41')).toBeNull() // ASCII "A" is not an emoji
    expect(emojiOf('emoji-ffffff')).toBeNull() // past the last plane
    expect(emojiOf('emoji-zzz')).toBeNull()
    expect(markIcon('emoji-zzz')).toBe(FOLDER_ICONS.folder)
  })
})
