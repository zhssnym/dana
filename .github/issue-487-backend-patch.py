from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text)


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, found {count}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


def replace_n(path: str, old: str, new: str, expected: int) -> None:
    text = read(path)
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f"{path}: expected {expected} matches, found {count}: {old[:120]!r}")
    write(path, text.replace(old, new))


# Migration journal: 0065 follows main's 0064 and is later in time.
journal_path = "app/db/migrations/meta/_journal.json"
journal = json.loads(read(journal_path))
entries = journal["entries"]
if not any(entry.get("tag") == "0065_task_start_time" for entry in entries):
    entries.append({
        "idx": 65,
        "version": "7",
        "when": 1794000000000,
        "tag": "0065_task_start_time",
        "breakpoints": True,
    })
write(journal_path, json.dumps(journal, indent=2) + "\n")

# Constraint catalog.
replace_once(
    "app/db/constraint-catalog.ts",
    "      { name: 'tasks_start_before_due_check', columns: ['due_date', 'start_date'] },\n",
    "      { name: 'tasks_same_day_time_order_check', columns: ['due_date', 'due_time', 'start_date', 'start_time'] },\n"
    "      { name: 'tasks_start_before_due_check', columns: ['due_date', 'start_date'] },\n"
    "      { name: 'tasks_start_time_requires_date_check', columns: ['start_date', 'start_time'] },\n",
)

# Shared task contract: write schemas and canonical response shape.
shared = "app/src/shared/tasks.ts"
replace_once(
    shared,
    "export const wallClockTime = z.iso.time({\n",
    "// Issue #487: Start and Due endpoint times share 4.11's floating, minute-precision write form.\n"
    "export const startTime = dueTime\n\n"
    "export const wallClockTime = z.iso.time({\n",
)
replace_n(
    shared,
    "    start_date: dueDate.nullable().optional(),\n    due_date: dueDate.nullable().optional(),\n",
    "    start_date: dueDate.nullable().optional(),\n    start_time: startTime.nullable().optional(),\n    due_date: dueDate.nullable().optional(),\n",
    2,
)
replace_once(
    shared,
    "  .refine((body) => !isSet(body.due_time) || isSet(body.due_date), {\n"
    "    error: 'requires a due_date',\n"
    "    path: ['due_time'],\n"
    "  })\n",
    "  .refine((body) => !isSet(body.due_time) || isSet(body.due_date), {\n"
    "    error: 'requires a due_date',\n"
    "    path: ['due_time'],\n"
    "  })\n"
    "  .refine((body) => !isSet(body.start_time) || isSet(body.start_date), {\n"
    "    error: 'requires a start_date',\n"
    "    path: ['start_time'],\n"
    "  })\n",
)
replace_once(
    shared,
    "  )\nexport type PostTasksBody = z.infer<typeof postTasksBody>\n",
    "  )\n"
    "  /* Issue #487: on a same-day Schedule, two explicit endpoint times are ordered.\n"
    "     Missing times stay missing; they are never inferred for comparison. */\n"
    "  .refine(\n"
    "    (body) =>\n"
    "      !isSet(body.start_date) ||\n"
    "      !isSet(body.due_date) ||\n"
    "      body.start_date !== body.due_date ||\n"
    "      !isSet(body.start_time) ||\n"
    "      !isSet(body.due_time) ||\n"
    "      body.start_time.slice(0, 5) <= body.due_time.slice(0, 5),\n"
    "    {\n"
    "      error: 'must not be later than due_time when start_date and due_date are the same day',\n"
    "      path: ['start_time'],\n"
    "    },\n"
    "  )\n"
    "export type PostTasksBody = z.infer<typeof postTasksBody>\n",
)
replace_once(
    shared,
    "  .refine((body) => !(body.due_date === null && isSet(body.due_time)), {\n"
    "    error: 'cannot be set in a body that clears due_date',\n"
    "    path: ['due_time'],\n"
    "  })\n",
    "  .refine((body) => !(body.due_date === null && isSet(body.due_time)), {\n"
    "    error: 'cannot be set in a body that clears due_date',\n"
    "    path: ['due_time'],\n"
    "  })\n"
    "  .refine((body) => !(body.start_date === null && isSet(body.start_time)), {\n"
    "    error: 'cannot be set in a body that clears start_date',\n"
    "    path: ['start_time'],\n"
    "  })\n",
)
replace_once(
    shared,
    "  start_date: dueDate.nullable(),\n  due_date: dueDate.nullable(),\n",
    "  start_date: dueDate.nullable(),\n  start_time: wallClockTime.nullable(),\n  due_date: dueDate.nullable(),\n",
)

# Canonical server read/write path.
domain = "app/src/server/domain/tasks.ts"
replace_once(
    domain,
    "const START_DATE = sql`to_char(t.start_date, 'YYYY-MM-DD')`\nconst DUE_DATE = sql`to_char(t.due_date, 'YYYY-MM-DD')`\n",
    "const START_DATE = sql`to_char(t.start_date, 'YYYY-MM-DD')`\nconst START_TIME = sql`to_char(t.start_time, 'HH24:MI')`\nconst DUE_DATE = sql`to_char(t.due_date, 'YYYY-MM-DD')`\n",
)
replace_once(
    domain,
    "  startDate: string | null\n  /**\n",
    "  startDate: string | null\n  startTime: string | null\n  /**\n",
)
replace_once(
    domain,
    "       t.assignee_id, t.assignee_ids, ${START_DATE} AS start_date,\n       ${DUE_DATE} AS due_date, ${DUE_TIME} AS due_time,\n",
    "       t.assignee_id, t.assignee_ids, ${START_DATE} AS start_date,\n       ${START_TIME} AS start_time,\n       ${DUE_DATE} AS due_date, ${DUE_TIME} AS due_time,\n",
)
replace_once(
    domain,
    "    startDate: nullableString(row.start_date),\n    facts,\n",
    "    startDate: nullableString(row.start_date),\n    startTime: nullableString(row.start_time),\n    facts,\n",
)
replace_once(
    domain,
    "               ${START_DATE} AS start_date,\n               ${DUE_DATE} AS due_date, ${DUE_TIME} AS due_time,\n",
    "               ${START_DATE} AS start_date, ${START_TIME} AS start_time,\n               ${DUE_DATE} AS due_date, ${DUE_TIME} AS due_time,\n",
)
replace_once(
    domain,
    "    start_date: nullableString(row.start_date),\n    due_date: nullableString(row.due_date),\n",
    "    start_date: nullableString(row.start_date),\n    start_time: nullableString(row.start_time),\n    due_date: nullableString(row.due_date),\n",
)
replace_once(
    domain,
    "                             start_date, due_date,\n                             due_time, recurrence_rule, series_id,\n",
    "                             start_date, start_time, due_date,\n                             due_time, recurrence_rule, series_id,\n",
)
replace_once(
    domain,
    "                  ${body.start_date ?? null}::date,\n                  ${body.due_date ?? null}::date,\n",
    "                  ${body.start_date ?? null}::date,\n                  ${body.start_time ?? null}::time,\n                  ${body.due_date ?? null}::date,\n",
)
replace_once(
    domain,
    "  | { kind: 'time_without_date' }\n  | { kind: 'rule_without_date' }\n  | { kind: 'start_after_due'; field: 'start_date' | 'due_date' }\n",
    "  | { kind: 'time_without_date' }\n  | { kind: 'start_time_without_date' }\n  | { kind: 'rule_without_date' }\n  | { kind: 'start_after_due'; field: 'start_date' | 'due_date' }\n"
    "  | { kind: 'start_after_due_time'; field: 'start_date' | 'start_time' | 'due_date' | 'due_time' }\n",
)
replace_once(
    domain,
    "    const finalStartDate =\n      patch.start_date !== undefined ? patch.start_date : current.startDate\n    if (\n",
    "    const clearingStart = patch.start_date === null\n"
    "    const finalStartDate =\n"
    "      patch.start_date !== undefined ? patch.start_date : current.startDate\n"
    "    if (\n"
    "      !clearingStart &&\n"
    "      patch.start_time !== undefined &&\n"
    "      patch.start_time !== null &&\n"
    "      finalStartDate === null\n"
    "    ) {\n"
    "      return { kind: 'start_time_without_date' }\n"
    "    }\n"
    "    const finalStartTime = clearingStart\n"
    "      ? null\n"
    "      : patch.start_time !== undefined\n"
    "        ? minuteOf(patch.start_time)\n"
    "        : current.startTime\n"
    "    if (\n",
)
replace_once(
    domain,
    "    const finalDueTime = clearing\n      ? null\n      : patch.due_time !== undefined\n        ? minuteOf(patch.due_time)\n        : current.dueTime\n\n    // 4.8's mode rule and INV-6, in the direction only the row can answer.\n",
    "    const finalDueTime = clearing\n"
    "      ? null\n"
    "      : patch.due_time !== undefined\n"
    "        ? minuteOf(patch.due_time)\n"
    "        : current.dueTime\n\n"
    "    if (\n"
    "      finalStartDate !== null &&\n"
    "      finalDueDate !== null &&\n"
    "      finalStartDate === finalDueDate &&\n"
    "      finalStartTime !== null &&\n"
    "      finalDueTime !== null &&\n"
    "      finalStartTime > finalDueTime\n"
    "    ) {\n"
    "      return {\n"
    "        kind: 'start_after_due_time',\n"
    "        field:\n"
    "          patch.start_time !== undefined\n"
    "            ? 'start_time'\n"
    "            : patch.due_time !== undefined\n"
    "              ? 'due_time'\n"
    "              : patch.start_date !== undefined\n"
    "                ? 'start_date'\n"
    "                : 'due_date',\n"
    "      }\n"
    "    }\n\n"
    "    // 4.8's mode rule and INV-6, in the direction only the row can answer.\n",
)
replace_once(
    domain,
    "    if (patch.start_date !== undefined) {\n      sets.push(sql`start_date = ${patch.start_date}::date`)\n    }\n    if (clearing) {\n",
    "    if (clearingStart) {\n"
    "      sets.push(sql`start_date = NULL`)\n"
    "      sets.push(sql`start_time = NULL`)\n"
    "    } else {\n"
    "      if (patch.start_date !== undefined) {\n"
    "        sets.push(sql`start_date = ${patch.start_date}::date`)\n"
    "      }\n"
    "      if (patch.start_time !== undefined) {\n"
    "        sets.push(sql`start_time = ${patch.start_time}::time`)\n"
    "      }\n"
    "    }\n"
    "    if (clearing) {\n",
)

# HTTP mapping for row-dependent PATCH refusals.
routes = "app/src/server/routes/tasks.ts"
replace_once(
    routes,
    "        case 'time_without_date':\n          fieldError(res, 'due_time', 'requires a due_date')\n          return\n        case 'rule_without_date':\n",
    "        case 'time_without_date':\n"
    "          fieldError(res, 'due_time', 'requires a due_date')\n"
    "          return\n"
    "        case 'start_time_without_date':\n"
    "          fieldError(res, 'start_time', 'requires a start_date')\n"
    "          return\n"
    "        case 'rule_without_date':\n",
)
replace_once(
    routes,
    "        case 'reminder_refused':\n",
    "        case 'start_after_due_time':\n"
    "          fieldError(\n"
    "            res,\n"
    "            result.field,\n"
    "            result.field === 'start_time' || result.field === 'start_date'\n"
    "              ? 'must not be later than the Due endpoint when both endpoints are timed on the same day'\n"
    "              : 'must not be earlier than the Start endpoint when both endpoints are timed on the same day',\n"
    "          )\n"
    "          return\n"
    "        case 'reminder_refused':\n",
)

# List/card projection.
cards = "app/src/server/views/cards.ts"
replace_once(
    cards,
    "export const START_DATE = sql`to_char(t.start_date, 'YYYY-MM-DD')`\nexport const DUE_DATE = sql`to_char(t.due_date, 'YYYY-MM-DD')`\n",
    "export const START_DATE = sql`to_char(t.start_date, 'YYYY-MM-DD')`\n"
    "export const START_TIME = sql`to_char(t.start_time, 'HH24:MI')`\n"
    "export const DUE_DATE = sql`to_char(t.due_date, 'YYYY-MM-DD')`\n",
)
replace_once(
    cards,
    "    ${START_DATE} AS start_date,\n    ${DUE_DATE} AS due_date, ${DUE_TIME} AS due_time,\n",
    "    ${START_DATE} AS start_date, ${START_TIME} AS start_time,\n"
    "    ${DUE_DATE} AS due_date, ${DUE_TIME} AS due_time,\n",
)
replace_once(
    cards,
    "    start_date: nullableString(row.start_date),\n    due_date: nullableString(row.due_date),\n",
    "    start_date: nullableString(row.start_date),\n"
    "    start_time: nullableString(row.start_time),\n"
    "    due_date: nullableString(row.due_date),\n",
)

# Account export: bump shape version and carry start_time.
shared_export = "app/src/shared/export.ts"
replace_once(
    shared_export,
    "export const EXPORT_VERSION = 10\n",
    "/*\n"
    "**10 to 11 on 2026-10-02, issue #487.** Every exported task gains\n"
    "`start_time`, the Start endpoint's floating wall-clock time. A version-10\n"
    "reader would otherwise silently discard part of the authored Schedule.\n"
    "*/\n"
    "export const EXPORT_VERSION = 11\n",
)
replace_once(
    shared_export,
    "  start_date: z.string().nullable(),\n  due_date: z.string().nullable(),\n",
    "  start_date: z.string().nullable(),\n  start_time: z.string().nullable(),\n  due_date: z.string().nullable(),\n",
)
export_domain = "app/src/server/domain/export.ts"
replace_once(
    export_domain,
    "const START_DATE = sql`to_char(t.start_date, 'YYYY-MM-DD')`\nconst DUE_DATE = sql`to_char(t.due_date, 'YYYY-MM-DD')`\n",
    "const START_DATE = sql`to_char(t.start_date, 'YYYY-MM-DD')`\n"
    "const START_TIME = sql`to_char(t.start_time, 'HH24:MI')`\n"
    "const DUE_DATE = sql`to_char(t.due_date, 'YYYY-MM-DD')`\n",
)
replace_once(
    export_domain,
    "    start_date: nullableString(row.start_date),\n    due_date: nullableString(row.due_date),\n",
    "    start_date: nullableString(row.start_date),\n"
    "    start_time: nullableString(row.start_time),\n"
    "    due_date: nullableString(row.due_date),\n",
)
replace_once(
    export_domain,
    "  ${START_DATE} AS start_date,\n  ${DUE_DATE} AS due_date, ${DUE_TIME} AS due_time,\n",
    "  ${START_DATE} AS start_date, ${START_TIME} AS start_time,\n"
    "  ${DUE_DATE} AS due_date, ${DUE_TIME} AS due_time,\n",
)

# Duplication/copy behavior: carry Start endpoint time without changing existing Due semantics.
acts = "app/src/server/domain/acts.ts"
replace_n(
    acts,
    "                   to_char(start_date, 'YYYY-MM-DD') AS start_date,\n                   to_char(due_date, 'YYYY-MM-DD') AS due_date,\n",
    "                   to_char(start_date, 'YYYY-MM-DD') AS start_date,\n"
    "                   to_char(start_time, 'HH24:MI') AS start_time,\n"
    "                   to_char(due_date, 'YYYY-MM-DD') AS due_date,\n",
    2,
)
replace_n(
    acts,
    "title, notes, important, start_date, due_date,\n",
    "title, notes, important, start_date, start_time, due_date,\n",
    2,
)
replace_n(
    acts,
    "${nullableDate(row.start_date)}, ${nullableDate(row.due_date)},\n",
    "${nullableDate(row.start_date)}, ${nullableTime(row.start_time)}, ${nullableDate(row.due_date)},\n",
    1,
)
replace_n(
    acts,
    "${nullableDate(storedStart)}, ${nullableDate(storedDue)},\n",
    "${nullableDate(storedStart)}, ${nullableTime(stored.start_time)}, ${nullableDate(storedDue)},\n",
    1,
)
# acts already has nullableDate; add a time twin beside it if absent.
replace_once(
    acts,
    "function nullableDate(value: unknown): SQL {\n  return value === null || value === undefined ? sql`NULL` : sql`${String(value)}::date`\n}\n",
    "function nullableDate(value: unknown): SQL {\n"
    "  return value === null || value === undefined ? sql`NULL` : sql`${String(value)}::date`\n"
    "}\n\n"
    "function nullableTime(value: unknown): SQL {\n"
    "  return value === null || value === undefined ? sql`NULL` : sql`${String(value)}::time`\n"
    "}\n",
)

# Test harness: key-exact wire shape plus stored row truth.
harness = "app/tests/support/tasks-harness.ts"
replace_once(
    harness,
    "  'section_block_id',\n  'start_date',\n  'status',\n",
    "  'section_block_id',\n  'start_date',\n  'start_time',\n  'status',\n",
)
replace_once(
    harness,
    "  expectDateOrNull(card.start_date, `${source}.start_date`)\n  expectDateOrNull(card.due_date, `${source}.due_date`)\n",
    "  expectDateOrNull(card.start_date, `${source}.start_date`)\n"
    "  expectTimeOrNull(card.start_time, `${source}.start_time`)\n"
    "  expectDateOrNull(card.due_date, `${source}.due_date`)\n",
)
replace_once(
    harness,
    "  start_date: string | null\n  due_date: string | null\n",
    "  start_date: string | null\n  start_time: string | null\n  due_date: string | null\n",
)
replace_once(
    harness,
    "             ${dateColumn('start_date')},\n             ${dateColumn('due_date')}, ${timeColumn('due_time')},\n",
    "             ${dateColumn('start_date')}, ${timeColumn('start_time')},\n"
    "             ${dateColumn('due_date')}, ${timeColumn('due_time')},\n",
)

# Specs: the persisted contract, wire format, API behavior, and acceptance criterion.
replace_once(
    "docs/spec/04-data-model/04.5-tasks.md",
    "(`position`), `0016_compose_first_canvas.sql` (`page_position`) and\n`0018_task_start_date.sql` (`start_date`).\n",
    "(`position`), `0016_compose_first_canvas.sql` (`page_position`),\n"
    "`0018_task_start_date.sql` (`start_date`) and `0065_task_start_time.sql`\n"
    "(`start_time` and its Schedule checks).\n",
)
replace_once(
    "docs/spec/04-data-model/04.5-tasks.md",
    "- **Dates are floating** (4.11). `start_date` is when the task is intended to begin, and\n  never falls after `due_date`; nothing infers one. `due_time` requires a date; v2\n",
    "- **Schedule dates and endpoint times are floating** (4.11). `start_date` is when the task\n"
    "  is intended to begin and never falls after `due_date`; nothing infers one. `start_time`\n"
    "  requires `start_date`. When both dates are the same and both endpoint times exist,\n"
    "  `start_time <= due_time`; a missing time is never inferred. `due_time` requires a date; v2\n",
)
replace_once(
    "docs/spec/04-data-model/04.11-storage-formats-each-against-a-standard.md",
    "- **due_time**: SQL TIME, minute precision, floating wall-clock time. Same rationale.\n  Cross-timezone members each read it as their local wall time.\n",
    "- **due_time** (and **start_time**): SQL TIME, minute precision, floating wall-clock time.\n"
    "  Same rationale. Cross-timezone members each read the same digits as their local wall\n"
    "  time; neither endpoint time is an instant.\n",
)
replace_once(
    "docs/spec/04-data-model/04.11-storage-formats-each-against-a-standard.md",
    "**Assumption: `due_time` floats across timezones.** A shared 15:00 reads as each member's\nlocal 15:00. If cross-timezone coordination becomes a real use case, a per-task timezone\n",
    "**Assumption: task endpoint times float across timezones.** A shared 15:00 in `start_time`\n"
    "or `due_time` reads as each member's local 15:00. If cross-timezone coordination becomes\n"
    "a real use case, a per-task timezone\n",
)
replace_once(
    "docs/spec/07-api/07.0-conventions.md",
    "- Floating values ride the wire in the 4.11 formats they are stored in: due_date and\n  start_date as YYYY-MM-DD and due_time as HH:MM, never as instants, because an instant\n",
    "- Floating values ride the wire in the 4.11 formats they are stored in: due_date and\n"
    "  start_date as YYYY-MM-DD and due_time and start_time as HH:MM, never as instants, because an instant\n",
)
api = "docs/spec/07-api/07.6-tasks.md"
replace_once(
    api,
    "  false, assignee_id to V. Guards: member of the folder (404); title length and step count\n  within 10.3 (422); due_time, recurrence_rule and reminder each require due_date (422);\n  start_date not later than due_date where both are set (422 naming the field the body\n",
    "  false, assignee_id to V. Guards: member of the folder (404); title length and step count\n"
    "  within 10.3 (422); due_time, recurrence_rule and reminder each require due_date (422);\n"
    "  start_time requires start_date (422); start_date is not later than due_date where both\n"
    "  are set, and on the same date two explicit endpoint times require start_time <= due_time\n"
    "  (422 naming the field the body\n",
)
replace_once(
    api,
    "  - due_date changed (non-null): reminder fire_at recomputed; the series anchor moves with\n    it (8.5).\n",
    "  - start_date set to null clears start_time in the same transaction and leaves the Due\n"
    "    endpoint untouched; start_time otherwise requires the effective start_date. It never\n"
    "    recomputes a reminder.\n"
    "  - due_date changed (non-null): reminder fire_at recomputed; the series anchor moves with\n"
    "    it (8.5).\n",
)
replace_once(
    api,
    "  - start_date and due_date are checked against the merged state, since a body setting one\n    date is read against whichever the row already holds: start after due is 422.\n",
    "  - start_date and due_date are checked against the merged state, since a body setting one\n"
    "    date is read against whichever the row already holds: start after due is 422. On a\n"
    "    same-day Schedule, start_time and due_time are likewise checked against the merged\n"
    "    state when both exist; missing endpoint times are never inferred.\n",
)
replace_once(
    api,
    "A task's Schedule is start_date and due_date together; four states are valid: neither, start\nonly, due only, and both with start on or before due. Generated recurrence instances (8.5)\ncarry start_date null, since copying an absolute start forward would put a past start on a\nfuture occurrence. Duplication copies start_date as it stands without re-anchoring it.\n",
    "A task's Schedule is the Start endpoint (`start_date`, optional `start_time`) and Due endpoint\n"
    "(`due_date`, optional `due_time`). Four date states are valid: neither, start only, due only,\n"
    "and both with start on or before due. An endpoint time requires its own date; missing times are\n"
    "not inferred. If both dates are the same and both endpoint times exist, Start is no later than\n"
    "Due. `due_time` keeps all reminder, recurrence and overdue semantics; `start_time` changes none\n"
    "of them. Generated recurrence instances (8.5) carry start_date and start_time null, since\n"
    "generation remains Due-anchored. Duplication carries start_date and start_time with the copy;\n"
    "date re-anchoring moves dates while keeping the authored wall-clock endpoint times.\n",
)
replace_once(
    "docs/spec/12-acceptance-criteria/12.6-tasks-steps-and-the-task-surface.md",
    "- AC-423 Given the Task Schedule of 7.6, then `start_date` is carried end to end through create, read and PATCH in all four valid states — neither date, start only, due only, and both — read back from the response and from the row rather than inferred from a 200; a create or a PATCH leaving a start later than the due date is refused 422 naming the field the body sent, in both directions and with nothing written, rather than surfacing as a constraint violation; clearing either date leaves the other standing; a generated recurrence instance starts undated, 8.5 moving a recurring task forward from its due date alone; and a duplicated task and a duplicated folder each carry the Schedule with both ends moving together by one delta (spec 4.5, 7.6, 8.5).\n",
    "- AC-423 Given the Task Schedule of 7.6, then `start_date` and optional `start_time` are carried end to end through create, read and PATCH and read back from the response and row rather than inferred from a 200; `start_time` without an effective `start_date`, or a body that clears `start_date` while setting `start_time`, is refused 422 with nothing written; a create or PATCH leaving Start after Due is refused 422 naming the field moved, by date in either direction and, when both dates are the same and both endpoint times exist, by wall-clock time, while a missing time is never inferred; clearing `start_date` also clears `start_time` and leaves the Due endpoint standing, while clearing Due keeps the Start endpoint; changing only Start time does not recompute reminders or change recurrence/overdue semantics; a generated recurrence instance carries both Start fields null, 8.5 remaining Due-anchored; a duplicated task and duplicated folder preserve the authored Start endpoint while date re-anchoring moves its date with the Schedule; and the account export carries `start_time` (spec 4.5, 4.11, 7.0, 7.6, 7.22, 8.5).\n",
)

# Focused backend criterion for #487.
test_path = ROOT / "app/tests/criteria/ac-423-task-schedule.test.ts"
test_path.write_text(r'''/*
AC-423 / issue #487: Start has a real persisted optional wall-clock endpoint
without changing Due's existing reminder, recurrence or overdue semantics.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import {
  asRecord,
  createTask,
  createTaskOk,
  patchTask,
  patchTaskOk,
  readTask,
  reminderRow,
  requireTaskRow,
} from '../support/tasks-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac423')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

function errorText(value: unknown): string {
  return JSON.stringify(value)
}

describe('AC-423: persisted Start endpoint time', () => {
  test('create/read/PATCH persist start_time and date-only tasks stay date-only', async () => {
    const [owner] = await cast.of(app)
    if (owner === undefined) throw new Error('cast must produce an owner')
    const folderId = await createFolder(owner, 'ac423 persistence')

    const made = await createTaskOk(owner, {
      title: 'ac423 timed start', folder_id: folderId,
      start_date: '2026-10-10', start_time: '09:30',
    }, 'a Start-only task may carry a Start time')
    expect(made.start_date).toBe('2026-10-10')
    expect(made.start_time).toBe('09:30')
    expect(made.due_date).toBeNull()
    expect(made.due_time).toBeNull()
    const row = await requireTaskRow(app.db, made.id)
    expect(row.start_date).toBe('2026-10-10')
    expect(row.start_time).toBe('09:30:00')
    expect((await readTask(owner, made.id)).start_time).toBe('09:30')

    const patched = await patchTaskOk(owner, made.id, { start_time: '10:15:00' },
      'PATCH persists Start time against the stored Start date')
    expect(patched.start_time).toBe('10:15')
    expect((await requireTaskRow(app.db, made.id)).start_time).toBe('10:15:00')

    const dateOnly = await createTaskOk(owner, {
      title: 'ac423 date only', folder_id: folderId, start_date: '2026-10-11',
    }, 'a date-only Start remains valid')
    expect(dateOnly.start_time).toBeNull()
    expect((await requireTaskRow(app.db, dateOnly.id)).start_time).toBeNull()
  })

  test('start_time requires Start date and clearing Start clears its time atomically', async () => {
    const [owner] = await cast.of(app)
    if (owner === undefined) throw new Error('cast must produce an owner')
    const folderId = await createFolder(owner, 'ac423 dependency')

    const noDate = await createTask(owner, {
      title: 'ac423 no date', folder_id: folderId, start_time: '09:00',
    })
    expectStatus(noDate, 422, 'start_time without start_date is invalid')
    expect(errorText(noDate.json())).toContain('start_time')

    const task = await createTaskOk(owner, {
      title: 'ac423 clear start', folder_id: folderId,
      start_date: '2026-10-12', start_time: '08:00',
      due_date: '2026-10-13', due_time: '17:00',
    }, 'the two endpoints may both be timed')

    const contradiction = await patchTask(owner, task.id, {
      start_date: null, start_time: '10:00',
    })
    expectStatus(contradiction, 422, 'a body cannot clear Start and set Start time')
    expect(errorText(contradiction.json())).toContain('start_time')
    expect((await requireTaskRow(app.db, task.id)).start_time).toBe('08:00:00')

    const cleared = await patchTaskOk(owner, task.id, { start_date: null },
      'clearing Start clears only the Start endpoint')
    expect(cleared.start_date).toBeNull()
    expect(cleared.start_time).toBeNull()
    expect(cleared.due_date).toBe('2026-10-13')
    expect(cleared.due_time).toBe('17:00')
    const row = await requireTaskRow(app.db, task.id)
    expect(row.start_date).toBeNull()
    expect(row.start_time).toBeNull()
    expect(row.due_date).toBe('2026-10-13')
    expect(row.due_time).toBe('17:00:00')
  })

  test('same-day explicit endpoint times are ordered against merged PATCH state', async () => {
    const [owner] = await cast.of(app)
    if (owner === undefined) throw new Error('cast must produce an owner')
    const folderId = await createFolder(owner, 'ac423 order')

    const badCreate = await createTask(owner, {
      title: 'ac423 bad create', folder_id: folderId,
      start_date: '2026-10-14', start_time: '18:00',
      due_date: '2026-10-14', due_time: '17:00',
    })
    expectStatus(badCreate, 422, 'same-day Start time after Due time is invalid')
    expect(errorText(badCreate.json())).toContain('start_time')

    const task = await createTaskOk(owner, {
      title: 'ac423 ordered', folder_id: folderId,
      start_date: '2026-10-14', start_time: '09:00',
      due_date: '2026-10-14', due_time: '17:00',
    }, 'an ordered same-day window is valid')

    const badStart = await patchTask(owner, task.id, { start_time: '18:00' })
    expectStatus(badStart, 422, 'PATCH start_time is checked against stored due_time')
    expect(errorText(badStart.json())).toContain('start_time')
    expect((await requireTaskRow(app.db, task.id)).start_time).toBe('09:00:00')

    const badDue = await patchTask(owner, task.id, { due_time: '08:00' })
    expectStatus(badDue, 422, 'PATCH due_time is checked against stored start_time')
    expect(errorText(badDue.json())).toContain('due_time')
    expect((await requireTaskRow(app.db, task.id)).due_time).toBe('17:00:00')

    const crossDay = await patchTaskOk(owner, task.id, {
      due_date: '2026-10-15', due_time: '08:00',
    }, 'clock ordering does not compare endpoints on different dates')
    expect(crossDay.start_time).toBe('09:00')
    expect(crossDay.due_time).toBe('08:00')

    const collapse = await patchTask(owner, task.id, { due_date: '2026-10-14' })
    expectStatus(collapse, 422, 'moving a date can make stored endpoint times invalid')
    expect(errorText(collapse.json())).toContain('due_date')
  })

  test('Start time does not recompute Due reminders and recurrence remains Due-anchored', async () => {
    const [owner] = await cast.of(app)
    if (owner === undefined) throw new Error('cast must produce an owner')
    const folderId = await createFolder(owner, 'ac423 due semantics')

    const task = await createTaskOk(owner, {
      title: 'ac423 reminder', folder_id: folderId,
      start_date: '2030-01-09', start_time: '09:00',
      due_date: '2030-01-10', due_time: '17:00',
      reminder: { offset_minutes: 30 },
    }, 'a timed Due reminder may coexist with Start time')
    const reminderBefore = await reminderRow(app.db, task.id)
    await patchTaskOk(owner, task.id, { start_time: '10:00' },
      'changing Start time alone is a plain task edit')
    expect(await reminderRow(app.db, task.id)).toEqual(reminderBefore)

    const recurring = await createTaskOk(owner, {
      title: 'ac423 recurring', folder_id: folderId,
      start_date: '2026-10-01', start_time: '09:00',
      due_date: '2026-10-02', due_time: '17:00',
      recurrence_rule: 'FREQ=DAILY',
    }, 'a recurring task may have an authored Start endpoint')
    const completed = await owner.browser.json(`/tasks/${recurring.id}/complete?tz=UTC`, 'POST', {})
    expectStatus(completed, 200, 'completion generates the Due-anchored successor')
    const generated = asRecord(asRecord(completed.json(), 'transition body').generated_task, 'generated_task')
    expect(generated.start_date).toBeNull()
    expect(generated.start_time).toBeNull()
    const next = await requireTaskRow(app.db, String(generated.id))
    expect(next.start_date).toBeNull()
    expect(next.start_time).toBeNull()
  })

  test('task/folder duplication and account export preserve start_time', async () => {
    const [owner] = await cast.of(app)
    if (owner === undefined) throw new Error('cast must produce an owner')
    const folderId = await createFolder(owner, 'ac423 copies')
    const task = await createTaskOk(owner, {
      title: 'ac423 copied task', folder_id: folderId,
      start_date: '2030-02-01', start_time: '07:45',
      due_date: '2030-02-02',
    }, 'a copy source carries a Start time')

    const copied = await owner.browser.json(`/tasks/${task.id}/duplicate?tz=UTC`, 'POST', {})
    expectStatus(copied, 201, 'task duplication succeeds')
    const copiedId = String(asRecord(copied.json(), 'task duplicate').id)
    expect((await requireTaskRow(app.db, copiedId)).start_time).toBe('07:45:00')

    const folderCopy = await owner.browser.json(`/folders/${folderId}/duplicate?tz=UTC`, 'POST', {})
    expectStatus(folderCopy, 201, 'folder duplication succeeds')
    const copiedFolderId = String(asRecord(folderCopy.json(), 'folder duplicate').id)
    const copiedRows = await rows(app.db, sql`
      SELECT id, to_char(start_time, 'HH24:MI:SS') AS start_time
        FROM tasks WHERE folder_id = ${copiedFolderId}::uuid
          AND title = 'ac423 copied task'
    `)
    expect(copiedRows).toHaveLength(1)
    expect(copiedRows[0]?.start_time).toBe('07:45:00')

    const exported = await owner.browser.json('/me/export', 'GET')
    expectStatus(exported, 200, 'account export succeeds')
    const document = asRecord(exported.json(), 'account export')
    expect(document.version).toBe(11)
    const folders = document.folders as unknown[]
    const sourceFolder = folders.map((value) => asRecord(value, 'export folder'))
      .find((value) => value.id === folderId)
    expect(sourceFolder).toBeDefined()
    const exportedTask = (sourceFolder?.tasks as unknown[])
      .map((value) => asRecord(value, 'export task'))
      .find((value) => value.id === task.id)
    expect(exportedTask?.start_time).toBe('07:45')
  })
})
''')

print("issue #487 backend patch applied")
