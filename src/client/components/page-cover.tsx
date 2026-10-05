// The page cover band, with its picker and reposition drag.

import { useRef, useState } from "react"

import { Image as ImageIcon } from "../lib/icons.js"
import {
  FolderCoverPicker,
  coverRepositions,
  randomCoverColour,
  resolveCover,
} from "./folder-cover.js"
import { Button } from "./ui/button.js"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.js"
// Covers are stored through `lib/page-identity.js`; its names are aliased here.
import {
  savePageIdentity as savePrototypeFolderIdentity,
  usePageIdentity as useFolderIdentity,
  coverStoresPosition,
  coverTiersFor,
  coverPhotoPicker,
  coverUploader,
} from "../lib/page-identity.js"
import { cn } from "./ui/utils.js"

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"

// A control over a picture: solid ground so it reads on any photo.
const ON_COVER = "bg-background text-foreground hover:bg-hover"

// Full bleed: the shell column is capped, so a negative margin cannot reach the
// window edges. `100cqw` is the scroll region's width (the query container).
const FULL_BLEED = { marginInline: "calc(50% - 50cqw)" } as const

// `readOnly` draws the picture without controls, for viewers below Can edit.
export function PageCover({
  storageName,
  readOnly = false,
}: {
  storageName: string
  readOnly?: boolean
}) {
  const identity = useFolderIdentity(storageName)
  const coverPos = identity.coverPos ?? 50
  const cover = resolveCover(identity.cover, storageName, coverPos)
  const [repositioning, setRepositioning] = useState(false)
  const [draftPos, setDraftPos] = useState(coverPos)
  const dragStart = useRef<{ y: number; pos: number } | null>(null)
  const visibleCover =
    cover === null
      ? null
      : repositioning
        ? { ...cover, backgroundPosition: `center ${draftPos}%` }
        : cover

  if (!cover || !visibleCover) return null
  const repositionable = coverRepositions(identity.cover) && coverStoresPosition(storageName)

  return (
    <div
      data-page-cover
      // An auto width with the bleed margins fills the whole window.
      className={cn("group/cover relative h-32", repositioning && "cursor-ns-resize select-none")}
      style={{ ...visibleCover, ...FULL_BLEED }}
      onPointerDown={
        repositioning
          ? (event) => {
              // A press on a control is not a drag, or pointer capture would retarget its click
              // and Save and Cancel would be unreachable (AC-406).
              if ((event.target as HTMLElement).closest('button') !== null) return
              dragStart.current = { y: event.clientY, pos: draftPos }
              event.currentTarget.setPointerCapture(event.pointerId)
            }
          : undefined
      }
      onPointerMove={
        repositioning
          ? (event) => {
              if (!dragStart.current) return
              const height = event.currentTarget.getBoundingClientRect().height || 128
              const delta = ((event.clientY - dragStart.current.y) / height) * 100
              setDraftPos(
                Math.max(0, Math.min(100, dragStart.current.pos - delta)),
              )
            }
          : undefined
      }
      onPointerUp={repositioning ? () => (dragStart.current = null) : undefined}
    >
      {repositioning ? (
        <div className="absolute inset-x-0 top-3 z-20 flex justify-center">
          <span className="rounded-md bg-background px-2.5 py-1 text-xs leading-4 font-medium text-foreground">
            Drag to reposition
          </span>
        </div>
      ) : null}
      {/* A viewer gets no controls at all. */}
      {readOnly ? null : (
      <div
        className={cn(
          "absolute right-4 bottom-3 z-20 flex items-center gap-1 transition-opacity",
          T_FAST,
          repositioning
            ? "opacity-100"
            : "opacity-0 group-hover/cover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100",
        )}
      >
        {repositioning ? (
          <>
            <Button
              variant="ghost"
              className={ON_COVER}
              onClick={() => {
                savePrototypeFolderIdentity(storageName, { coverPos: Math.round(draftPos) })
                setRepositioning(false)
              }}
            >
              Save position
            </Button>
            <Button
              variant="ghost"
              className={ON_COVER}
              onClick={() => {
                setDraftPos(coverPos)
                setRepositioning(false)
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Popover>
              <PopoverTrigger
                render={
                  <Button variant="ghost" className={ON_COVER}>
                    Change
                  </Button>
                }
              />
              <PopoverContent align="end" className="w-auto max-w-[calc(100vw-2rem)] p-0">
                <FolderCoverPicker
                  value={identity.cover}
                  folderName={storageName}
                  tiers={coverTiersFor(storageName)}
                  onUpload={coverUploader(storageName)}
                  onPickPhoto={coverPhotoPicker(storageName)}
                  onPick={(key) =>
                    savePrototypeFolderIdentity(storageName, {
                      cover: key,
                      coverPos: 50,
                    })
                  }
                />
              </PopoverContent>
            </Popover>
            <Button
              variant="ghost"
              className={ON_COVER}
              onClick={() => savePrototypeFolderIdentity(storageName, { cover: undefined })}
            >
              Remove
            </Button>
            {repositionable ? (
              <Button
                variant="ghost"
                className={ON_COVER}
                onClick={() => {
                  setDraftPos(coverPos)
                  setRepositioning(true)
                }}
              >
                Reposition
              </Button>
            ) : null}
          </>
        )}
      </div>
      )}
    </div>
  )
}

// "Add cover" puts a random flat colour on the page in one press.
export function AddCoverAction({
  storageName,
  readOnly = false,
}: {
  storageName: string
  /** Hidden from a viewer who may not change the folder's identity. */
  readOnly?: boolean
}) {
  const identity = useFolderIdentity(storageName)
  if (readOnly || identity.cover) return null

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() =>
        savePrototypeFolderIdentity(storageName, { cover: randomCoverColour(), coverPos: 50 })
      }
      className={cn(
        "-ml-1.5 text-muted-foreground hover:text-foreground",
        // Touch has no hover, so it appears while the title is edited. Not on any heading
        // focus: appearing on pointerdown pushes the row down and the tap lands above.
        "[@media(hover:none)]:hidden [@media(hover:none)]:group-has-[textarea:focus]/head:flex",
      )}
    >
      <ImageIcon aria-hidden="true" />
      Add cover
    </Button>
  )
}
