/*
Lifted at S26 (RFC 0004's folder page row) from
`prototype-v2/src/components/page-image.tsx`, over the seam in
`lib/page-images.ts`, for RFC 0005 change control item 44's B7 and B11 and for
ledger entries L-193 to L-197. That module's header carries the argument; the
seams are these three and nothing else moves.

**One. `take` is asynchronous, because an upload is.** The lab writes bytes
into a browser store and knows at once whether they were taken; here they go to
7.15 and the block records the id 4.17's `file_id` names. The optimistic draw
is kept, so the picture is on the page before the round trip exactly as it is
in the lab, and the "out of room" sentence becomes the refusal's, which is the
same fault seen from the other side.

**Two. `id` is the file's, not the block's.** The prototype keys its store by
the block, one picture per block for ever; a file in Dana is its own row, is
reusable, and is what a block points at. An empty string is a block whose
picture has not been chosen yet, which is the state the dropzone below draws.

**Three. The width is 4.17's `width_pct` and the ratio is the file's.** B7's
handle writes a column S22a landed; B7's reservation had nothing to read a
ratio from, which was section 13 item 47, and issue #108 closed it. The ratio
arrives in the model and what fills the model is 4.16's `file_width` and
`file_height` off the block read (7.16). This block does not decide it and
should not: one picture on three pages is one shape reported three times rather
than three numbers free to disagree, which is why those columns are the file's
and are absent from `PageBlockWrite`.

**What stood here said the reservation was "exact for whoever chose the
picture and 16 by 9 for every other reader", and nobody has ever seen the
first half.** `components/page/BlocksEditor.tsx` passed a literal `16 / 9` and
dropped the measured ratio on the next render, so the author got the fallback
too. The sentence described an intention and was read as behaviour, which is
the failure mode `CLAUDE.md` names first, caught in this file's own header.

`lib/page-images.ts`'s `reservedRatio` is the one place null becomes 16 by 9,
and it stays right for every picture stored before migration 0009: they report
null and always will, no backfill having been run.
*/
/*
A picture on a page.

Imran's brief of 2026-08-23, item 5. The block is deliberately small, and the
three decisions in it are all about not becoming a photo editor.

**Width, and only width.** Imran, 2026-08-23: "an image can't be resized". The
first version had none of it and the reason given was that a picture which can
be half-width and left-aligned drags the text beside it into a layout problem.
Half of that holds and half of it does not, and separating them is what this
control is.

**Alignment is what causes the trouble, not size.** A narrower picture that
stays in the column changes nothing about the text above and below it, the
page is still one column of blocks, in order. A *floated* picture is what makes
the paragraph beside it a layout question. So the handle changes width and the
block stays centred in the column; there is no left, no right, and no wrap.

**A drag, not a menu of sizes.** Small/Medium/Large is three guesses at what
somebody wants; a handle is the answer. It clamps at a quarter of the column,
below which a photograph stops being one, and at full width. The number is a
**percentage**, so a picture keeps its proportion of the page on any window
rather than a pixel count that means something different at 1440 than at 1100.

**The caption is prose, on the prose tier.** DES-148 put paragraphs at 12px in
graphite-600 and gave the folder description the same, because they are the same
kind of writing. A caption is too, so it takes the tier rather than inventing a
fourth size, and it is optional, absent rather than a placeholder, because a
picture that explains itself should not carry an empty line under it.

**The space is reserved before the picture loads.** The page never jumps by the
height of an image, the single most noticeable thing a page of text can do
wrong. The brief said the block knew its ratio "from the moment the file is
chosen", which was the whole of what it could know when this was written and is
no longer the interesting half: 4.16 measures the stored picture and 7.16
reports it, so the reservation is right for everyone who opens the page and not
only for the person holding the file. That asymmetry is what issue #108 was
about — the jump was invisible to whoever uploaded the picture and visible to
everybody else, which is how it survived. \`scaleImageFile\` still returns the
ratio, now for the round trip it saves rather than because it is the only
reading there is.

Three ways in, because people reach for different ones and all three are one
line apart: choose a file, drop one, or paste. Paste is the gesture that matters
for a worked example, since the example is usually a screenshot that is already
on the clipboard.
*/

import { useEffect, useRef, useState } from "react"

import { Button } from "./ui/button.js"
import { InlineInput } from "./ui/inline-field.js"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.js"
import { cn } from "./ui/utils.js"
import { ImagePlus, MoreHorizontal, Trash2 } from "../lib/icons.js"
import {
  FALLBACK_RATIO,
  forgetPageImage,
  readPageImage,
  savePageImage,
  scaleImageFile,
} from "../lib/page-images.js"

export interface PageImageModel {
  /* Seam two: 7.15's file id, empty for a block nobody has filled yet. */
  id: string
  /* Width over height, so the block holds its place before the bytes arrive.
     Whoever builds this model owes `reservedRatio` rather than a literal: it
     is 4.16's measured pair where the file has one and 16 by 9 where it does
     not, and this component draws what it is handed. */
  ratio: number
  caption: string
  /* A percentage of the page column, 25 to 100. Absent means full width, so
     every picture made before this existed keeps the size it had. */
  width?: number
}

const T_FAST =
  "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"

export function PageImage({
  image,
  onChange,
  onRemove,
  folderId,
}: {
  image: PageImageModel
  onChange: (next: PageImageModel) => void
  onRemove: () => void
  /* Seam one: 7.15 scopes an upload to a folder, and the page knows which. */
  folderId: string
}) {
  const [src, setSrc] = useState<string | undefined>(() => readPageImage(image.id))
  const [dropping, setDropping] = useState(false)
  /* Set when the store refused the bytes. The picture still shows for this
     session; saying so is better than letting it disappear on the next load
     with no explanation. */
  const [unsaved, setUnsaved] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const frame = useRef<HTMLDivElement>(null)

  async function take(file: File | undefined | null) {
    if (!file) return
    const scaled = await scaleImageFile(file)
    if (!scaled) return
    /* Seam one. The optimistic draw first, so the picture is on the page
       before the round trip the way it is in the lab; then the bytes, then the
       block naming the file they became. A refusal keeps the picture for this
       session and says so, which is the prototype's own treatment of a store
       that would not take them. */
    setSrc(scaled.dataUrl)
    const stored = await savePageImage(folderId, scaled)
    if (stored === null) {
      setUnsaved(true)
      return
    }
    setUnsaved(false)
    onChange({ ...image, id: stored, ratio: scaled.ratio })
  }

  /*
  Paste, scoped to this block.

  A document-wide paste listener would steal the clipboard from every text
  field on the page, so it listens on the block and only while the block has
  focus inside it, which is what an empty block gets when you click it.
  */
  useEffect(() => {
    const node = frame.current
    if (!node || src) return
    function onPaste(event: ClipboardEvent) {
      const file = [...(event.clipboardData?.items ?? [])]
        .find((item) => item.type.startsWith("image/"))
        ?.getAsFile()
      if (!file) return
      event.preventDefault()
      void take(file)
    }
    node.addEventListener("paste", onPaste)
    return () => node.removeEventListener("paste", onPaste)
  })

  if (!src) {
    return (
      <div
        ref={frame}
        tabIndex={0}
        role="button"
        aria-label="Add an image"
        onClick={() => fileInput.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            fileInput.current?.click()
          }
        }}
        onDragOver={(event) => {
          event.preventDefault()
          setDropping(true)
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDropping(false)
          void take(event.dataTransfer.files[0])
        }}
        className={cn(
          "flex w-full cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-6 py-8 text-center outline-none transition-colors",
          T_FAST,
          dropping
            ? "border-[var(--color-dana-accent-600)] bg-[var(--color-dana-accent-50)]"
            : "border-[var(--color-graphite-200)] hover:border-[var(--color-graphite-300)] hover:bg-[var(--color-graphite-50)] focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)]",
        )}
      >
        <ImagePlus
          className="size-5 text-[var(--color-graphite-400)]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <p className="text-[13px] leading-5 font-medium text-[var(--color-graphite-700)]">
          Add an image
        </p>
        <p className="text-[12px] leading-4 text-[var(--color-graphite-500)]">
          Click to choose, drop a file, or paste one
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void take(event.target.files?.[0])}
        />
      </div>
    )
  }

  return (
    <figure
      ref={frame}
      className="group/img relative m-0 flex flex-col gap-1"
      style={{ width: `${image.width ?? 100}%` }}
    >
      <div className="relative overflow-hidden rounded-lg bg-[var(--color-graphite-100)]">
        <img
          src={src}
          alt={image.caption || "Image on this page"}
          /* The ratio holds the space before the bytes paint. The `||` is the
             last guard rather than the fallback: `reservedRatio` has already
             turned an unmeasured file into 16 by 9, and this catches a caller
             that hands over a zero or a NaN, which CSS would draw as a
             collapsed box. */
          style={{ aspectRatio: image.ratio || FALLBACK_RATIO }}
          className="block w-full object-cover"
        />
        <span className="absolute top-2 right-2 opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover/img:opacity-100 focus-within:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Image actions"
                  className="size-7 rounded-md bg-card/90 text-[var(--color-graphite-700)] shadow-sm hover:bg-card"
                />
              }
            >
              <MoreHorizontal className="size-4" strokeWidth={1.75} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => fileInput.current?.click()}>
                <ImagePlus className="size-4" />
                Replace…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  forgetPageImage(image.id)
                  onRemove()
                }}
              >
                <Trash2 className="size-4" />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void take(event.target.files?.[0])}
        />
        {/* The grip is a bar rather than a corner, because only width moves:
            a corner promises two axes and one of them is decided by the
            picture itself. */}
        <button
          type="button"
          aria-label="Resize image"
          onPointerDown={(event) => {
            const column = frame.current?.parentElement?.getBoundingClientRect()
            if (!column) return
            event.currentTarget.setPointerCapture(event.pointerId)
            const move = (pointer: PointerEvent) => {
              const next = Math.round(
                ((pointer.clientX - column.left) / column.width) * 100,
              )
              onChange({ ...image, width: Math.min(100, Math.max(25, next)) })
            }
            const up = () => {
              window.removeEventListener("pointermove", move)
              window.removeEventListener("pointerup", up)
            }
            window.addEventListener("pointermove", move)
            window.addEventListener("pointerup", up)
          }}
          className="absolute inset-y-0 right-0 flex w-3 cursor-ew-resize items-center justify-center opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover/img:opacity-100 focus-visible:opacity-100 outline-none"
        >
          <span
            aria-hidden="true"
            className="h-10 w-1 rounded-full bg-[var(--color-fixed-white)]/85 shadow-sm"
          />
        </button>
      </div>
      {/* The prose tier (DES-148), and no placeholder when it is empty: a
          picture that explains itself should not carry a blank line. The field
          is still there to click into, at the height of one line. */}
      <figcaption>
        {/* The primitive, not a bare input: the audit is right that a field
            spelling its own border, radius and ring is how six spellings of
            one control happened last time. What is left here is the two things
            this field genuinely differs by, the prose tier, and a placeholder
            that stays out of the way until you reach for it. */}
        <InlineInput
          value={image.caption}
          placeholder="Caption"
          aria-label="Caption"
          onChange={(event) => onChange({ ...image, caption: event.target.value })}
          className="block py-0.5 text-[12px] leading-5 text-[var(--color-graphite-600)] placeholder:text-transparent hover:placeholder:text-[var(--color-graphite-400)] focus:placeholder:text-[var(--color-graphite-400)]"
        />
      </figcaption>
      {unsaved ? (
        <p className="text-[12px] leading-4 text-[var(--color-graphite-500)]">
          This picture could not be stored, so it will not survive a reload.
        </p>
      ) : null}
    </figure>
  )
}
