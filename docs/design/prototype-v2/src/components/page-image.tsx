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
stays in the column changes nothing about the text above and below it — the
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
fourth size — and it is optional, absent rather than a placeholder, because a
picture that explains itself should not carry an empty line under it.

**The space is reserved before the picture loads.** The block knows its aspect
ratio from the moment the file is chosen, so the page never jumps by the height
of an image — the single most noticeable thing a page of text can do wrong, and
the reason \`scaleImageFile\` returns the ratio rather than only the bytes.

Three ways in, because people reach for different ones and all three are one
line apart: choose a file, drop one, or paste. Paste is the gesture that matters
for a worked example, since the example is usually a screenshot that is already
on the clipboard.
*/

import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { InlineInput } from "@/components/ui/inline-field"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { ImagePlus, MoreHorizontal, Trash2 } from "@/lib/icons"
import {
  forgetPageImage,
  readPageImage,
  savePageImage,
  scaleImageFile,
} from "@/lib/page-images"

export interface PageImageModel {
  id: string
  /* Width over height, kept so the block can hold its place before the bytes
     arrive. */
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
}: {
  image: PageImageModel
  onChange: (next: PageImageModel) => void
  onRemove: () => void
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
    setSrc(scaled.dataUrl)
    setUnsaved(!savePageImage(image.id, scaled.dataUrl))
    onChange({ ...image, ratio: scaled.ratio })
  }

  /*
  Paste, scoped to this block.

  A document-wide paste listener would steal the clipboard from every text
  field on the page, so it listens on the block and only while the block has
  focus inside it — which is what an empty block gets when you click it.
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
          /* The ratio holds the space before the bytes paint. */
          style={{ aspectRatio: image.ratio || 16 / 9 }}
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
            className="h-10 w-1 rounded-full bg-[var(--color-graphite-0)]/85 shadow-sm"
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
            this field genuinely differs by — the prose tier, and a placeholder
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
          This browser is out of room, so the picture will not survive a reload.
        </p>
      ) : null}
    </figure>
  )
}
