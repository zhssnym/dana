/*
The sample's projects, one file each, in the order the sidebar shows them.
Each file exports its top-level project page followed by its sub-pages.
*/
import type { SampleFolder, SampleTask } from '../content.js'
import { WEATHER_STATION } from './weather-station.js'
import { BUDGET_APP } from './budget-app.js'
import { MOVING_OUT } from './moving-out.js'
import { KUNGSLEDEN } from './kungsleden.js'
import { HALF_MARATHON } from './half-marathon.js'
import { SARA_BIRTHDAY } from './sara-birthday.js'
import { SOURDOUGH } from './sourdough.js'

export const PROJECTS: readonly SampleFolder[] = [
  ...BUDGET_APP,
  ...WEATHER_STATION,
  ...MOVING_OUT,
  ...KUNGSLEDEN,
  ...HALF_MARATHON,
  ...SARA_BIRTHDAY,
  ...SOURDOUGH,
]

/** Loose tasks that belong to no project yet; they land on Desk. */
export const DESK: readonly SampleTask[] = [
  { title: 'Renew the passport', due: 20, notes: 'Before the Kungsleden trip. The photo booth is at the station.' },
  { title: 'Call the dentist back', due: 3 },
]

export const FOCUS_LISTS: readonly string[] = ['today', 'scheduled', 'assignments', 'important']
