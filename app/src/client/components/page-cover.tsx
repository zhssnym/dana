/*
The page cover: a band any page can wear.

A cover is native to every page except a task's: My Day, Tasks, Planned,
Important, All, Done and every folder can carry one, because a cover is how a
*place* announces itself and those are all places. A task is not; it is a thing
inside one.

The whole affordance travels with it, the picker, the reposition drag, the foot
scrim, so no page grows a second, slightly different cover.

The controls stay minimal: a joined Change·Reposition group in the band's
corner, 28px tall, appearing on hover, never a toolbar.
*/

import { useRef, useState } from "react"

import { Image as ImageIcon } from "../lib/icons.js"
import {
  FolderCoverPicker,
  coverRepositions,
  resolveCover,
} from "./folder-cover.js"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.js"
/* Covers are read from 7.19 keyed by 4.20's place, through
   `lib/page-identity.js`; its two names are aliased on import. */
import {
  savePageIdentity as savePrototypeFolderIdentity,
  usePageIdentity as useFolderIdentity,
  /* Which tiers this page can honestly supply, whether it has anywhere to keep
     a crop, and where it can store an upload. All three are properties of the
     table behind the page rather than of the band, so the module that owns the
     storage owns them. */
  coverStoresPosition,
  coverTiersFor,
  coverPhotoPicker,
  coverUploader,
} from "../lib/page-identity.js"
import { cn } from "./ui/utils.js"

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"

/*
**The band is full-bleed, and the arithmetic is here rather than at the three
call sites.**

A cover extends across the full page width. This is drawn from the head, inside
`app-shell.tsx`'s column, which is centred and capped at `--shell-content-max`;
a negative margin can undo the column's padding and cannot undo its cap, so a
wide window would put the band at the reading width with the ground showing
either side.

`50%` in a margin resolves against the containing block, and `100cqw` is the
scroll region's own width (`tokens.css` declares it the query container), so
`calc(50% - 50cqw)` is exactly the distance from this box's edge to the window's
on each side. It is written once, on the band, because it is true whatever the
wrapper above it does: an ancestor's own negative margin widens the containing
block and shrinks the offset by the same amount, so the head, the folder page
and the shelf page all land on the window's edge without agreeing on anything
first.
*/
const FULL_BLEED = { marginInline: "calc(50% - 50cqw)" } as const

/* The band, drawn only when the page has a cover. `storageName` is the key
   the cover is remembered under, a folder's real name, or the page's.

   `readOnly` draws the picture and nothing that changes it (issue #228).
   A folder's cover is part of its 4.3 identity, which accepted #209 R8A makes
   ordinary shared Folder work: Can edit and above change it, and `PATCH
   /folders/:id` answers 403 to everybody below, so the folder page passes
   this for a viewer under that bar. It defaults to false, and a place page —
   whose cover is 4.20's, per viewer and nobody else's business — never passes
   it. */
export function PageCover({
  storageName,
  readOnly = false,
  pickerInMenu = false,
}: {
  storageName: string
  readOnly?: boolean
  /** The page's "…" menu already carries "Cover…" (the folder page), so the
      band offers only Reposition: one home for changing or removing it. */
  pickerInMenu?: boolean
}) {
  const identity = useFolderIdentity(storageName)
  const coverPos = identity.coverPos ?? 50
  const cover = resolveCover(identity.cover, storageName, coverPos)
  const [repositioning, setRepositioning] = useState(false)
  const [draftPos, setDraftPos] = useState(coverPos)
  const dragStart = useRef<{ y: number; pos: number } | null>(null)

  if (!cover) return null
  const repositionable = coverRepositions(identity.cover) && coverStoresPosition(storageName)
  /* Nothing left to offer on the band: draw only the picture. */
  const bare = readOnly || (pickerInMenu && !repositionable)

  return (
    <div
      /* `w-full` is gone with the bleed above it: an auto width fills the
         containing block minus the margins, which is the whole window, where
         `width: 100%` would ignore them and sit 80px short. */
      className={cn("group/cover relative h-32", repositioning && "cursor-ns-resize select-none")}
      style={
        repositioning
          ? { ...cover, ...FULL_BLEED, backgroundPosition: `center ${draftPos}%` }
          : { ...cover, ...FULL_BLEED }
      }
      onPointerDown={
        repositioning
          ? (event) => {
              /*
              **A press that lands on a control is not a drag**, or "Save
              position" and "Cancel" would be unreachable. The band captures the
              pointer so a drag that wanders outside it keeps tracking, and
              capture retargets the whole gesture — the mouse events and the
              `click` they compose into — to the capturing element. Both
              controls are children of the band, so a press on either would
              bubble here first, the band would take the pointer, and the click
              would be delivered to the band instead of the button: no save, no
              cancel, no error, and no way out of repositioning but to leave the
              page (AC-406).
              */
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
              const delta = ((event.clientY - dragStart.current.y) / 176) * 100
              setDraftPos(
                Math.max(0, Math.min(100, dragStart.current.pos - delta)),
              )
            }
          : undefined
      }
      onPointerUp={repositioning ? () => (dragStart.current = null) : undefined}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/12 to-transparent"
      />
      {repositioning ? (
        <div className="absolute inset-x-0 top-3 flex justify-center">
          <span className="rounded-md bg-foreground/80 px-2.5 py-1 text-xs leading-4 font-medium text-background backdrop-blur">
            Drag to reposition
          </span>
        </div>
      ) : null}
      {/* Change, Remove and Reposition, all three withheld together: a band
          with no controls is the whole of what `readOnly` means here, and
          repositioning cannot be entered any other way. Not rendered rather
          than hidden, because `hidden` and `.flex` carry the same specificity
          and the later rule wins. */}
      {bare ? null : (
      <div
        className={cn(
          "absolute right-4 bottom-3 flex items-center gap-1 transition-opacity",
          T_FAST,
          repositioning
            ? "opacity-100"
            : "opacity-0 group-hover/cover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100",
        )}
      >
        {repositioning ? (
          <>
            <button
              type="button"
              onClick={() => {
                savePrototypeFolderIdentity(storageName, { coverPos: Math.round(draftPos) })
                setRepositioning(false)
              }}
              className={cn(
                "flex h-7 items-center rounded-md bg-foreground px-2.5 text-xs leading-4 font-medium text-background transition-colors hover:bg-foreground/90",
                T_FAST,
                FOCUS,
              )}
            >
              Save position
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftPos(coverPos)
                setRepositioning(false)
              }}
              className={cn(
                "flex h-7 items-center rounded-md border border-border bg-card/95 px-2.5 text-xs leading-4 font-medium text-section-foreground backdrop-blur transition-colors hover:bg-card",
                T_FAST,
                FOCUS,
              )}
            >
              Cancel
            </button>
          </>
        ) : (
          /* One joined group, the reference design's own arrangement:
             Change and Reposition share a border and a divider rather
             than floating as loose chips. */
          <span className="flex h-7 items-stretch divide-x divide-border overflow-hidden rounded-md border border-border bg-card/95 shadow-[var(--elevation-1)] backdrop-blur">
            {pickerInMenu ? null : (
            <>
            <Popover>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 text-xs leading-4 font-medium text-section-foreground transition-colors hover:bg-accent",
                      T_FAST,
                      "outline-none focus-visible:bg-accent",
                    )}
                  >
                    <ImageIcon className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={1.75} aria-hidden="true" />
                    Change
                  </button>
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
                  onRemove={() =>
                    savePrototypeFolderIdentity(storageName, { cover: undefined })
                  }
                />
              </PopoverContent>
            </Popover>
            {/* Remove sits beside Change rather than three presses deep inside
                the picker. */}
            <button
              type="button"
              onClick={() => savePrototypeFolderIdentity(storageName, { cover: undefined })}
              className={cn(
                "flex items-center px-2.5 text-xs leading-4 font-medium text-section-foreground transition-colors hover:bg-accent",
                T_FAST,
                "outline-none focus-visible:bg-accent",
              )}
            >
              Remove
            </button>
            </>
            )}
            {repositionable ? (
              <button
                type="button"
                onClick={() => {
                  setDraftPos(coverPos)
                  setRepositioning(true)
                }}
                className={cn(
                  "flex items-center px-2.5 text-xs leading-4 font-medium text-section-foreground transition-colors hover:bg-accent",
                  T_FAST,
                  "outline-none focus-visible:bg-accent",
                )}
              >
                Reposition
              </button>
            ) : null}
          </span>
        )}
      </div>
      )}
    </div>
  )
}

/* The quiet "Add cover" ghost, for a page that has none. Shown at rest only
   while the page is otherwise undressed; hover reveals it after that. */
/*
The way in, and it is always there until it has been used.

Every page, native or a folder, can get a cover, whatever else it has been
dressed with. This component returns null when a cover exists (below), so "no
cover" is the only state it can be in, and a control that is the sole way to do
something, in the one state where it can be done, is not a control to hide. Once
there is a cover the band itself is the affordance and this is gone.
*/
export function AddCoverAction({
  storageName,
  readOnly = false,
}: {
  storageName: string
  /** The way in is withheld from a viewer who may not change the folder's
   * identity (issue #228, accepted #209 R8A; see `PageCover`). */
  readOnly?: boolean
}) {
  const identity = useFolderIdentity(storageName)
  if (readOnly || identity.cover) return null

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "-ml-1.5 flex h-6 items-center gap-1 rounded-md px-1.5 text-xs leading-4 text-quiet-foreground transition-[opacity,background-color,color] hover:bg-accent hover:text-muted-foreground",
              T_FAST,
              FOCUS,
            )}
          >
            <ImageIcon className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={1.75} aria-hidden="true" />
            Add cover
          </button>
        }
      />
      <PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)] p-0">
        <FolderCoverPicker
          value={identity.cover}
          folderName={storageName}
          tiers={coverTiersFor(storageName)}
          onUpload={coverUploader(storageName)}
          onPickPhoto={coverPhotoPicker(storageName)}
          onPick={(key) =>
            savePrototypeFolderIdentity(storageName, { cover: key, coverPos: 50 })
          }
          onRemove={() =>
            savePrototypeFolderIdentity(storageName, { cover: undefined })
          }
        />
      </PopoverContent>
    </Popover>
  )
}
