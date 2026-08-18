/*
Covers for a folder page — rebuilt 2026-08-18 to Imran's direction against
the Notion picker: a gallery in sections, upload, link, and a free photo
source, with reposition on the cover itself.

Four tiers, each honest about what it is:

- **Colour & gradient** — nine gradients built exclusively from the token
  palette's own hexes. No colour enters the product here that the tokens do
  not already own, which is what makes them brand rather than decoration.
- **The mark** — six covers drawn from Dana's own ribbon geometry (DES-126's
  drawing), oversized and bled off the band's edges in folder-tint gradients.
  This is the cover tier no other product can have.
- **Photos** — Lorem Picsum, a free image source, loaded over the network in
  the dev prototype and honestly absent in the flattened share build (which
  refuses all external requests). The tab says so instead of pretending.
- **Upload** — a real file into an object URL, alive for the session, gone on
  reload, said so in the tab.

Repositioning stores a vertical position per folder for photographic covers;
gradients have no crop to move. Lane 2 throughout: no cover column, no image
storage (DES-105), excluded from the port by DES-130.
*/

import { useRef, useState, type CSSProperties } from "react"

import { Image as ImageIcon, X } from "@/lib/icons"
import { cn } from "@/lib/utils"

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-offset-1"

/* ------------------------------------------------- colour & gradient tier -- */

/* Every stop is a token hex. The names are the palette's own. */
const GRADIENTS: { key: string; name: string; css: string }[] = [
  { key: "gradient:cobalt", name: "Cobalt", css: "linear-gradient(135deg, #e3e8f9 0%, #c9d3f2 45%, #6683d6 100%)" },
  { key: "gradient:cobalt-deep", name: "Deep cobalt", css: "linear-gradient(150deg, #2b4088 0%, #334da3 55%, #6683d6 100%)" },
  { key: "gradient:fern", name: "Fern", css: "linear-gradient(140deg, #ddf2e2 0%, #bfe5ca 45%, #52975d 100%)" },
  { key: "gradient:lagoon", name: "Lagoon", css: "linear-gradient(135deg, #3d998c 0%, #4292bc 100%)" },
  { key: "gradient:violet", name: "Violet", css: "linear-gradient(135deg, #8e71cf 0%, #b562a9 100%)" },
  { key: "gradient:terracotta", name: "Terracotta", css: "linear-gradient(140deg, #c4705d 0%, #b08034 100%)" },
  { key: "gradient:rose", name: "Rose", css: "linear-gradient(135deg, #f8dcd8 0%, #c4627b 100%)" },
  { key: "gradient:graphite", name: "Graphite", css: "linear-gradient(135deg, #f4f5f6 0%, #dddee2 100%)" },
  { key: "gradient:ink", name: "Ink", css: "linear-gradient(160deg, #2f3136 0%, #0a0a0a 100%)" },
]

/* --------------------------------------------------------- the mark tier -- */

/* The ribbon path from `public/dana-mark.svg`, verbatim — the same geometry
   DES-126 measured for the logo reveal. Kept in one constant so the day the
   mark changes, the covers change with it. */
const RIBBON =
  "M362.11 184.85l360.91 0c279.18,0 505.5,228.54 505.5,510.45 0,217.22 -129.71,395.33 -319.74,475.43 -77.93,32.3 -192.36,53.42 -283.66,51.11 8.52,0.21 17.23,0.22 26.09,0.03 -61.62,1.04 -112.19,-14.79 -112.93,-35.33 -0.61,-16.81 32.29,-31.59 78.01,-36.98 54.23,-4.85 80.75,-6.8 142.61,-25.46 66.58,-20.78 108.83,-38.15 166.54,-76.61l-5.49 3.66c117,-72.02 195.99,-202.71 198.6,-352.58l0.07 -0.8 0 -6.87c0,-208.9 -148.39,-382.13 -342.59,-414.16l-13.79 -1.97 -33.31 -3.33 -285.25 0 -47.76 0 -0.06 0 -0 0c-26.78,0.02 -50.7,12.85 -65.96,32.66 -10.84,14.06 -17.3,31.65 -17.3,50.67l0 39.91 0 516.19c0,45.83 37.5,83.33 83.33,83.33 83.46,0 161.45,4.93 243.07,-9.99 164.24,-30.02 311.58,-191.34 277.74,-352.91 -41.17,-196.59 -331.59,-230.04 -420.88,-46 -49.75,102.55 -6.17,224.4 98.17,275.41 24.52,11.72 42.81,19.19 42,32.33 -2.41,39.05 -150.81,9.1 -197.48,-82.02 -24.09,-42.52 -38.18,-90.93 -40.5,-140.68 6.15,-174.41 143.51,-313.83 312.07,-313.83 266.87,0 443.26,341.93 188.38,580.76 -60.23,55.69 -129.3,95.76 -207.33,120.21 -47.7,19.54 -116.29,30.64 -205.37,33.31l-123.67 0c-84.03,0 -152.78,-68.75 -152.78,-152.78l0 -68.63 0 -463.14 0 -68.63c0,-84.03 68.75,-152.78 152.78,-152.78z"

function markCover(
  gradient: { from: string; mid?: string; to: string; angle: number },
  ribbon: { fill: string; opacity: number; transform: string },
) {
  const stops =
    '<stop offset="0" stop-color="' + gradient.from + '"/>' +
    (gradient.mid ? '<stop offset="0.5" stop-color="' + gradient.mid + '"/>' : "") +
    '<stop offset="1" stop-color="' + gradient.to + '"/>'
  /* The gradient angle is approximated by the linearGradient's vector. */
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 280" preserveAspectRatio="xMidYMid slice">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="' +
    (gradient.angle > 120 ? "0.8" : "0.4") +
    '">' + stops + "</linearGradient></defs>" +
    '<rect width="1200" height="280" fill="url(#g)"/>' +
    '<g transform="' + ribbon.transform + '">' +
    '<path d="' + RIBBON + '" fill="' + ribbon.fill + '" fill-opacity="' + ribbon.opacity + '"/>' +
    "</g></svg>"
  return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")'
}

const MARKS: { key: string; name: string; css: string }[] = [
  {
    key: "mark:cobalt",
    name: "The mark · cobalt",
    css: markCover(
      { from: "#2b4088", mid: "#334da3", to: "#6683d6", angle: 150 },
      { fill: "#ffffff", opacity: 0.13, transform: "translate(700,-190) scale(0.92)" },
    ),
  },
  {
    key: "mark:ink",
    name: "The mark · ink",
    css: markCover(
      { from: "#2f3136", to: "#0a0a0a", angle: 160 },
      { fill: "#ffffff", opacity: 0.09, transform: "translate(80,-560) scale(1.5)" },
    ),
  },
  {
    key: "mark:violet",
    name: "The mark · violet",
    css: markCover(
      { from: "#8e71cf", to: "#b562a9", angle: 135 },
      { fill: "#ffffff", opacity: 0.16, transform: "translate(-260,-420) scale(1.1)" },
    ),
  },
  {
    key: "mark:fern",
    name: "The mark · fern",
    css: markCover(
      { from: "#ddf2e2", mid: "#bfe5ca", to: "#52975d", angle: 140 },
      { fill: "#ffffff", opacity: 0.38, transform: "translate(760,-120) scale(0.75)" },
    ),
  },
  {
    key: "mark:rose",
    name: "The mark · rose",
    css: markCover(
      { from: "#f8dcd8", to: "#c4627b", angle: 135 },
      { fill: "#ffffff", opacity: 0.42, transform: "translate(560,-330) scale(-1.05,1.05)" },
    ),
  },
  {
    key: "mark:graphite",
    name: "The mark · graphite",
    css: markCover(
      { from: "#f4f5f6", to: "#dddee2", angle: 135 },
      { fill: "#ffffff", opacity: 0.65, transform: "translate(820,-250) scale(1.0)" },
    ),
  },
]

/* ------------------------------------------------------------ photos tier -- */

/* Lorem Picsum — a genuinely free image source (picsum.photos). The ids are
   pinned so the grid is stable; the tab says plainly that the photos need
   the network, which the flattened share build refuses on purpose. */
const PICSUM_IDS = [1015, 1016, 1018, 1019, 1035, 1039, 1044, 1053]

function picsumThumb(id: number) {
  return `https://picsum.photos/id/${id}/320/90`
}
function picsumFull(id: number) {
  return `https://picsum.photos/id/${id}/1600/400`
}

/* ------------------------------------------------------------ the uploads -- */

/* Session-only, deliberately: see the module comment. */
const uploadedCovers = new Map<string, string>()

export function rememberUploadedCover(folderName: string, url: string) {
  const previous = uploadedCovers.get(folderName)
  if (previous) URL.revokeObjectURL(previous)
  uploadedCovers.set(folderName, url)
}

/* Whether a stored cover has a crop worth moving — photographic tiers only. */
export function coverRepositions(key: string | undefined): boolean {
  if (!key) return false
  return key === "upload" || key.startsWith("photo:") || key.startsWith("link:")
}

/* The style for a stored cover key, or null when there is nothing to draw —
   including an upload key whose object URL did not survive the reload. */
/* The first picker spoke `pattern:*` and `stock:*`; covers chosen then keep
   working rather than silently vanishing. */
const LEGACY_KEYS: Record<string, string> = {
  "pattern:graphite": "gradient:graphite",
  "pattern:cobalt": "gradient:cobalt",
  "pattern:fern": "gradient:fern",
  "pattern:clay": "gradient:terracotta",
  "pattern:violet": "gradient:violet",
  "pattern:dots": "gradient:graphite",
  "pattern:grid": "gradient:graphite",
  "pattern:stripes": "gradient:graphite",
  "stock:dusk": "mark:cobalt",
  "stock:sea": "gradient:lagoon",
  "stock:meadow": "gradient:fern",
  "stock:night": "mark:ink",
}

export function resolveCover(
  key: string | undefined,
  folderName: string,
  position = 50,
): CSSProperties | null {
  if (!key) return null
  key = LEGACY_KEYS[key] ?? key
  if (key === "upload") {
    const url = uploadedCovers.get(folderName)
    return url
      ? {
          backgroundImage: `url("${url}")`,
          backgroundSize: "cover",
          backgroundPosition: `center ${position}%`,
        }
      : null
  }
  if (key.startsWith("photo:")) {
    const id = key.slice("photo:".length)
    return {
      backgroundImage: `url("${picsumFull(Number(id))}")`,
      backgroundSize: "cover",
      backgroundPosition: `center ${position}%`,
      backgroundColor: "var(--color-graphite-100)",
    }
  }
  if (key.startsWith("link:")) {
    return {
      backgroundImage: `url("${key.slice("link:".length)}")`,
      backgroundSize: "cover",
      backgroundPosition: `center ${position}%`,
      backgroundColor: "var(--color-graphite-100)",
    }
  }
  const swatch = [...GRADIENTS, ...MARKS].find((cover) => cover.key === key)
  return swatch
    ? { backgroundImage: swatch.css, backgroundSize: "cover", backgroundPosition: "center" }
    : null
}

/* ------------------------------------------------------------- the picker -- */

function Swatch({
  name,
  css,
  selected,
  onPick,
}: {
  name: string
  css: string
  selected: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-label={name}
      title={name}
      onClick={onPick}
      className={cn(
        "h-12 rounded-[5px] border transition-shadow",
        T_FAST,
        FOCUS,
        selected
          ? "border-transparent ring-2 ring-[var(--color-graphite-700)]"
          : "border-[var(--color-graphite-200)] hover:border-[var(--color-graphite-400)]",
      )}
      style={{ backgroundImage: css, backgroundSize: "cover", backgroundPosition: "center" }}
    />
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="px-0.5 pt-3 pb-1.5 text-[12px] leading-4 font-medium text-[var(--color-graphite-500)] first:pt-0">
      {children}
    </p>
  )
}

export function FolderCoverPicker({
  value,
  folderName,
  onPick,
  onRemove,
}: {
  value: string | undefined
  folderName: string
  onPick: (key: string) => void
  onRemove: () => void
}) {
  const [tab, setTab] = useState<"gallery" | "upload" | "link" | "photos">(
    "gallery",
  )
  const [linkUrl, setLinkUrl] = useState("")
  const fileInput = useRef<HTMLInputElement>(null)

  function takeFile(list: FileList | null) {
    const file = list?.[0]
    if (!file || !file.type.startsWith("image/")) return
    rememberUploadedCover(folderName, URL.createObjectURL(file))
    onPick("upload")
  }

  return (
    <div className="w-[400px]" onClick={(e) => e.stopPropagation()}>
      {/* The tab row, with Remove at its far end — the Notion arrangement,
          in Dana's chrome: a hairline under the row, the active tab marked
          by ink rather than a pill. */}
      <div className="flex items-center gap-0.5 border-b border-[var(--color-graphite-100)] px-2 pt-1.5">
        {(
          [
            ["gallery", "Gallery"],
            ["upload", "Upload"],
            ["link", "Link"],
            ["photos", "Photos"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "-mb-px h-8 border-b-2 px-2.5 text-[12px] leading-4 font-medium transition-colors",
              T_FAST,
              FOCUS,
              tab === key
                ? "border-[var(--color-graphite-800)] text-[var(--color-graphite-800)]"
                : "border-transparent text-[var(--color-graphite-500)] hover:text-[var(--color-graphite-700)]",
            )}
          >
            {label}
          </button>
        ))}
        {value ? (
          <button
            type="button"
            onClick={onRemove}
            className={cn(
              "mb-1 ml-auto flex h-6 items-center gap-1 rounded-md px-2 text-[12px] leading-4 text-[var(--color-graphite-500)] transition-colors hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-700)]",
              T_FAST,
              FOCUS,
            )}
          >
            <X className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={2} aria-hidden="true" />
            Remove
          </button>
        ) : null}
      </div>

      <div className="max-h-[320px] overflow-y-auto p-2">
        {tab === "gallery" ? (
          <>
            <SectionLabel>Colour &amp; gradient</SectionLabel>
            <div role="listbox" aria-label="Gradient covers" className="grid grid-cols-4 gap-1.5">
              {GRADIENTS.map((cover) => (
                <Swatch
                  key={cover.key}
                  name={cover.name}
                  css={cover.css}
                  selected={value === cover.key}
                  onPick={() => onPick(cover.key)}
                />
              ))}
            </div>
            <SectionLabel>The mark</SectionLabel>
            <div role="listbox" aria-label="Mark covers" className="grid grid-cols-2 gap-1.5">
              {MARKS.map((cover) => (
                <Swatch
                  key={cover.key}
                  name={cover.name}
                  css={cover.css}
                  selected={value === cover.key}
                  onPick={() => onPick(cover.key)}
                />
              ))}
            </div>
          </>
        ) : null}

        {tab === "upload" ? (
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              takeFile(event.dataTransfer.files)
            }}
            className="flex h-32 flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-[var(--color-graphite-300)] bg-[var(--color-graphite-25)]"
          >
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                takeFile(event.target.files)
                event.target.value = ""
              }}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md border border-[var(--color-graphite-300)] bg-card px-3 text-[12px] leading-4 font-medium text-[var(--color-graphite-700)] transition-colors hover:bg-[var(--color-graphite-50)]",
                T_FAST,
                FOCUS,
              )}
            >
              <ImageIcon className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={1.75} aria-hidden="true" />
              Choose an image
            </button>
            <p className="text-[11px] leading-4 text-[var(--color-graphite-400)]">
              or drop one here · kept for this session only
            </p>
          </div>
        ) : null}

        {tab === "link" ? (
          <form
            className="flex items-center gap-1.5 py-1"
            onSubmit={(event) => {
              event.preventDefault()
              const trimmed = linkUrl.trim()
              if (!trimmed) return
              onPick(`link:${trimmed}`)
              setLinkUrl("")
            }}
          >
            <input
              value={linkUrl}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              onChange={(event) => setLinkUrl(event.target.value)}
              placeholder="Paste an image link"
              aria-label="Cover image link"
              className={cn(
                "h-8 min-w-0 flex-1 rounded-md border border-[var(--color-graphite-300)] bg-card px-2 text-[13px] leading-5 outline-none",
                "placeholder:text-[var(--color-graphite-400)] focus-visible:border-[var(--color-dana-accent-600)] focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-100)]",
              )}
            />
            <button
              type="submit"
              className={cn(
                "h-8 shrink-0 rounded-md bg-[var(--color-graphite-900)] px-3 text-[12px] leading-4 font-medium text-white transition-colors hover:bg-[var(--color-graphite-800)]",
                T_FAST,
                FOCUS,
              )}
            >
              Use link
            </button>
          </form>
        ) : null}

        {tab === "photos" ? (
          <>
            <div role="listbox" aria-label="Photo covers" className="grid grid-cols-2 gap-1.5">
              {PICSUM_IDS.map((id) => (
                <Swatch
                  key={id}
                  name={`Photo ${id}`}
                  css={`url("${picsumThumb(id)}")`}
                  selected={value === `photo:${id}`}
                  onPick={() => onPick(`photo:${id}`)}
                />
              ))}
            </div>
            <p className="px-0.5 pt-2 text-[11px] leading-4 text-[var(--color-graphite-400)]">
              Free photos from Lorem Picsum · loaded over the network, so the
              offline share build shows a plain ground instead
            </p>
          </>
        ) : null}
      </div>
    </div>
  )
}
