/*
The page cover: a band any page can wear.

A cover is native to every page except a task's: My Day, Tasks, Planned,
Important, All, Done and every folder can carry one, because a cover is how a
*place* announces itself and those are all places. A task is not; it is a thing
inside one.

The whole affordance travels with it, the picker and the reposition drag, so no
page grows a second, slightly different cover.

The controls stay minimal: Change, Remove and (for a photo) Reposition as 28px
ghost buttons in the band's corner, appearing on hover.
*/

import { useLayoutEffect, useRef, useState } from "react"

import { Image as ImageIcon } from "../lib/icons.js"
import {
  FolderCoverPicker,
  coverRepositions,
  randomCoverColour,
  resolveCover,
} from "./folder-cover.js"
import { Button } from "./ui/button.js"
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
import { clearCoverChrome, setCoverChrome } from "../shell/cover-chrome.js"
import { cn } from "./ui/utils.js"
import { useSidebar } from "./ui/sidebar.js"

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"

/* A control over a picture: solid ground so it reads on any photo. */
const ON_COVER = "bg-background text-foreground hover:bg-hover"

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
on each side.
*/
const FULL_BLEED = { marginInline: "calc(50% - 50cqw)" } as const

/* The band, drawn only when the page has a cover. `storageName` is the key
   the cover is remembered under, a folder's real name, or the page's.

   `readOnly` draws the picture and nothing that changes it (issue #228): a
   viewer below Can edit, whom `PATCH /folders/:id` answers 403.

   On desktop the cover also publishes its live visual to the shell when it
   directly touches the window bar. The shell can then continue the same cover
   upward through that 36px strip to the bottom of the workspace tabs. Nothing
   in the page head moves; only the cover surface extends. */
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
  const coverRef = useRef<HTMLDivElement>(null)
  const chromeOwner = useRef(Symbol("page-cover")).current
  const { isMobile } = useSidebar()
  const [shadeInBar, setShadeInBar] = useState(false)
  const visibleCover =
    cover === null
      ? null
      : repositioning
        ? { ...cover, backgroundPosition: `center ${draftPos}%` }
        : cover

  /* Only a cover that physically meets the window bar may extend into it. A
     hidden thread head or an InviteGate above the page therefore cannot paint
     into global chrome by accident. Re-evaluate after every render because a
     parent can hide this band without changing any of its own props. */
  useLayoutEffect(() => {
    const node = coverRef.current
    const bar = document.querySelector<HTMLElement>("[data-window-bar]")
    const meetsBar = visibleCover !== null && node !== null && bar !== null &&
      node.getClientRects().length > 0 &&
      Math.abs(node.getBoundingClientRect().top - bar.getBoundingClientRect().bottom) <= 1.5
    setShadeInBar(meetsBar && !isMobile)
    if (!meetsBar || visibleCover === null) {
      clearCoverChrome(chromeOwner)
      return
    }
    setCoverChrome(chromeOwner, visibleCover)
  })

  useLayoutEffect(() => () => clearCoverChrome(chromeOwner), [chromeOwner])

  if (!cover || !visibleCover) return null
  const repositionable = coverRepositions(identity.cover) && coverStoresPosition(storageName)

  return (
    <div
      ref={coverRef}
      data-page-cover
      /* `w-full` is gone with the bleed above it: an auto width fills the
         containing block minus the margins, which is the whole window. */
      className={cn("group/cover relative h-32", repositioning && "cursor-ns-resize select-none")}
      style={{ ...visibleCover, ...FULL_BLEED }}
      onPointerDown={
        repositioning
          ? (event) => {
              /* A press that lands on a control is not a drag, or pointer
                 capture would retarget its click to the band and "Save
                 position" and "Cancel" would be unreachable (AC-406). */
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
      {visibleCover.backgroundImage && !shadeInBar ? <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[var(--cover-photo-shade-height)]" style={{ backgroundImage: 'var(--cover-photo-shade)' }} /> : null}
      {repositioning ? (
        <div className="absolute inset-x-0 top-3 z-20 flex justify-center">
          <span className="rounded-md bg-background px-2.5 py-1 text-xs leading-4 font-medium text-foreground">
            Drag to reposition
          </span>
        </div>
      ) : null}
      {/* Not rendered rather than hidden for a viewer: a band with no controls
          is the whole of what `readOnly` means here. */}
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

/*
"Add cover", for a page that has none: one press puts a flat colour on the page
(Notion's way); the band's own Change picks another or a photo. Once there is a
cover this is gone and the band is the affordance.
*/
export function AddCoverAction({
  storageName,
  readOnly = false,
}: {
  storageName: string
  /** Withheld from a viewer who may not change the folder's identity
   * (issue #228; see `PageCover`). */
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
        /* A touch screen has no hover to reveal it by, so it appears while the
           title is being edited. Not on any focus in the heading: appearing on
           a tap's pointerdown pushes the row down, and the tap's click (Share)
           then lands on the line above. */
        "[@media(hover:none)]:hidden [@media(hover:none)]:group-has-[textarea:focus]/head:flex",
      )}
    >
      <ImageIcon aria-hidden="true" />
      Add cover
    </Button>
  )
}
