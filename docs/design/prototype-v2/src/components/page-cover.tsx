/*
The page cover: a band any page can wear.

Imran's direction, 2026-08-18 (DES-141): a cover is native to every page
except a task's — My Day, Tasks, Planned, Important, All, Done and every
folder can carry one, because a cover is how a *place* announces itself and
those are all places. A task is not; it is a thing inside one.

Extracted from the folder page, which had it first. What travels with it is
the whole affordance — the picker, the reposition drag, the foot scrim — so
no page grows a second, slightly different cover.

The controls stay minimal, at Imran's word: a joined Change·Reposition group
in the band's corner, 28px tall, appearing on hover, never a toolbar.

Lane 2 for the port: no page has a cover column, and the storage question is
DES-105's. Fixtures only, keyed by page name in the same store folders use.
*/

import { useRef, useState } from "react"

import { Image as ImageIcon } from "@/lib/icons"
import {
  FolderCoverPicker,
  coverRepositions,
  resolveCover,
} from "@/components/folder-cover"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  savePrototypeFolderIdentity,
  useFolderIdentity,
} from "@/lib/folder-presentation"
import { cn } from "@/lib/utils"

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-offset-1"

/* The band, drawn only when the page has a cover. `storageName` is the key
   the cover is remembered under — a folder's real name, or the page's. */
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
      className={cn("group/cover relative h-32 w-full", repositioning && "cursor-ns-resize select-none")}
      style={
        repositioning
          ? { ...cover, backgroundPosition: `center ${draftPos}%` }
          : cover
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
            : "opacity-0 group-hover/cover:opacity-100 focus-within:opacity-100",
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
              <PopoverContent align="end" className="p-0">
                <FolderCoverPicker
                  value={identity.cover}
                  folderName={storageName}
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
            {coverRepositions(identity.cover) ? (
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
export function AddCoverAction({
  storageName,
  visible,
}: {
  storageName: string
  visible: boolean
}) {
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
              visible ? "opacity-100" : "opacity-0 group-hover/head:opacity-100 focus-visible:opacity-100",
            )}
          >
            <ImageIcon className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={1.75} aria-hidden="true" />
            Add cover
          </button>
        }
      />
      <PopoverContent align="start" className="p-0">
        <FolderCoverPicker
          value={identity.cover}
          folderName={storageName}
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
