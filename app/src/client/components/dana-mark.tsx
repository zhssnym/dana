/*
Dana's mark, drawn rather than fetched, and animated like the icon family.

**Why this is a component and not an `<img>`.** An `<img>` is a file the page
has to ask the network for, and it is opaque to the document, so the inner mark
inside it is unreachable: no mask, no stroke, nothing to move. A build flattened
into one self-contained file for sharing refuses every external request, so an
`<img>` logo is a missing logo there.

`public/dana-mark.svg` stays where it is; it is still the file a favicon, a
manifest icon or a real transactional email would point at. The geometry below
is copied from it verbatim and the two must be changed together.

**The animation, and why the pen is a mask.** The icon family's animation
vocabulary is drawing, wiggling and popping a 24px glyph. The mark is not a
glyph: it is a filled spiral, and the two obvious translations of "draw it" both
fail. Tracing its outline puts a hairline pen around a shape whose contour runs
inward and back out, invisible at the 28px the sidebar renders it. Stroking a
centreline means authoring a centreline that does not exist in the file.

So the pen is the mask. `SWEEP_PATH` is a wide stroke running along the ribbon's
own centreline, drawn from the tail's inner tip outward, and the mark appears
wherever that stroke has reached. It reads at 28px because the moving edge is as
wide as the ribbon it is uncovering, and it holds up at the 520px watermark size
because it is tracing real geometry rather than an effect laid over the top.

**Where the centreline came from, since it is in no file.** The mark was
rasterised and sampled along rays from its centre, every two degrees, and the
white bands on each ray were followed from one to the next: the band nearest the
last one is the same ribbon, one step on. That walk reports what the drawing
actually is, a spiral of just under two turns, starting as a sliver at r
approximately 218 pointing down-and-left, widening to about 105 units, and
ending as another sliver at r approximately 516 in the same direction, which is
the D's opening. The 368 measured midpoints were reduced to 80 by
Douglas-Peucker at a tolerance of 2 units, which is invisible under a stroke 150
wide.

**Why 150 wide, and butt-capped.** The ribbon is about 105 units across and the
turns sit about 200 apart, so 150 clears the ribbon at every point while leaving
about 25 units of gap to the neighbouring turn: the animation must never uncover
a stretch the pen has not reached yet. A round cap would push the leading edge
75 units past the pen; a butt cap keeps the edge square across the ribbon, which
is what a stroke looks like.

**Three details that are load-bearing:**

- **The mask id must be unique per instance.** Two marks on one page, and the
  landing page has three, sharing an id means the second one silently steals the
  first one's mask. Hence `useId`.
- **The rest state is fully drawn.** `strokeDashoffset` sits at 0 and the
  animation runs 1 to 0, so a mark that never animates, or animates with
  scripting off, is simply the logo.
- **The sweep must finish at exactly the whole mark.** Anything the pen misses
  is a piece of the logo that never arrives. Checked by rasterising at full
  reveal and counting: 100.00% of the mark's 62,385 pixels, and the path is
  extended eight degrees past each tapered tip so neither sliver is clipped.

**What plays it.** Hovering the enclosing link, button or menu item, the same
walk-up `lib/icons.tsx` does and for the same reason, or the mark itself where
there is no such ancestor, which a 28px logo is a big enough target for in a way
a 14px icon in a row is not. The decorative watermarks are `pointer-events-none`
and have no interactive ancestor, so they stay still without being told to. It
finishes once started rather than snapping back on mouse-out: a half-drawn logo
vanishing is worse than a whole one arriving late. And `prefers-reduced-motion`
turns it off entirely.

**Also worth knowing.**

- **`cn` comes from `./ui/utils.js`**, for the reason `ui/utils.ts` records in
  its own header.
- **The root carries `data-dana-mark`**, so a test can address a mark (AC-265):
  an `<svg>` addressed by what is inside it is indistinguishable from the
  several dozen the icon family draws on any page. This is the addressing
  contract of 9.1 one level down.
- **The two colours live in `styles/tokens.css`**, under `--dana-mark-plate` and
  `--dana-mark-glyph` with the two `[data-dana-mark-surface]` blocks.
*/

import { useEffect, useId, useRef, type SVGProps } from 'react'

import { cn } from './ui/utils.js'

/* Copied verbatim from `public/dana-mark.svg`. The plate is the rounded
   square; the mark is the white D-like spiral inside it, and it is the only
   part that moves. */
const PLATE_PATH =
  'M347.22 0l694.44 0c190.97,0 347.22,156.25 347.22,347.22l0 694.44c0,190.97 -156.25,347.22 -347.22,347.22l-694.44 0c-190.98,0 -347.22,-156.25 -347.22,-347.22l0 -694.44c0,-190.98 156.25,-347.22 347.22,-347.22z'

const MARK_PATH =
  'M362.11 184.85l360.91 0c279.18,0 505.5,228.54 505.5,510.45 0,217.22 -129.71,395.33 -319.74,475.43 -77.93,32.3 -192.36,53.42 -283.66,51.11 8.52,0.21 17.23,0.22 26.09,0.03 -61.62,1.04 -112.19,-14.79 -112.93,-35.33 -0.61,-16.81 32.29,-31.59 78.01,-36.98 54.23,-4.85 80.75,-6.8 142.61,-25.46 66.58,-20.78 108.83,-38.15 166.54,-76.61l-5.49 3.66c117,-72.02 195.99,-202.71 198.6,-352.58l0.07 -0.8 0 -6.87c0,-208.9 -148.39,-382.13 -342.59,-414.16l-13.79 -1.97 -33.31 -3.33 -285.25 0 -47.76 0 -0.06 0 -0 0c-26.78,0.02 -50.7,12.85 -65.96,32.66 -10.84,14.06 -17.3,31.65 -17.3,50.67l0 39.91 0 516.19c0,45.83 37.5,83.33 83.33,83.33 83.46,0 161.45,4.93 243.07,-9.99 164.24,-30.02 311.58,-191.34 277.74,-352.91 -41.17,-196.59 -331.59,-230.04 -420.88,-46 -49.75,102.55 -6.17,224.4 98.17,275.41 24.52,11.72 42.81,19.19 42,32.33 -2.41,39.05 -150.81,9.1 -197.48,-82.02 -24.09,-42.52 -38.18,-90.93 -40.5,-140.68 6.15,-174.41 143.51,-313.83 312.07,-313.83 266.87,0 443.26,341.93 188.38,580.76 -60.23,55.69 -129.3,95.76 -207.33,120.21 -47.7,19.54 -116.29,30.64 -205.37,33.31l-123.67 0c-84.03,0 -152.78,-68.75 -152.78,-152.78l0 -68.63 0 -463.14 0 -68.63c0,-84.03 68.75,-152.78 152.78,-152.78z'

const VIEW_BOX_SIZE = 1388.89

/* The ribbon's centreline, measured off the drawing rather than authored: 80
   points from the tail's inner tip, round just under two turns, out to the D's
   opening. Same viewBox as the mark. See the header for how it was derived. */
const SWEEP_PATH =
  'M659.5 898.4L598.4 889.4L552.3 872.4L523.4 854.7L486.1 818.5L454.9 764.9L446.4 739.3L435.6 685.4L439.0 629.7L451.5 584.5L482.3 525.9L512.7 489.1L533.9 469.6L565.5 447.4L591.4 434.1L627.5 419.5L675.5 410.3L714.7 408.9L763.5 415.1L801.1 426.6L836.8 443.3L877.1 471.3L905.3 498.5L930.0 529.0L952.6 572.2L968.3 628.1L973.6 675.7L965.0 741.5L938.1 811.3L909.2 859.4L872.0 902.4L836.1 935.6L785.9 970.8L727.3 1002.1L670.9 1022.4L633.6 1031.5L535.8 1042.2L452.2 1043.9L371.2 1042.6L333.0 1032.3L301.6 1012.6L288.4 1000.2L278.4 985.2L263.4 952.3L259.5 914.4L259.7 358.2L266.5 313.2L273.5 292.2L284.2 274.2L314.3 246.3L333.0 236.7L353.5 230.2L399.3 227.0L740.5 227.2L805.0 235.4L883.1 258.6L941.7 287.7L983.2 314.1L1021.4 345.3L1077.5 405.5L1096.4 432.6L1127.8 490.5L1152.0 551.8L1164.7 599.7L1172.7 665.2L1172.9 731.4L1167.3 780.8L1138.2 876.0L1107.5 934.8L1080.2 976.5L1036.2 1026.2L986.1 1069.7L930.5 1105.8L900.9 1120.9L855.4 1141.4L791.7 1162.0L691.4 1180.9L639.3 1184.7L530.2 1183.1L472.7 1177.4'

/* Wide enough to clear the ~105-unit ribbon, narrow enough to leave ~25 units
   of gap to the neighbouring turn. */
const SWEEP_WIDTH = 150

const SWEEP_DURATION_MS = 850
/* Linear, which for once is the considered answer rather than the unconsidered
   one. The dash runs along a real centreline, so constant progress along it is
   constant pen speed, exactly what drawing looks like. Every curve tried
   instead broke on the same rock: the inner turn is short and the outer turn
   is long, so any easing that is slow at one end wastes its slowness on the
   part with nothing to see. Measured at 25/50/75% of the duration, an
   ease-in-out drew 7/50/93%, a quarter of a second of apparently nothing
   while the pen inched off the tail's tip, and every ease-out drew 55/87/98%,
   whipping through the tail to crawl around the bowl. Linear draws 25/50/75%.
   The one place it costs anything is the finish, which stops rather than
   settles, and at the last sliver of a 28px mark that is not visible. */
const SWEEP_EASING = 'linear'

/* The same scopes `lib/icons.tsx` plays from, so the logo answers to whatever
   it is sitting in rather than only to itself. */
const HOVER_SCOPE = [
  'button',
  'a',
  "[role='menuitem']",
  'label',
  "[data-slot='sidebar-menu-item']",
].join(', ')

export interface DanaMarkProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  /* Off for a mark that is standing in for one somewhere motion cannot
     follow, which today means the transactional email mock-up. */
  animated?: boolean
  /* What the mark is sitting on, not what colour it is. Left alone it follows
     the document; say it where the surface disagrees with the document, which
     today is the three graphite-950 panels on the public screens. */
  surface?: 'auto' | 'light' | 'dark'
  /* The glyph without its tile. One use: the oversized watermarks, which are
     drawn at 14% on a dark panel and want to read as a soft D rather than a
     soft square. They got that by accident while the plate happened to be the
     same colour as the panel behind them; this is the same picture, asked for
     on purpose, and it survives the plate changing colour. */
  plate?: boolean
}

export function DanaMark({
  className,
  animated = true,
  surface = 'auto',
  plate = true,
  ...rest
}: DanaMarkProps): React.JSX.Element {
  const maskId = `dana-mark-sweep-${useId()}`
  const svg = useRef<SVGSVGElement | null>(null)
  const sweep = useRef<SVGPathElement | null>(null)

  useEffect(() => {
    const root = svg.current
    const stroke = sweep.current
    if (!animated || root === null || stroke === null) return undefined

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined

    let running: Animation | null = null
    const play = (): void => {
      running?.cancel()
      running = stroke.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
        duration: SWEEP_DURATION_MS,
        easing: SWEEP_EASING,
      })
    }

    /* The control the mark belongs to, or the mark itself if it belongs to
       nothing: a lockup that is only a heading, like the sign-in panel's,
       has no such ancestor and plays from the logo instead.

       Deliberately one target and not both. `mouseenter` fires on every
       element being entered, so a mark listening alongside its own link
       restarts the sweep the moment the pointer crosses from the wordmark
       onto the glyph, a redraw from nothing halfway through the first. */
    const target = root.closest(HOVER_SCOPE) ?? root
    target.addEventListener('mouseenter', play)

    return () => {
      target.removeEventListener('mouseenter', play)
      running?.cancel()
    }
  }, [animated])

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${VIEW_BOX_SIZE} ${VIEW_BOX_SIZE}`}
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', className)}
      /* Seam 2 of the header: how AC-265 finds a mark. */
      data-dana-mark=""
      data-dana-mark-surface={surface === 'auto' ? undefined : surface}
      {...rest}
    >
      <mask
        id={maskId}
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width={VIEW_BOX_SIZE}
        height={VIEW_BOX_SIZE}
      >
        <path
          ref={sweep}
          d={SWEEP_PATH}
          fill="none"
          stroke="#fff"
          strokeWidth={SWEEP_WIDTH}
          strokeLinecap="butt"
          strokeLinejoin="round"
          /* Normalising the path to a length of 1 makes the dash pattern read
             as a fraction, so the animation is 1 to 0 rather than a number
             nobody can check against the geometry. */
          pathLength={1}
          strokeDasharray="1 1"
          strokeDashoffset={0}
        />
      </mask>

      {plate ? <path fill="var(--dana-mark-plate)" d={PLATE_PATH} /> : null}
      {/* With no tile the glyph inherits the tile's job, it becomes the shape
          that has to stand off the surface, so it takes the tile's colour.
          The glyph colour is the one that reads *against* the tile, and with
          the tile gone that is the colour of the surface itself. */}
      <path
        fill={plate ? 'var(--dana-mark-glyph)' : 'var(--dana-mark-plate)'}
        mask={`url(#${maskId})`}
        d={MARK_PATH}
      />
    </svg>
  )
}
