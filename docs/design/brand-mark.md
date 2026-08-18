# The Dana mark

The asset sheet: what the files are, which one goes where, and the two rules
that keep them from drifting apart. The reasoning behind any of it is in
`v2-decisions.md` under DES-126 (the mark draws itself) and DES-127 (two
colourways); this page is the reference you reach for while designing, not the
argument.

## What the mark is

A rounded square — the *plate* — with a D-like spiral inside it — the *glyph*.
The glyph is a single filled ribbon of just under two turns: it begins as a
sliver near the centre, winds outward through about 105 units of width, and
ends as another sliver at the D's opening. Both ends point down-and-left.

That description is measured rather than asserted. The drawing is a filled
outline and says nothing about where the middle of the ribbon runs, so the
centreline the animation follows had to be recovered by rasterising the mark
and walking its white bands along rays from the centre. Anyone editing the
geometry should know that a second file depends on that shape.

## The files

| File | Plate | Glyph | For |
| - | - | - | - |
| `prototype-v2/public/dana-mark.svg` | graphite-950 | white | Light surfaces. The default, and the file a favicon, a manifest icon or a real email points at |
| `prototype-v2/public/dana-mark-reverse.svg` | white | graphite-950 | Dark surfaces |
| `prototype-v2/src/components/dana-mark.tsx` | either | either | Anywhere in the prototype. Inline, animated, and the only one of the three that can be |

`dana-mark-reverse.svg` is **generated, not authored**. Run
`node scripts/make-mark-reverse.mjs` from `prototype-v2/`; it reads
`dana-mark.svg`, swaps the two fill declarations, and refuses to write if
anything but those two values and the header comment differs. Edit the
original and regenerate — never edit the reverse by hand, because a hand edit
is how the two stop being the same drawing.

## Colours

Two values, both already in the graphite ramp. They are tokens rather than
literals — `--dana-mark-plate` and `--dana-mark-glyph` in
`prototype-v2/src/styles/tokens.css` — because two colourways is the point at
which a component picking its own hexes starts drifting from the file it
copied them from.

| | Plate | Glyph |
| - | - | - |
| On a light surface | `#0a0a0a` graphite-950 | `#ffffff` graphite-0 |
| On a dark surface | `#ffffff` graphite-0 | `#0a0a0a` graphite-950 |

There is no third colourway. The mark is never cobalt, never tinted, and never
sits on a coloured plate; Dana's accent is for interaction and the mark is not
an interaction.

## Choosing one

**Look at what is behind it, not at the theme.** That is why the component's
prop is `surface` and not `tone`: `surface="dark"` states a fact about the
panel that anyone can check, where `tone="light"` asks the reader to remember
which half of the mark the word points at.

- **On a light surface** — the default. Left alone, the component follows the
  document, so this is also what you get by writing nothing.
- **On a dark surface** — `surface="dark"`. Needed on any panel darker than
  about graphite-700, and *required* on graphite-950: the default plate is
  graphite-950 too, so on those panels it does not read as a dark tile, it
  vanishes into the panel and leaves a bare glyph floating. Three panels on
  the public screens shipped that way from the day they were drawn.
- **Glyph only** — `plate={false}`. One use so far: the oversized watermarks,
  drawn at 14% on a dark panel, which want to read as a soft D rather than a
  soft square. Without a plate the glyph inherits the plate's job — it becomes
  the shape that has to stand off the surface — so it takes the plate's colour.

## Sizes it ships at

| Size | Where |
| - | - |
| 28px | Sidebar brand header |
| 32px | Public lockups: landing, legal, email |
| 36px | The invitation and unverified-email panels |
| 440–520px | Watermarks, glyph only, at 14% opacity |

Twenty-eight pixels is the size that governs. Any treatment that cannot be
read at 28px is not a treatment for this mark, which is what ruled out drawing
the animation as a traced outline.

## The animation

Only the glyph moves; the plate is present from the first frame. A wide stroke
runs along the glyph's centreline and the glyph appears wherever the stroke has
reached, so the mark draws itself from the tail's inner tip outward, arriving
in the order a hand would have drawn it.

- **850ms, linear.** Constant progress along a real centreline is constant pen
  speed. Every easing tried spent its slowness on the part with nothing to see.
- **Plays from the enclosing control**, or from the mark itself where there is
  no enclosing control. Never both — `mouseenter` fires on every element being
  entered, so a mark listening alongside its own link redraws from nothing when
  the pointer crosses from the wordmark onto the glyph.
- **Rest state is fully drawn.** With no scripting, or under
  `prefers-reduced-motion`, the mark is simply the logo.
- **Static contexts get the SVG files.** Email, favicons and anything rendered
  outside the app cannot run it, and the component takes `animated={false}` for
  a mock-up standing in for one of those.

## Two things not settled

- **The wordmark beside it.** "Dana" is still coloured by each call site rather
  than by the mark's colourway, so on the dark panels it is a local
  `text-white` and nothing connects the two. Fine today; the first real
  question a dark theme will ask.
- **A dark theme.** `tokens.css` says one is out of scope and that stands. The
  mark carries a single `.dark` rule that flips its default pair, so it is
  ready for a theme without being a claim that one exists.
