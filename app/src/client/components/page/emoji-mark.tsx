// An emoji as a folder or shelf mark, stored as `emoji-<hex codepoint>` so it fits the
// icon key alphabet. Drawn as an svg so it sizes like a Lucide icon.
import type { IconProps, LucideIcon } from '../../lib/icons.js'
import { cn } from '../ui/utils.js'

export const EMOJI_KEY_PREFIX = 'emoji-'

/** The character a stored key names, or null where it is not one. */
export function emojiOf(key: string): string | null {
  if (!key.startsWith(EMOJI_KEY_PREFIX)) return null
  const hex = key.slice(EMOJI_KEY_PREFIX.length)
  if (!/^[0-9a-f]{2,6}$/.test(hex)) return null
  const code = Number.parseInt(hex, 16)
  // Below 0x80 is ASCII and above 0x10ffff is not a character: a malformed key.
  if (code < 0x80 || code > 0x10ffff) return null
  return String.fromCodePoint(code)
}

// One component per key: a new function per render is a new element type, which
// would remount the mark every time.
const drawn = new Map<string, LucideIcon>()

export function emojiMark(key: string): LucideIcon | null {
  const cached = drawn.get(key)
  if (cached !== undefined) return cached

  const character = emojiOf(key)
  if (character === null) return null

  function EmojiMark({
    // Callers still pass a stroke width; a character has none.
    strokeWidth: _strokeWidth,
    absoluteStrokeWidth: _absoluteStrokeWidth,
    ...rest
  }: IconProps): React.JSX.Element {
    return (
      <svg
        viewBox="0 0 24 24"
        {...rest}
        // The same default size the icon module applies.
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
          // 19 of 24: a Lucide glyph's ink is 18 units, and 21 reached the viewBox edge and clipped.
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
