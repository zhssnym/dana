/*
Deleted, but not gone.

Imran's brief of 2026-08-23 asked for a Trash with thirty-day restore, for
"deleted pages". I am putting **tasks** there too, and the reason is the
asymmetry: a deleted folder is a container you can rebuild in a minute, while a
deleted task is a sentence somebody wrote that nobody can reconstruct — and it
is the one people delete by accident, from a row, with one press. Past the undo
window it was gone for ever. Trash then has one rule, *everything deletable is
restorable for thirty days*, rather than a rule with an exception nobody can
predict from the outside.

**Deleting stops being an act and becomes a state.** That is the whole change.
Before this, delete meant "remove from the array" and the only thing standing
between a person and a permanent loss was an undo bar that lasts seconds. Now
the thing moves; the array it was in is one of the places it can be, and Trash
is another.

**Undo still comes first.** The bar is for the half-second where you know you
made a mistake, and it puts the thing back where it was without a journey.
Trash is for the hour later, when you do not remember what it was called. They
are not two answers to one question, and having both is not redundancy — the
one that needs no navigation has to exist, or every mis-press becomes an
errand.

**The payload travels with the entry**, because a restore has to produce the
thing itself and this prototype's tasks live in memory. That is a stand-in for
what the port does, which is flip a column and leave the row where it is:
section 10.2's chokepoint has to see a deleted row in order to keep it out of
every list, which is an argument for soft delete rather than for a second
table. Lane 2 travels with it; there is no `deleted_at` column today.

The thirty days are counted, not enforced by a timer — an expiry that only
happens while the app is open is not an expiry. Anything past its day is
treated as gone on read, and swept from storage the next time anything is
written.
*/

import { useSyncExternalStore } from "react"

export const TRASH_STORAGE_KEY = "dana:prototype-trash"
const TRASH_EVENT = "dana:prototype-trash-change"

/* The same three kinds the object contract and the log know, because a thing
   you can delete is a thing that declares acts and records them. */
export type TrashKind = "task" | "folder" | "shelf"

export interface TrashItem {
  id: string
  kind: TrashKind
  /* The object's own key: a task's id, a folder's or shelf's name. */
  subject: string
  name: string
  at: number
  actor: string
  /* Where it was, in a person's words — "Travel", "Personal". Restoring puts
     it back there, and the list says where each thing will land. */
  from?: string
  /* Everything needed to put it back. Opaque here on purpose: only the
     surface that deleted it knows its shape, exactly as with a handler. */
  payload?: unknown
}

export const TRASH_DAYS = 30
const DAY = 24 * 60 * 60 * 1000

let cached: TrashItem[] | null = null

function read(): TrashItem[] {
  if (typeof window === "undefined") return []
  try {
    const value = JSON.parse(window.localStorage.getItem(TRASH_STORAGE_KEY) ?? "[]")
    return Array.isArray(value) ? (value as TrashItem[]) : []
  } catch {
    return []
  }
}

/* Anything past its thirty days is already gone, whether or not the app was
   open to notice. Read applies the rule; write persists the result. */
function live(items: TrashItem[], now = Date.now()) {
  return items.filter((item) => now - item.at < TRASH_DAYS * DAY)
}

function snapshot(): TrashItem[] {
  if (!cached) cached = live(read())
  return cached
}

function write(next: TrashItem[]) {
  cached = live(next)
  try {
    window.localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(cached))
  } catch {
    /* A full store costs the safety net, not the delete. */
  }
  window.dispatchEvent(new CustomEvent(TRASH_EVENT, { detail: cached }))
}

/* How long this has left, for the line that says so. */
export function daysLeft(item: TrashItem, now = Date.now()) {
  return Math.max(0, Math.ceil((item.at + TRASH_DAYS * DAY - now) / DAY))
}

export function trash(item: Omit<TrashItem, "id" | "at" | "actor"> & {
  actor?: string
}) {
  const entry: TrashItem = {
    ...item,
    id: `${item.kind}-${item.subject}-${Date.now()}`,
    at: Date.now(),
    actor: item.actor ?? "Imran Wafa",
  }
  /* One entry per thing. Delete, restore, delete again and the second is the
     one that counts — two rows for one object would offer two restores and
     only one of them could win. */
  write([entry, ...snapshot().filter((old) => !sameThing(old, entry))])
  return entry
}

function sameThing(a: TrashItem, b: TrashItem) {
  return a.kind === b.kind && a.subject === b.subject
}

/* Out of the trash, with whatever it was carrying. */
export function untrash(id: string): TrashItem | null {
  const item = snapshot().find((candidate) => candidate.id === id)
  if (!item) return null
  write(snapshot().filter((candidate) => candidate.id !== id))
  return item
}

/* Gone for real. The one act in the product with no way back, which is why it
   is the only one that asks first. */
export function purge(id: string) {
  write(snapshot().filter((candidate) => candidate.id !== id))
}

export function emptyTrash() {
  write([])
}

export function readTrash() {
  return snapshot()
}

export function useTrash(): TrashItem[] {
  return useSyncExternalStore(
    (notify) => {
      function onChange(changed: Event) {
        cached = (changed as CustomEvent<TrashItem[]>).detail ?? live(read())
        notify()
      }
      function onStorage() {
        cached = null
        notify()
      }
      window.addEventListener(TRASH_EVENT, onChange)
      window.addEventListener("storage", onStorage)
      return () => {
        window.removeEventListener(TRASH_EVENT, onChange)
        window.removeEventListener("storage", onStorage)
      }
    },
    snapshot,
    () => EMPTY,
  )
}

const EMPTY: TrashItem[] = []
