/*
Whether a time reads as 17:30 or 5:30 PM, as a preference rather than a guess.

Imran's ruling, 2026-08-18: the format is the person's to choose, and the
picker offers both regardless of which they chose, the setting decides how a
time is written, never which times can be reached.

12-hour is the default, ruled 2026-08-18. The setting can move it to 24-hour
and the picker reaches every hour and minute either way.

The store is deliberately not a React context. Times are written in the row,
in the card's chips, inside two pickers and in a settings control, and a
provider would have to wrap all of them; a module store with
`useSyncExternalStore` reaches every one without anybody threading anything.
**It follows the person between devices since S17b, and the paragraph this
replaces is why that is worth a note rather than a silent diff.** It read:
"Lane 1: it lives in the browser and does not follow a person between devices.
Syncing it to the account is a separate want and needs a column, an endpoint
and therefore an RFC, the same conversation DES-113 parked for row density."
The column is 4.19's `clock`, the endpoint is `GET` and `PATCH /settings`, and
both have been live since S7: the RFC this file was waiting for had landed
before the file was written, and nothing pointed the two at each other. 9.7
names the control, RFC 0005 change control item 30 assigned it to S17b, and
this is the row that joined them up.

**The account is the record and `localStorage` is a cache of it.** That
ordering is the whole design. `adoptClock` writes the bundle's value into this
store when the read arrives, which is what makes a fresh browser show the
person's own choice rather than the default; the local copy exists only so the
frame before the bundle answers shows the value they last saw rather than a
flash of 12-hour. The settings control writes the column and nothing else
writes it, so at no moment are two records authoritative for one reader, which
is the property change control item 6 required of the pin list and this is the
same refusal one preference over.
*/

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
    /* Private modes and sandboxed frames throw rather than return null. A
       display preference is not worth failing a render over. */
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
    /* Remembered for this session only, which is the honest fallback. */
  }
  listeners.forEach((notify) => notify())
}

/**
 * Takes the account's value (4.19's `clock`) as the truth, at S17b.
 *
 * Called by the shell whenever the bundle settles. It is deliberately the same
 * write as a person pressing the control: the store does not care which of the
 * two moved it, and `setTimeFormat` already refuses a write that changes
 * nothing, so an arriving bundle that agrees with the cache notifies nobody.
 *
 * `'24h'` and `'12h'` are 4.19's spelling and `'24'` and `'12'` are this
 * module's, and the two are translated here rather than either side moving.
 * The column's is the wire's and cannot change without a migration; this
 * module's is what is already in every person's `localStorage`, and rewriting
 * it would silently reset the preference of everyone who has set one.
 */
export function adoptClock(clock: "12h" | "24h"): void {
  setTimeFormat(clock === "24h" ? "24" : "12")
}

/**
 * The control's write, at S27: 4.19's column first, and the store adopts the
 * answer, which is the same path an arriving bundle takes. Added when
 * `screens/settings-screen.tsx` crossed and 9.7's two extra rows were drawn
 * in its idiom; the settings page's own mutation used to be the writer.
 */
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

/* ------------------------------------------------------------ the value -- */
/*
Times are stored as "HH:MM" on the 24-hour clock whatever the person has
chosen, and converted only when they are drawn. Storing what is displayed is
how a preference change quietly rewrites data, and 12-hour text cannot even
represent midnight without a convention nobody agreed to.
*/

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

/* 0 and 12 both read as 12 on a 12-hour clock, which is the one case a
   remainder gets wrong and the one people notice. */
export function to12Hour(hour: number) {
  return hour % 12 === 0 ? 12 : hour % 12
}

export function to24Hour(hour12: number, period: "AM" | "PM") {
  const base = hour12 % 12
  return period === "PM" ? base + 12 : base
}

export function periodOf(hour: number): "AM" | "PM" {
  return hour < 12 ? "AM" : "PM"
}

/* The one place a time becomes words. Everything that draws a time goes
   through here, so the preference cannot be honoured in one place and
   forgotten in another. */
export function formatTime(value: string | null | undefined, format: TimeFormat) {
  const clock = parseTime(value)
  if (!clock) return null
  if (format === "24") return toValue(clock)
  return `${to12Hour(clock.hour)}:${String(clock.minute).padStart(2, "0")} ${periodOf(clock.hour)}`
}
