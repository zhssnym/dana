// Dana's mark, drawn inline so it works without network requests and can animate.
// A wide stroke along the ribbon's centreline is the reveal mask. The mask id must
// be unique per instance, and the rest state is fully drawn.

import { useEffect, useId, useRef, type SVGProps } from 'react'

import { cn } from './ui/utils.js'

// Copied from `public/dana-mark.svg`; change both together.
const PLATE_PATH =
  'M347.22 0l694.44 0c190.97,0 347.22,156.25 347.22,347.22l0 694.44c0,190.97 -156.25,347.22 -347.22,347.22l-694.44 0c-190.98,0 -347.22,-156.25 -347.22,-347.22l0 -694.44c0,-190.98 156.25,-347.22 347.22,-347.22z'

const MARK_PATH =
  'M362.11 184.85l360.91 0c279.18,0 505.5,228.54 505.5,510.45 0,217.22 -129.71,395.33 -319.74,475.43 -77.93,32.3 -192.36,53.42 -283.66,51.11 8.52,0.21 17.23,0.22 26.09,0.03 -61.62,1.04 -112.19,-14.79 -112.93,-35.33 -0.61,-16.81 32.29,-31.59 78.01,-36.98 54.23,-4.85 80.75,-6.8 142.61,-25.46 66.58,-20.78 108.83,-38.15 166.54,-76.61l-5.49 3.66c117,-72.02 195.99,-202.71 198.6,-352.58l0.07 -0.8 0 -6.87c0,-208.9 -148.39,-382.13 -342.59,-414.16l-13.79 -1.97 -33.31 -3.33 -285.25 0 -47.76 0 -0.06 0 -0 0c-26.78,0.02 -50.7,12.85 -65.96,32.66 -10.84,14.06 -17.3,31.65 -17.3,50.67l0 39.91 0 516.19c0,45.83 37.5,83.33 83.33,83.33 83.46,0 161.45,4.93 243.07,-9.99 164.24,-30.02 311.58,-191.34 277.74,-352.91 -41.17,-196.59 -331.59,-230.04 -420.88,-46 -49.75,102.55 -6.17,224.4 98.17,275.41 24.52,11.72 42.81,19.19 42,32.33 -2.41,39.05 -150.81,9.1 -197.48,-82.02 -24.09,-42.52 -38.18,-90.93 -40.5,-140.68 6.15,-174.41 143.51,-313.83 312.07,-313.83 266.87,0 443.26,341.93 188.38,580.76 -60.23,55.69 -129.3,95.76 -207.33,120.21 -47.7,19.54 -116.29,30.64 -205.37,33.31l-123.67 0c-84.03,0 -152.78,-68.75 -152.78,-152.78l0 -68.63 0 -463.14 0 -68.63c0,-84.03 68.75,-152.78 152.78,-152.78z'

const VIEW_BOX_SIZE = 1388.89

// The ribbon's centreline, measured off the drawing. Same viewBox as the mark.
const SWEEP_PATH =
  'M659.5 898.4L598.4 889.4L552.3 872.4L523.4 854.7L486.1 818.5L454.9 764.9L446.4 739.3L435.6 685.4L439.0 629.7L451.5 584.5L482.3 525.9L512.7 489.1L533.9 469.6L565.5 447.4L591.4 434.1L627.5 419.5L675.5 410.3L714.7 408.9L763.5 415.1L801.1 426.6L836.8 443.3L877.1 471.3L905.3 498.5L930.0 529.0L952.6 572.2L968.3 628.1L973.6 675.7L965.0 741.5L938.1 811.3L909.2 859.4L872.0 902.4L836.1 935.6L785.9 970.8L727.3 1002.1L670.9 1022.4L633.6 1031.5L535.8 1042.2L452.2 1043.9L371.2 1042.6L333.0 1032.3L301.6 1012.6L288.4 1000.2L278.4 985.2L263.4 952.3L259.5 914.4L259.7 358.2L266.5 313.2L273.5 292.2L284.2 274.2L314.3 246.3L333.0 236.7L353.5 230.2L399.3 227.0L740.5 227.2L805.0 235.4L883.1 258.6L941.7 287.7L983.2 314.1L1021.4 345.3L1077.5 405.5L1096.4 432.6L1127.8 490.5L1152.0 551.8L1164.7 599.7L1172.7 665.2L1172.9 731.4L1167.3 780.8L1138.2 876.0L1107.5 934.8L1080.2 976.5L1036.2 1026.2L986.1 1069.7L930.5 1105.8L900.9 1120.9L855.4 1141.4L791.7 1162.0L691.4 1180.9L639.3 1184.7L530.2 1183.1L472.7 1177.4'

// Wide enough to clear the ~105-unit ribbon, narrow enough to miss the next turn.
const SWEEP_WIDTH = 150

const SWEEP_DURATION_MS = 850
// Linear: the dash runs along the real centreline, so constant progress is constant
// pen speed. Easing curves stalled on the short inner turn.
const SWEEP_EASING = 'linear'

// The same hover scopes `lib/icons.tsx` plays from.
const HOVER_SCOPE = [
  'button',
  'a',
  "[role='menuitem']",
  'label',
  "[data-slot='sidebar-menu-item']",
].join(', ')

export interface DanaMarkProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  animated?: boolean
  // What the mark sits on, where the surface disagrees with the document.
  surface?: 'auto' | 'light' | 'dark'
  // The glyph without its tile, for the oversized watermarks.
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

    // One target only: `mouseenter` on both the link and the mark would restart the
    // sweep when the pointer crosses onto the glyph.
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
      // How AC-265 finds a mark.
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
          // A path length of 1 makes the dash read as a fraction.
          pathLength={1}
          strokeDasharray="1 1"
          strokeDashoffset={0}
        />
      </mask>

      {plate ? <path fill="var(--dana-mark-plate)" d={PLATE_PATH} /> : null}
      {/* With no tile, the glyph takes the tile's colour to stand off the surface. */}
      <path
        fill={plate ? 'var(--dana-mark-glyph)' : 'var(--dana-mark-plate)'}
        mask={`url(#${maskId})`}
        d={MARK_PATH}
      />
    </svg>
  )
}
