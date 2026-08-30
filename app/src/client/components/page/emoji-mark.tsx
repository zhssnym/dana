/*
An emoji as a folder's or a shelf's mark, added 2026-08-30 at the owner's word:
the identity picker was missing "emoji icons", which every product a person
compares Dana to has offered for a decade.

**Nothing about section 4 changes, and that is the whole design of this file.**
4.3's `icon` and 4.18's are a stored key, checked against `^[a-z0-9-]{1,40}$`
by `shared/folders.ts` and stored opaquely by the server ("the icon key is
pattern-validated until S8 exports the set; the server stores it opaquely
either way"). A codepoint written in lowercase hex fits that alphabet exactly,
so an emoji mark is `emoji-1f331` and needs no column, no migration and no
widening of a frozen section. The character itself never crosses the wire; the
number does, and this module is the only place that turns one into the other.

**Single codepoints only.** A key is capped at forty characters, and the emoji
that need a variation selector or a zero-width joiner are the ones whose
spelling varies between platforms and whose length is unbounded (a family is
seven codepoints). The picker offers ninety-six that stand alone, so the
stored key is always short and always means one drawing.

**It is drawn as an `svg` and not as text**, which is what makes it a mark
rather than a special case. Every surface that draws an identity, the sidebar
row, a task row's folder chip, the tab strip, the page's own head, hands its
glyph a `size-*` class and expects an icon component back; a `span` carrying a
character would take its size from whatever font-size it landed in and would
be the wrong size on four of those five. Inside a `viewBox="0 0 24 24"` the
character scales with the box, exactly as a Lucide path does, so the resolver
can hand this back wherever it hands back a drawing and no call site knows.
*/
import type { IconProps, LucideIcon } from '../../lib/icons.js'
import { cn } from '../ui/utils.js'

/** The one spelling of an emoji key, so nothing else builds one by hand. */
export const EMOJI_KEY_PREFIX = 'emoji-'

/** The stored key for a character, or null where it is not one codepoint. */
export function emojiKeyOf(character: string): string | null {
  const code = character.codePointAt(0)
  if (code === undefined) return null
  /* Two codepoints is a variation selector or a joiner; see the header. */
  if (String.fromCodePoint(code) !== character) return null
  return `${EMOJI_KEY_PREFIX}${code.toString(16)}`
}

/** The character a stored key names, or null where the key is not one. */
export function emojiOf(key: string): string | null {
  if (!key.startsWith(EMOJI_KEY_PREFIX)) return null
  const hex = key.slice(EMOJI_KEY_PREFIX.length)
  if (!/^[0-9a-f]{2,6}$/.test(hex)) return null
  const code = Number.parseInt(hex, 16)
  /* Below 0x80 is ASCII rather than an emoji, and above the plane limit is
     not a character at all: both are a malformed key rather than a mark, and
     the resolver falls back to the plain folder for them. */
  if (code < 0x80 || code > 0x10ffff) return null
  return String.fromCodePoint(code)
}

/*
One component per key, kept, because React identifies a component by its
function: a fresh one on every render is a fresh element type, which unmounts
the mark and mounts a replacement on every parent render. The map is bounded
by the picker's ninety-six plus whatever keys a person's own folders carry.
*/
const drawn = new Map<string, LucideIcon>()

/** The mark for an emoji key, or null where the key names no emoji. */
export function emojiMark(key: string): LucideIcon | null {
  const cached = drawn.get(key)
  if (cached !== undefined) return cached

  const character = emojiOf(key)
  if (character === null) return null

  function EmojiMark({
    /* Swallowed for the reason `lib/icons.tsx` swallows them: every call site
       still passes the stroke width of the Lucide days, and a character has
       no stroke to set. */
    strokeWidth: _strokeWidth,
    absoluteStrokeWidth: _absoluteStrokeWidth,
    ...rest
  }: IconProps): React.JSX.Element {
    return (
      <svg
        viewBox="0 0 24 24"
        {...rest}
        /* The same default the icon module applies, so an emoji mark and a
           drawn one are the same size in a call site that sets none. */
        className={cn(
          !/(?:^|\s)!?(?:size|[hw])-/.test(rest.className ?? '') && 'size-4',
          rest.className,
        )}
      >
        <text
          x="12"
          y="12"
          textAnchor="middle"
          dominantBaseline="central"
          /* 19 of the 24 box. Measured in Chromium against a Lucide glyph
             rather than guessed: a Lucide drawing's ink is 18 units of the
             same 24, so an emoji at 19 sits at the icon set's own weight and
             keeps a unit of air at each edge, where 21 painted to the very
             rim of the viewBox and a root `svg` clips at it. */
          fontSize="19"
        >
          {character}
        </text>
      </svg>
    )
  }

  drawn.set(key, EmojiMark)
  return EmojiMark
}

/*
The ninety-six the picker offers, in eight columns, sections in multiples of
eight so no row is left with a hole in it. The rule is the one Imran set for
the glyph grid and it is worth keeping here: the gap at the right of an
unfinished row reads as a missing choice rather than as the end of a list.
*/
export interface EmojiSection {
  readonly label: string
  readonly emoji: readonly string[]
}

export const EMOJI_SECTIONS: readonly EmojiSection[] = [
  {
    label: 'Smileys',
    emoji: ['😀', '😄', '😅', '😂', '🙂', '😉', '😊', '😍',
            '😎', '🤔', '😴', '🤩', '🥳', '😇', '🤗', '🙃'],
  },
  {
    label: 'People',
    emoji: ['👋', '👍', '🙌', '💪', '🧠', '👀', '🧑', '👶'],
  },
  {
    label: 'Nature',
    emoji: ['🌱', '🌳', '🌴', '🌵', '🌸', '🌻', '🍀', '🍁',
            '🐝', '🔥', '💧', '🌊', '🌙', '🌞', '🌈', '⭐'],
  },
  {
    label: 'Food and drink',
    emoji: ['🍎', '🍊', '🍋', '🍓', '🍇', '🥑', '🍞', '🧀',
            '🍕', '🍔', '🍟', '🍣', '🍜', '🍰', '🍪', '☕'],
  },
  {
    label: 'Activity',
    emoji: ['⚽', '🏀', '🎾', '🏃', '🚴', '🧘', '🎯', '🏆'],
  },
  {
    label: 'Places',
    emoji: ['🚗', '🚌', '🚲', '🚀', '🏠', '🏢', '🌍', '🚇'],
  },
  {
    label: 'Objects',
    emoji: ['💡', '📚', '📝', '📅', '📌', '🔑', '🔒', '💰',
            '💳', '🎁', '🎵', '🎸', '📷', '💻', '📱', '🔧'],
  },
  {
    label: 'Symbols',
    emoji: ['💜', '💙', '💚', '🧡', '⚡', '✨', '🎉', '💯'],
  },
]
