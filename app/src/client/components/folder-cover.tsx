/*
Covers for a page: a small set of flat colours, upload, link, and a free photo
source, with reposition on the cover itself.

The colours are theme tokens (hover, info-200, success-200, warning-200,
danger-100) rather than hexes, so each one follows light and
dark instead of standing as a bright slab on a dark page. There are no
gradients (AGENTS.md, "Quiet"); a stored gradient or mark from before reads as
the nearest flat colour.

**The picker is its props.** `value`, `onPick` and `onRemove` are the interface;
the store is the call site's (`page-cover.tsx`, through `lib/page-identity.ts`).
`tiers` is what the caller can actually store; a tab it cannot is not drawn.
*/

import { Input } from "./ui/input.js"
import { useRef, useState, type CSSProperties } from "react"
import { z } from "zod"

import { getPlain } from "../api/http.js"
import { Image as ImageIcon, LoaderCircle, Search, X } from "../lib/icons.js"
import { Button } from "./ui/button.js"
import { cn } from "./ui/utils.js"

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"

/* ------------------------------------------------------------ colours -- */

/* Flat, and each a token with both a light and a dark value. */
const COLOURS: { key: string; name: string; css: string }[] = [
  { key: "colour:grey", name: "Grey", css: "var(--hover)" },
  { key: "colour:blue", name: "Blue", css: "var(--color-info-200)" },
  { key: "colour:green", name: "Green", css: "var(--color-success-200)" },
  { key: "colour:yellow", name: "Yellow", css: "var(--color-warning-200)" },
  { key: "colour:red", name: "Red", css: "var(--color-danger-100)" },
]

/** A colour at random, for "Add cover" in one press. */
export function randomCoverColour(): string {
  const pick = COLOURS[Math.floor(Math.random() * COLOURS.length)] ?? COLOURS[0]
  return pick?.key ?? "colour:grey"
}

/* Keys stored before the colours were flat: every gradient, mark, pattern and
   stock cover reads as its nearest colour rather than vanishing. */
const LEGACY_KEYS: Record<string, string> = {
  "gradient:cobalt": "colour:blue",
  "gradient:cobalt-deep": "colour:blue",
  "gradient:lagoon": "colour:blue",
  "gradient:violet": "colour:blue",
  "gradient:fern": "colour:green",
  "gradient:terracotta": "colour:yellow",
  "gradient:rose": "colour:red",
  "gradient:graphite": "colour:grey",
  "gradient:ink": "colour:grey",
  "mark:cobalt": "colour:blue",
  "mark:violet": "colour:blue",
  "mark:fern": "colour:green",
  "mark:rose": "colour:red",
  "mark:graphite": "colour:grey",
  "mark:ink": "colour:grey",
  "pattern:graphite": "colour:grey",
  "pattern:cobalt": "colour:blue",
  "pattern:fern": "colour:green",
  "pattern:clay": "colour:yellow",
  "pattern:violet": "colour:blue",
  "pattern:dots": "colour:grey",
  "pattern:grid": "colour:grey",
  "pattern:stripes": "colour:grey",
  "stock:dusk": "colour:blue",
  "stock:sea": "colour:blue",
  "stock:meadow": "colour:green",
  "stock:night": "colour:grey",
}

/* ------------------------------------------------------------ photos tier -- */

/* Openverse, the openly licensed image search, through this origin's
   `/covers/photos` proxy (10.8's CSP refuses a direct call). */
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

/* Session-only where the caller has no uploader. */
const uploadedCovers = new Map<string, string>()

export function rememberUploadedCover(folderName: string, url: string) {
  const previous = uploadedCovers.get(folderName)
  if (previous) URL.revokeObjectURL(previous)
  uploadedCovers.set(folderName, url)
}

/* Whether a stored cover has a crop worth moving, photographic tiers only. */
export function coverRepositions(key: string | undefined): boolean {
  if (!key) return false
  return key === "upload" || key.startsWith("link:")
}

/* The style for a stored cover key, or null when there is nothing to draw,
   including an upload key whose object URL did not survive the reload, and a
   key nobody knows (never a crash). */
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
  if (key.startsWith("link:")) {
    return {
      backgroundImage: `url("${key.slice("link:".length)}")`,
      backgroundSize: "cover",
      backgroundPosition: `center ${position}%`,
      backgroundColor: "var(--muted)",
    }
  }
  const colour = COLOURS.find((cover) => cover.key === key)
  return colour ? { backgroundColor: colour.css } : null
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
        "h-12 rounded-md border transition-colors",
        T_FAST,
        selected ? "border-foreground" : "border-border hover:border-input",
      )}
      style={{ backgroundColor: css }}
    />
  )
}

export type CoverTier = "gallery" | "upload" | "link" | "photos"

/* Which tiers the caller can supply. All four by default. */
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
  /* Where the caller can store the bytes, it takes them. */
  onUpload?: (file: File) => void
  /* Where the caller can turn a chosen photograph into a stored file, the pick
     goes there; otherwise the legacy link key. */
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
  const current = value === undefined ? undefined : (LEGACY_KEYS[value] ?? value)

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
      setPhotoError("Photo search needs the network.")
    } finally {
      setPhotoLoading(false)
    }
  }

  function takeFile(list: FileList | null) {
    const file = list?.[0]
    if (!file || !file.type.startsWith("image/")) return
    if (onUpload) {
      onUpload(file)
      return
    }
    rememberUploadedCover(folderName, URL.createObjectURL(file))
    onPick("upload")
  }

  return (
    /* The popover hugs this width rather than imposing its own. */
    <div className="w-[440px] max-w-full" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-0.5 border-b border-border px-2 pt-1.5">
        {(
          [
            ["gallery", "Colours"],
            ["upload", "Upload"],
            ["link", "Link"],
            ["photos", "Photos"],
          ] as const
        )
          .filter(([key]) => tiers.includes(key))
          .map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "-mb-px h-8 border-b-2 px-2.5 text-xs font-medium transition-colors",
              T_FAST,
              tab === key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
        {value ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="mb-1 ml-auto text-muted-foreground"
          >
            <X aria-hidden="true" />
            Remove
          </Button>
        ) : null}
      </div>

      <div className="max-h-[360px] overflow-y-auto p-2.5">
        {tab === "gallery" ? (
          <div role="listbox" aria-label="Cover colours" className="grid grid-cols-5 gap-2">
            {COLOURS.map((cover) => (
              <Swatch
                key={cover.key}
                name={cover.name}
                css={cover.css}
                selected={current === cover.key}
                onPick={() => onPick(cover.key)}
              />
            ))}
          </div>
        ) : null}

        {tab === "upload" ? (
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              takeFile(event.dataTransfer.files)
            }}
            className="flex h-32 flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-input bg-muted"
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
            <Button variant="outline" onClick={() => fileInput.current?.click()}>
              <ImageIcon aria-hidden="true" />
              Choose an image
            </Button>
            <p className="text-xs text-muted-foreground">
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
              className="h-[var(--control-height)] min-w-0 flex-1 text-sm"
            />
            <Button type="submit" variant="outline">
              Use link
            </Button>
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
              <div className="flex h-[var(--control-height)] min-w-0 flex-1 items-center gap-1.5 rounded-md border border-input bg-card px-2">
                <Search className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                <Input bare
                  value={photoQuery}
                  autoFocus
                  onChange={(event) => setPhotoQuery(event.target.value)}
                  placeholder="Search photos"
                  aria-label="Search photos"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <Button
                type="submit"
                variant="outline"
                disabled={photoLoading || !photoQuery.trim()}
              >
                {photoLoading ? (
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                ) : null}
                Search
              </Button>
            </form>

            {photoError ? (
              <p className="py-1 text-xs text-muted-foreground">{photoError}</p>
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
                      "h-16 rounded-md border bg-muted bg-cover bg-center transition-colors",
                      T_FAST,
                      value === `link:${photo.url}`
                        ? "border-foreground"
                        : "border-border hover:border-input",
                    )}
                    style={{ backgroundImage: `url("${photo.thumb}")` }}
                  />
                ))}
              </div>
            ) : !photoSearched && !photoError ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Openly licensed photos from Openverse.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}
