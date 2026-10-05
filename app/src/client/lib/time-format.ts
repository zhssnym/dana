// The 12/24-hour preference, 12 by default. The account's `clock` setting is the record;
// localStorage caches it for the first frame. A module store, not a context, so every
// place that writes a time can read it.

import { useSyncExternalStore } from "react"

import { mutateApi } from "../api/http.js"
import { queryKeys } from "../api/keys.js"
import { queryClient, writeFailureMessage } from "../api/queryClient.js"
import { getSettingsResponse } from "../../shared/bundle.js"
import { showToast } from "../state/toasts.js"

export type TimeFormat = "24" | "12"

const KEY = "dana.timeFormat"

function read(): TimeFormat {
  try {
    return localStorage.getItem(KEY) === "24" ? "24" : "12"
  } catch {
    // Private modes and sandboxed frames throw rather than return null.
    return "12"
  }
}

let current: TimeFormat = read()
const listeners = new Set<() => void>()

export function setTimeFormat(next: TimeFormat) {
  if (next === current) return
  current = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // Remembered for this session only.
  }
  listeners.forEach((notify) => notify())
}

/**
 * Adopt the account's value; a no-op when it matches. The column spells `12h`/`24h` and
 * this store `12`/`24`: never change the stored spelling, or everyone's setting resets.
 */
export function adoptClock(clock: "12h" | "24h"): void {
  setTimeFormat(clock === "24h" ? "24" : "12")
}

/** The control's write: the column first, then the store adopts the answer. */
export function setClock(clock: "12h" | "24h"): void {
  const client = queryClient()
  void mutateApi(getSettingsResponse, {
    method: "PATCH",
    path: "/settings",
    body: { clock },
  })
    .then((bundle) => {
      adoptClock(bundle.clock)
      client?.setQueryData(queryKeys.bundle(), bundle)
      void client?.invalidateQueries()
    })
    .catch((error: unknown) => showToast(writeFailureMessage(error)))
}

export function useTimeFormat(): TimeFormat {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => {
        listeners.delete(notify)
      }
    },
    () => current,
    () => "12",
  )
}

// Times are stored as 24-hour "HH:MM" and converted only when drawn.

export interface Clock {
  hour: number
  minute: number
}

export function parseTime(value: string | null | undefined): Clock | null {
  if (!value) return null
  const found = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!found) return null
  const hour = Number(found[1])
  const minute = Number(found[2])
  if (hour > 23 || minute > 59) return null
  return { hour, minute }
}

export function toValue({ hour, minute }: Clock) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

// 0 and 12 both read as 12 on a 12-hour clock.
export function to12Hour(hour: number) {
  return hour % 12 === 0 ? 12 : hour % 12
}

export function periodOf(hour: number): "AM" | "PM" {
  return hour < 12 ? "AM" : "PM"
}

// The one place a time becomes words.
export function formatTime(value: string | null | undefined, format: TimeFormat) {
  const clock = parseTime(value)
  if (!clock) return null
  if (format === "24") return toValue(clock)
  return `${to12Hour(clock.hour)}:${String(clock.minute).padStart(2, "0")} ${periodOf(clock.hour)}`
}

// A typed time in either notation ("14:30", "2pm", "930") as stored "HH:MM", or null.
export function parseTypedTime(text: string): string | null {
  const found = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\./g, ":")
    .match(/^(\d{1,2}):?(\d{2})?(am|pm|a|p)?$/)
  if (!found) return null
  let hour = Number(found[1])
  const minute = found[2] === undefined ? 0 : Number(found[2])
  const period = found[3]
  if (minute > 59) return null
  if (period !== undefined) {
    if (hour < 1 || hour > 12) return null
    hour = (hour % 12) + (period.startsWith("p") ? 12 : 0)
  } else if (hour > 23) return null
  return toValue({ hour, minute })
}
