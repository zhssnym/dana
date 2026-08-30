/*
The page cover: a band any page can wear.

Imran's direction, 2026-08-18 (DES-141): a cover is native to every page
except a task's, My Day, Tasks, Planned, Important, All, Done and every
folder can carry one, because a cover is how a *place* announces itself and
those are all places. A task is not; it is a thing inside one.

Extracted from the folder page, which had it first. What travels with it is
the whole affordance, the picker, the reposition drag, the foot scrim, so
no page grows a second, slightly different cover.

The controls stay minimal, at Imran's word: a joined Change·Reposition group
in the band's corner, 28px tall, appearing on hover, never a toolbar.

Lane 2 for the port: no page has a cover column, and the storage question is
DES-105's. Fixtures only, keyed by page name in the same store folders use.
*/

import { useRef, useState } from "react"

import { Image as ImageIcon } from "../lib/icons.js"
import {
  FolderCoverPicker,
  coverRepositions,
  resolveCover,
} from "./folder-cover.js"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.js"
/* The S25 seam, and the whole of it in this file: the prototype read its
   covers from a browser store keyed by the page's name, and this client
   reads them from 7.19 keyed by 4.20's place. `lib/page-identity.js` is
   that module rewritten; the two names are aliased back to the prototype's
   so that nothing below this line moves. */
import {
  savePageIdentity as savePrototypeFolderIdentity,
  usePageIdentity as useFolderIdentity,
  /* The S26 seam, and the whole of it in this file: which tiers this page can
     honestly supply, whether it has anywhere to keep a crop, and where it can
     store an upload. All three are properties of the table behind the page
     rather than of the band, so the module that owns the storage owns them. */
  coverStoresPosition,
  coverTiersFor,
  coverUploader,
} from "../lib/page-identity.js"
import { cn } from "./ui/utils.js"

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-offset-1"

/*
**The band is full-bleed, and the arithmetic is here rather than at the three
call sites.**

The owner, 2026-08-30: "cover photos do not extend across the full page width,
leaving awkward white space on both sides." The prototype has no such fault
because it draws this component *outside* its own reading measure
(`screens/shell-page.tsx:2483`, `screens/folder-page-v2.tsx:2101`), while this
client draws it from the head, inside `app-shell.tsx`'s column, which is
centred and capped at `--shell-content-max`. The head's `-mx-10` undoes the
column's padding and cannot undo its cap, so a wide window put the band at the
reading width with the ground showing either side.

`50%` in a margin resolves against the containing block, and `100cqw` is the
scroll region's own width (`tokens.css` declares it the query container), so
`calc(50% - 50cqw)` is exactly the distance from this box's edge to the
window's on each side. It is written once, on the band, because it is true
whatever the wrapper above it does: an ancestor's own negative margin widens
the containing block and shrinks the offset by the same amount, so the head,
the folder page and the shelf page all land on the window's edge without
agreeing on anything first.
*/
const FULL_BLEED = { marginInline: "calc(50% - 50cqw)" } as const

/* The band, drawn only when the page has a cover. `storageName` is the key
   the cover is remembered under, a folder's real name, or the page's. */
export function PageCover({ storageName }: { storageName: string }) {
  const identity = useFolderIdentity(storageName)
  const coverPos = identity.coverPos ?? 50
  const cover = resolveCover(identity.cover, storageName, coverPos)
  const [repositioning, setRepositioning] = useState(false)
  const [draftPos, setDraftPos] = useState(coverPos)
  const dragStart = useRef<{ y: number; pos: number } | null>(null)

  if (!cover) return null

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
        className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[var(--color-graphite-950)]/12 to-transparent"
      />
      {repositioning ? (
        <div className="absolute inset-x-0 top-3 flex justify-center">
          <span className="rounded-md bg-[var(--color-graphite-900)]/80 px-2.5 py-1 text-[12px] leading-4 font-medium text-white backdrop-blur">
            Drag to reposition
          </span>
        </div>
      ) : null}
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
                "flex h-7 items-center rounded-md bg-[var(--color-graphite-900)] px-2.5 text-[12px] leading-4 font-medium text-white transition-colors hover:bg-[var(--color-graphite-800)]",
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
                "flex h-7 items-center rounded-md border border-[var(--color-graphite-200)] bg-card/95 px-2.5 text-[12px] leading-4 font-medium text-[var(--color-graphite-700)] backdrop-blur transition-colors hover:bg-card",
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
          <span className="flex h-7 items-stretch divide-x divide-[var(--color-graphite-200)] overflow-hidden rounded-md border border-[var(--color-graphite-200)] bg-card/95 shadow-[var(--elevation-1)] backdrop-blur">
            <Popover>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 text-[12px] leading-4 font-medium text-[var(--color-graphite-700)] transition-colors hover:bg-[var(--color-graphite-50)]",
                      T_FAST,
                      "outline-none focus-visible:bg-[var(--color-graphite-100)]",
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
            {/* polish: pagehead F7. Remove sits beside Change rather than
                three presses deep inside the picker. */}
            <button
              type="button"
              onClick={() => savePrototypeFolderIdentity(storageName, { cover: undefined })}
              className={cn(
                "flex items-center px-2.5 text-[12px] leading-4 font-medium text-[var(--color-graphite-700)] transition-colors hover:bg-[var(--color-graphite-50)]",
                T_FAST,
                "outline-none focus-visible:bg-[var(--color-graphite-100)]",
              )}
            >
              Remove
            </button>
            {coverRepositions(identity.cover) && coverStoresPosition(storageName) ? (
              <button
                type="button"
                onClick={() => {
                  setDraftPos(coverPos)
                  setRepositioning(true)
                }}
                className={cn(
                  "flex items-center px-2.5 text-[12px] leading-4 font-medium text-[var(--color-graphite-700)] transition-colors hover:bg-[var(--color-graphite-50)]",
                  T_FAST,
                  "outline-none focus-visible:bg-[var(--color-graphite-100)]",
                )}
              >
                Reposition
              </button>
            ) : null}
          </span>
        )}
      </div>
    </div>
  )
}

/* The quiet "Add cover" ghost, for a page that has none. Shown at rest only
   while the page is otherwise undressed; hover reveals it after that. */
/*
The way in, and it is always there until it has been used.

Imran, 2026-08-22: "Each of the folder page (native and non native) can get a
cover photo. Home is not getting it." Home was not, and neither was any folder
somebody had already dressed: this took a `visible` flag, the folder page
passed it `pristine`, true only while the folder had *no glyph, no cover and
no description*, and every other page passed it `false` outright. So the
moment you gave a folder an icon, the only route to a cover dropped to opacity
zero with nothing to suggest it was still there. Home ships with a house.

The flag was measuring the wrong thing, and once the right thing is measured
there is nothing left for it to decide: this component already returns null
when a cover exists (below), so "no cover" is the only state it can be in. A
control that is the sole way to do something, in the one state where it can be
done, is not a control to hide. Once there is a cover the band itself is the
affordance (DES-141) and this is gone.
*/
export function AddCoverAction({ storageName }: { storageName: string }) {
  const identity = useFolderIdentity(storageName)
  if (identity.cover) return null

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "-ml-1.5 flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] leading-4 text-[var(--color-graphite-400)] transition-[opacity,background-color,color] hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-600)]",
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
