/*
Covers for a folder page: patterns, illustrations, or a person's own image.

DES-130, Lane 2, fixtures only — the shipping folder has no cover column and
no image storage (the storage question is DES-105's). What the prototype can
do honestly, it does: patterns are CSS, illustrations are inline SVG generated
in this file so the shared build asks the network for nothing (the same rule
the portraits follow), and an upload is a real file read into an object URL —
alive for the session, gone on reload, and said so in the picker.

Three tiers rather than a search box, because the question a cover answers is
"which folder is this" at a glance, not "find me a photograph": a wash of
colour does that job, an illustration does it with more personality, and a
person's own photo does it best of all.
*/

import { useRef, useState, type CSSProperties } from "react"

import { Image as ImageIcon, X } from "@/lib/icons"
import { cn } from "@/lib/utils"

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-offset-1"

/* ---------------------------------------------------------- the patterns -- */

const PATTERNS: { key: string; name: string; style: CSSProperties }[] = [
  {
    key: "pattern:graphite",
    name: "Graphite wash",
    style: { background: "linear-gradient(120deg, #f4f5f6, #dddee2)" },
  },
  {
    key: "pattern:cobalt",
    name: "Cobalt wash",
    style: { background: "linear-gradient(120deg, #e3e8f9, #c9d3f2)" },
  },
  {
    key: "pattern:fern",
    name: "Fern wash",
    style: { background: "linear-gradient(120deg, #ddf2e2, #bfe5ca)" },
  },
  {
    key: "pattern:clay",
    name: "Clay wash",
    style: { background: "linear-gradient(120deg, #fbe5e2, #f8dcd8)" },
  },
  {
    key: "pattern:violet",
    name: "Violet wash",
    style: { background: "linear-gradient(120deg, #ece6f7, #d9cdf0)" },
  },
  {
    key: "pattern:dots",
    name: "Dots",
    style: {
      backgroundColor: "#f4f5f6",
      backgroundImage: "radial-gradient(#c6c8cd 1px, transparent 1px)",
      backgroundSize: "14px 14px",
    },
  },
  {
    key: "pattern:grid",
    name: "Grid",
    style: {
      backgroundColor: "#fafafb",
      backgroundImage:
        "linear-gradient(#dddee2 1px, transparent 1px), linear-gradient(90deg, #dddee2 1px, transparent 1px)",
      backgroundSize: "24px 24px",
    },
  },
  {
    key: "pattern:stripes",
    name: "Stripes",
    style: {
      background:
        "repeating-linear-gradient(135deg, #f4f5f6 0 12px, #ebecee 12px 24px)",
    },
  },
]

/* ------------------------------------------------------ the illustrations -- */

function scene(body: string, defs = "") {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 280" preserveAspectRatio="xMidYMid slice">' +
    (defs ? "<defs>" + defs + "</defs>" : "") +
    body +
    "</svg>"
  return "url(\"data:image/svg+xml," + encodeURIComponent(svg) + "\")"
}

function gradient(id: string, from: string, to: string) {
  return (
    '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="' + from + '"/>' +
    '<stop offset="1" stop-color="' + to + '"/>' +
    "</linearGradient>"
  )
}

const DUSK = scene(
  '<rect width="1200" height="280" fill="url(#sky)"/>' +
    '<circle cx="880" cy="120" r="52" fill="#f2dcb4"/>' +
    '<path d="M0 200 L260 96 L520 210 L760 130 L1000 216 L1200 150 L1200 280 L0 280 Z" fill="#c9d3f2"/>' +
    '<path d="M0 246 L200 170 L430 250 L700 180 L950 254 L1200 200 L1200 280 L0 280 Z" fill="#99a5cf"/>',
  gradient("sky", "#e9edfb", "#f6e3de"),
)

const SEA = scene(
  '<rect width="1200" height="280" fill="url(#sky)"/>' +
    '<path d="M0 170 Q150 150 300 170 T600 170 T900 170 T1200 170 L1200 280 L0 280 Z" fill="#c2e2ee"/>' +
    '<path d="M0 205 Q150 187 300 205 T600 205 T900 205 T1200 205 L1200 280 L0 280 Z" fill="#9fd0e3"/>' +
    '<path d="M0 240 Q150 224 300 240 T600 240 T900 240 T1200 240 L1200 280 L0 280 Z" fill="#7dbdd6"/>',
  gradient("sky", "#eef8fb", "#dff0f6"),
)

const MEADOW = scene(
  '<rect width="1200" height="280" fill="url(#sky)"/>' +
    '<circle cx="240" cy="100" r="44" fill="#f2dcb4"/>' +
    '<path d="M0 220 Q300 140 620 208 T1200 196 L1200 280 L0 280 Z" fill="#bfe5ca"/>' +
    '<path d="M0 260 Q360 200 720 250 T1200 240 L1200 280 L0 280 Z" fill="#94d2a8"/>',
  gradient("sky", "#f2faf4", "#ddf2e2"),
)

const NIGHT = scene(
  '<rect width="1200" height="280" fill="url(#sky)"/>' +
    '<circle cx="920" cy="90" r="38" fill="#e3e8f9"/>' +
    '<circle cx="905" cy="82" r="34" fill="url(#sky)"/>' +
    [
      [90, 60], [210, 130], [330, 44], [450, 170], [560, 90], [660, 40],
      [760, 150], [1050, 60], [1140, 140], [170, 210], [520, 230], [990, 200],
    ]
      .map(([x, y], i) => '<circle cx="' + x + '" cy="' + y + '" r="' + (i % 3 === 0 ? 2.4 : 1.5) + '" fill="#c9d3f2"/>')
      .join(""),
  gradient("sky", "#2b3350", "#3c4a77"),
)

const ILLUSTRATIONS: { key: string; name: string; style: CSSProperties }[] = [
  { key: "stock:dusk", name: "Dusk ridge", style: { backgroundImage: DUSK, backgroundSize: "cover", backgroundPosition: "center" } },
  { key: "stock:sea", name: "Sea", style: { backgroundImage: SEA, backgroundSize: "cover", backgroundPosition: "center" } },
  { key: "stock:meadow", name: "Meadow", style: { backgroundImage: MEADOW, backgroundSize: "cover", backgroundPosition: "center" } },
  { key: "stock:night", name: "Night", style: { backgroundImage: NIGHT, backgroundSize: "cover", backgroundPosition: "center" } },
]

/* ------------------------------------------------------------ the uploads -- */

/* Session-only, deliberately: see the module comment. */
const uploadedCovers = new Map<string, string>()

export function rememberUploadedCover(folderName: string, url: string) {
  const previous = uploadedCovers.get(folderName)
  if (previous) URL.revokeObjectURL(previous)
  uploadedCovers.set(folderName, url)
}

/* The style for a stored cover key, or null when there is nothing to draw —
   including an upload key whose object URL did not survive the reload. */
export function resolveCover(
  key: string | undefined,
  folderName: string,
): CSSProperties | null {
  if (!key) return null
  if (key === "upload") {
    const url = uploadedCovers.get(folderName)
    return url
      ? { backgroundImage: `url("${url}")`, backgroundSize: "cover", backgroundPosition: "center" }
      : null
  }
  return (
    [...PATTERNS, ...ILLUSTRATIONS].find((cover) => cover.key === key)?.style ??
    null
  )
}

/* ------------------------------------------------------------- the picker -- */

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
  const [tab, setTab] = useState<"patterns" | "illustrations" | "upload">(
    "patterns",
  )
  const fileInput = useRef<HTMLInputElement>(null)

  function takeFile(list: FileList | null) {
    const file = list?.[0]
    if (!file || !file.type.startsWith("image/")) return
    rememberUploadedCover(folderName, URL.createObjectURL(file))
    onPick("upload")
  }

  const swatches = tab === "patterns" ? PATTERNS : ILLUSTRATIONS

  return (
    <div className="w-[324px] p-2" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-0.5 px-1 pb-2">
        {(
          [
            ["patterns", "Patterns"],
            ["illustrations", "Illustrations"],
            ["upload", "Upload"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "h-7 rounded-md px-2.5 text-[12px] leading-4 font-medium transition-colors",
              T_FAST,
              FOCUS,
              tab === key
                ? "bg-[var(--color-graphite-100)] text-[var(--color-graphite-800)]"
                : "text-[var(--color-graphite-500)] hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-700)]",
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
              "ml-auto flex h-7 items-center gap-1 rounded-md px-2 text-[12px] leading-4 text-[var(--color-graphite-500)] transition-colors hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-700)]",
              T_FAST,
              FOCUS,
            )}
          >
            <X className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={2} aria-hidden="true" />
            Remove
          </button>
        ) : null}
      </div>

      {tab === "upload" ? (
        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            takeFile(event.dataTransfer.files)
          }}
          className="flex h-28 flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-[var(--color-graphite-300)] bg-[var(--color-graphite-25)]"
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
      ) : (
        <div role="listbox" aria-label={`Cover ${tab}`} className="grid grid-cols-2 gap-1.5">
          {swatches.map((cover) => (
            <button
              key={cover.key}
              type="button"
              role="option"
              aria-selected={value === cover.key}
              aria-label={cover.name}
              title={cover.name}
              onClick={() => onPick(cover.key)}
              className={cn(
                "h-14 rounded-md border transition-shadow",
                T_FAST,
                FOCUS,
                value === cover.key
                  ? "border-[var(--color-graphite-700)] ring-1 ring-[var(--color-graphite-700)]"
                  : "border-[var(--color-graphite-200)] hover:border-[var(--color-graphite-400)]",
              )}
              style={cover.style}
            />
          ))}
        </div>
      )}
    </div>
  )
}
