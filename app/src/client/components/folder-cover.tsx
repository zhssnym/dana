/*
Covers for a folder page, rebuilt 2026-08-18 to Imran's direction against
the Notion picker: a gallery in sections, upload, link, and a free photo
source, with reposition on the cover itself.

Four tiers, each honest about what it is:

- **Colour & gradient**, nine gradients built exclusively from the token
  palette's own hexes. No colour enters the product here that the tokens do
  not already own, which is what makes them brand rather than decoration.
- **The mark**, six covers drawn from Dana's own ribbon geometry (DES-126's
  drawing), oversized and bled off the band's edges in folder-tint gradients.
  This is the cover tier no other product can have.
- **Photos**, Lorem Picsum, a free image source, loaded over the network in
  the dev prototype and honestly absent in the flattened share build (which
  refuses all external requests). The tab says so instead of pretending.
- **Upload**, a real file into an object URL, alive for the session, gone on
  reload, said so in the tab.

Repositioning stores a vertical position per folder for photographic covers;
gradients have no crop to move. Lane 2 throughout: no cover column, no image
storage (DES-105), excluded from the port by DES-130.
*/

/*
Lifted at S25 (RFC 0004's places row, RFC 0005 change control item 44's B1),
which answers the Lane 2 sentence above: 4.20's `user_page_covers` is the
cover column a place page never had, and 7.19 is its wire. Three seams, each
named here rather than left to be found, and nothing else in this file moves.

**The seam is the picker's own props, and they were already props.** `value`,
`onPick` and `onRemove` were the prototype's interface before this row, so
the store this file used to sit over was never inside it; the store was the
call site's, which is `page-cover.tsx`. That is the whole reason this file
crosses as nearly as it does.

**`onUpload` is new at S26, and it is the second half of `tiers`.** The
prototype's Upload tab makes an object URL that lives for the session, which
its own tab says in words; a folder page has 7.15 and 4.3's `cover_file_id`,
so the bytes are stored and the cover survives a reload. The prop is optional
and its absence is the prototype's behaviour unchanged, which is what keeps
every other call site as it was.

**`tiers` is new, and it is a measurement rather than a preference.** 4.20
holds a cover as a `preset` or a `file_id`, and a file has to exist for the
second: `POST /api/v1/files` requires `folder_id` as a uuid
(`server/routes/files.ts:48-52`), so there is today no way to make a file
that is not some folder's, and a place page is not a folder. So the Upload,
Link and Photos tabs have nothing behind them here, and a control that is
drawn and does nothing is the false green protocol section 4 forbids. The
tab list is a prop, defaulting to all four so the folder page's own call at
S26 is unchanged, and the place head passes the two B1 supplies. DES-144 is
the rule and this file's own author states it: a tier a surface cannot
honestly draw is a tier it does not draw, never a disabled one. **B8 is what
lifts the other two**, with the provider, its key and its attribution, and
7.15 owes it a folderless file or 4.20's `file_id` owes it another home.

**The photo tier is Openverse and not Lorem Picsum**, which the module
comment above says and the code has not done since the picker was rebuilt:
`searchOpenverse` calls `api.openverse.org` and only the legacy `photo:`
keys still resolve through Picsum. Recorded because B8 is written against
"the prototype's photo tier" and would otherwise build the wrong one.
*/

import { Input } from "./ui/input.js"
import { useRef, useState, type CSSProperties } from "react"
import { z } from "zod"

import { getPlain } from "../api/http.js"
import { Image as ImageIcon, LoaderCircle, Search, X } from "../lib/icons.js"
import { cn } from "./ui/utils.js"

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

/* The ribbon path from `public/dana-mark.svg`, verbatim, the same geometry
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

/* Openverse, the openly licensed image search run by the Openverse project
   (api.openverse.org), standing where the reference design had Unsplash.
   Real search over a real free-source platform; the tab says plainly that it
   needs the network, which the flattened share build refuses on purpose.
   Legacy `photo:` keys from the first picker resolve through Picsum so a
   cover chosen then keeps rendering. */
interface OpenverseResult {
  id: string
  title: string
  creator: string
  thumb: string
  url: string
}

const openverseSearch = z.object({
  results: z.array(z.object({
    id: z.string(),
    title: z.string().optional(),
    creator: z.string().optional(),
    thumb: z.string().optional(),
  })).optional(),
})

async function searchOpenverse(query: string): Promise<OpenverseResult[]> {
  /* Through this origin since the polish round of 2026-08-30: 10.8's CSP
     (connect-src 'self') refuses a direct call to api.openverse.org, so the
     server proxies the search and serves each thumbnail itself — see
     `routes/cover-photos.ts` for the whole reasoning. The lab build, which
     has no server, gets the tab's offline copy instead of a broken grid. */
  const data = await getPlain(openverseSearch, "/covers/photos", { q: query })
  return (data.results ?? [])
    .filter((item) => item.thumb)
    .map((item) => ({
      id: item.id,
      title: item.title ?? "Untitled",
      creator: item.creator ?? "unknown",
      thumb: item.thumb!,
      url: item.id,
    }))
}

/* ------------------------------------------------------------ the uploads -- */

/* Session-only, deliberately: see the module comment. */
const uploadedCovers = new Map<string, string>()

export function rememberUploadedCover(folderName: string, url: string) {
  const previous = uploadedCovers.get(folderName)
  if (previous) URL.revokeObjectURL(previous)
  uploadedCovers.set(folderName, url)
}

/* Whether a stored cover has a crop worth moving, photographic tiers only. */
export function coverRepositions(key: string | undefined): boolean {
  if (!key) return false
  return key === "upload" || key.startsWith("photo:") || key.startsWith("link:")
}

/* The style for a stored cover key, or null when there is nothing to draw ,
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
    /* Legacy tier from the first picker: pinned Picsum ids. */
    const id = key.slice("photo:".length)
    return {
      backgroundImage: `url("https://picsum.photos/id/${Number(id)}/1600/400")`,
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
        "h-16 rounded-md border transition-shadow",
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

export type CoverTier = "gallery" | "upload" | "link" | "photos"

/* The seam this file's header names: which tiers the caller can honestly
   supply. All four by default, so a call site that has them passes nothing. */
export const ALL_COVER_TIERS: readonly CoverTier[] = ["gallery", "upload", "link", "photos"]

export function FolderCoverPicker({
  value,
  folderName,
  onPick,
  onRemove,
  tiers = ALL_COVER_TIERS,
  onUpload,
  onPickPhoto,
}: {
  value: string | undefined
  folderName: string
  onPick: (key: string) => void
  onRemove: () => void
  tiers?: readonly CoverTier[]
  /* The S26 seam: where the caller can store the bytes, it takes them. */
  onUpload?: (file: File) => void
  /* The photo tier's same seam (polish round, 2026-08-30): where the caller
     can turn a chosen photograph into a stored file, the pick goes there;
     the lab, which cannot, keeps the legacy link key. */
  onPickPhoto?: (photoId: string) => void
}) {
  const [tab, setTab] = useState<CoverTier>(tiers[0] ?? "gallery")
  const [linkUrl, setLinkUrl] = useState("")
  const fileInput = useRef<HTMLInputElement>(null)
  const [photoQuery, setPhotoQuery] = useState("")
  const [photoResults, setPhotoResults] = useState<OpenverseResult[]>([])
  const [photoLoading, setPhotoLoading] = useState(false)
  const [photoError, setPhotoError] = useState("")
  const [photoSearched, setPhotoSearched] = useState(false)

  async function runPhotoSearch() {
    const query = photoQuery.trim()
    if (!query || photoLoading) return
    setPhotoLoading(true)
    setPhotoError("")
    try {
      const results = await searchOpenverse(query)
      setPhotoResults(results)
      setPhotoSearched(true)
      if (results.length === 0) setPhotoError(`Nothing found for “${query}”.`)
    } catch {
      setPhotoError(
        "Openverse could not be reached, photo search needs the network.",
      )
    } finally {
      setPhotoLoading(false)
    }
  }

  function takeFile(list: FileList | null) {
    const file = list?.[0]
    if (!file || !file.type.startsWith("image/")) return
    /* The S26 seam. Without one this is the prototype's session-only URL,
       which is what the tab below still says where that is the truth. */
    if (onUpload) {
      onUpload(file)
      return
    }
    rememberUploadedCover(folderName, URL.createObjectURL(file))
    onPick("upload")
  }

  return (
    /* The popover hugs this width rather than imposing its own: the base
       PopoverContent is w-80, so a 440px picker used to overflow its panel
       and put Remove outside the white (Imran caught it). */
    <div className="w-[440px] max-w-full" onClick={(e) => e.stopPropagation()}>
      {/* The tab row, with Remove at its far end, the Notion arrangement,
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
        )
          /* The `tiers` seam, and the only place it is read: a tab whose
             tier the caller cannot supply is absent rather than disabled. */
          .filter(([key]) => tiers.includes(key))
          .map(([key, label]) => (
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

      <div className="max-h-[360px] overflow-y-auto p-2.5">
        {tab === "gallery" ? (
          <>
            <SectionLabel>Colour &amp; gradient</SectionLabel>
            <div role="listbox" aria-label="Gradient covers" className="grid grid-cols-3 gap-2">
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
            <div role="listbox" aria-label="Mark covers" className="grid grid-cols-2 gap-2">
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
              {/* The tab says what is true of this caller, which is the whole
                  of the S26 seam reaching the copy. */}
              {onUpload ? "or drop one here" : "or drop one here · kept for this session only"}
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
            <Input
              value={linkUrl}
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
            <form
              className="flex items-center gap-1.5 pb-2"
              onSubmit={(event) => {
                event.preventDefault()
                void runPhotoSearch()
              }}
            >
              <div
                className={cn(
                  "flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-[var(--color-graphite-300)] bg-card px-2 transition-colors",
                  T_FAST,
                  "focus-within:border-[var(--color-dana-accent-600)] focus-within:ring-2 focus-within:ring-[var(--color-dana-accent-100)]",
                )}
              >
                <Search className="size-3.5 shrink-0 text-[var(--color-graphite-400)]" strokeWidth={1.75} aria-hidden="true" />
                <Input bare
                  value={photoQuery}
                  autoFocus
                  onChange={(event) => setPhotoQuery(event.target.value)}
                  placeholder="Search openly licensed photos"
                  aria-label="Search openly licensed photos"
                  className="min-w-0 flex-1 bg-transparent text-[13px] leading-5 outline-none placeholder:text-[var(--color-graphite-400)]"
                />
              </div>
              <button
                type="submit"
                disabled={photoLoading || !photoQuery.trim()}
                className={cn(
                  "flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-[var(--color-graphite-900)] px-3 text-[12px] leading-4 font-medium text-white transition-colors hover:bg-[var(--color-graphite-800)] disabled:pointer-events-none disabled:opacity-40",
                  T_FAST,
                  FOCUS,
                )}
              >
                {photoLoading ? (
                  <LoaderCircle className="size-3.5 animate-spin data-[size=sm]:size-3.5" strokeWidth={2} aria-hidden="true" />
                ) : null}
                Search
              </button>
            </form>

            {photoError ? (
              <p className="px-0.5 py-1 text-[12px] leading-4 text-[var(--color-graphite-500)]">
                {photoError}
              </p>
            ) : null}

            {photoResults.length > 0 ? (
              <div role="listbox" aria-label="Photo results" className="grid grid-cols-3 gap-2">
                {photoResults.map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    role="option"
                    aria-selected={value === `link:${photo.url}`}
                    title={`${photo.title}, ${photo.creator}`}
                    aria-label={`${photo.title} by ${photo.creator}`}
                    onClick={() => {
                      if (onPickPhoto) onPickPhoto(photo.id)
                      else onPick(`link:${photo.url}`)
                    }}
                    className={cn(
                      "h-16 rounded-md border bg-[var(--color-graphite-100)] bg-cover bg-center transition-shadow",
                      T_FAST,
                      FOCUS,
                      value === `link:${photo.url}`
                        ? "border-transparent ring-2 ring-[var(--color-graphite-700)]"
                        : "border-[var(--color-graphite-200)] hover:border-[var(--color-graphite-400)]",
                    )}
                    style={{ backgroundImage: `url("${photo.thumb}")` }}
                  />
                ))}
              </div>
            ) : !photoSearched && !photoError ? (
              <p className="px-0.5 py-4 text-center text-[12px] leading-4 text-[var(--color-graphite-400)]">
                Search Openverse for an openly licensed cover ,
                “mountains”, “linen”, “night sky”…
              </p>
            ) : null}

            <p className="px-0.5 pt-2 text-[11px] leading-4 text-[var(--color-graphite-400)]">
              Openverse · openly licensed images · loaded over the network, so
              the offline share build shows a plain ground instead
            </p>
          </>
        ) : null}
      </div>
    </div>
  )
}
