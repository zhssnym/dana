/*
The standing test for prototype-v2.

It asserts invariants rather than only that pages render, because every rule
this refresh settled was lost at least once by being kept in memory instead of
in a check (DES-154). What it checks, beyond a page having content: no
prototype scaffolding in user-visible copy, exactly one glyph painted per
sidebar row, no stray title input left open in a list, no horizontal overflow,
no console error — on both sidebars.

Run it from anywhere, with `npm run dev` serving on 5240:

    node docs/design/prototype-v2/tools/sweep.mjs

Playwright is resolved out of `app/node_modules` rather than imported by bare
name, for the reason `tools/capture.sh` already records: that installation is
the one whose browsers are on this machine, and the prototype has no
Playwright dependency and needs none. A bare import would resolve against this
file's own folder and fail.
*/
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const appPackage = path.resolve(here, "../../../../app/package.json")
const { chromium } = createRequire(appPackage)("playwright")
/* 5240 is the canonical review server; SWEEP_BASE lets a session gate
   against its own instance when another session holds the port — two
   sessions sharing one flapping dev server is how false reds happen. */
const B = process.env.SWEEP_BASE ?? "http://127.0.0.1:5240"
const routes = [
  "/", "/?page=today", "/?page=scheduled", "/?page=scheduled&mode=calendar",
  "/?page=assignments", "/?page=important", "/?page=all", "/?page=done",
  "/?state=folder&folder=Travel", "/?state=folder&folder=Home",
  "/?page=people", "/?page=settings", "/?page=trash",
  "/?state=shelf&shelf=Personal", "/?view=states", "/?search=open",
  "/?state=empty", "/?state=offline", "/?view=landing", "/?view=form&form=expanded",
  /* The two public screens that carried the nativeButton warning for a month
     precisely because no route reached them — a page the sweep does not load
     is a page whose console nobody reads (V6). */
  "/?view=email&type=reminder", "/?view=invites",
  "/?page=abandoned", "/?page=anytime",
  /* The views a link can name. A route check that only asks whether a page
     rendered cannot see *which* view it rendered, which is how ?mode=calendar
     was killed at F6 and stayed green. */
  "/?page=today&mode=board", "/?page=assignments&mode=board",
  "/?nav=v1", "/?nav=v1&page=tasks", "/?nav=v1&page=planned", "/?nav=v1&page=all",
  "/?state=folder&folder=Travel&folder-page=v1",
]
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
const errs = []
p.on("console", (m) => { if (m.type() === "error") errs.push(`${p.url()} :: ${m.text()}`) })
p.on("pageerror", (e) => errs.push(`${p.url()} :: ${e.message}`))
const bad = []
for (const r of routes) {
  await p.goto(B + r); await p.waitForTimeout(650)
  const m = await p.evaluate(() => {
    const navRows = [...document.querySelectorAll('[data-sidebar-tier="primary"]')]
    const doubled = navRows.filter((el) =>
      [...el.querySelectorAll("svg")].filter((s) => getComputedStyle(s).visibility !== "hidden").length !== 1).length
    return {
      text: document.body.innerText.trim().length,
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      leak: /Previous folder page|arrives with V5|not available here|— you/.test(document.body.innerText),
      doubled,
      strayInputs: document.querySelectorAll('input[aria-label="Task title"]').length,
      /* No glyph is drawn out of square. Every icon in this family is a
         24-unit square scaled to its box, so a visible one whose width and
         height differ has lost its layout — which is exactly what happened
         when an animated component ignored the class that positioned it and
         two layers shared one flex line at half width each (F5). */
      squashed: [...document.querySelectorAll("svg")].filter((s) => {
        const box = s.getBoundingClientRect()
        return (
          box.width > 0 &&
          box.height > 0 &&
          Math.abs(box.width - box.height) > 1 &&
          getComputedStyle(s).visibility !== "hidden"
        )
      }).length,
    }
  })
  if (m.text < 40) bad.push(`${r}: empty`)
  if (m.overflow) bad.push(`${r}: overflow`)
  if (m.leak) bad.push(`${r}: artefact`)
  if (m.doubled) bad.push(`${r}: ${m.doubled} nav rows not showing exactly one glyph`)
  if (m.strayInputs) bad.push(`${r}: ${m.strayInputs} stray title inputs`)
  if (m.squashed) bad.push(`${r}: ${m.squashed} glyphs drawn out of square`)
}

/* The `mode=` routes above leave the remembered view on the board, and every
   block below measures pages at their default — so the loop cleans up after
   itself rather than leaving the next check to discover it. */
await p.evaluate(() => {
  localStorage.setItem("dana.pageView", "list")
  sessionStorage.clear()
})

/*
The filter panel, opened.

Every check above measures a page at rest, and the biggest surface added at F5
is not on a page at rest — it is one press deep. The squashed-glyph fault that
prompted the check was itself only visible inside this panel, so a sweep that
never opens it would have gone on passing while the thing was broken.
*/
await p.goto(B + "/?page=all")
await p.waitForTimeout(650)
await p.getByRole("button", { name: /^Filters/ }).click()
await p.waitForTimeout(400)
for (const axis of ["Due", "Assigned to", "Created by", "Repeats", "Group by", "Sort by"]) {
  const row = p.getByRole("dialog").last().getByRole("button", { name: new RegExp("^" + axis) })
  if (!(await row.count())) { bad.push(`filter panel: no ${axis} axis`); continue }
  await row.first().click()
  await p.waitForTimeout(180)
}
const panel = await p.evaluate(() => {
  const dialog = [...document.querySelectorAll('[role="dialog"]')].pop()
  if (!dialog) return { missing: true }
  return {
    squashed: [...dialog.querySelectorAll("svg")].filter((s) => {
      const box = s.getBoundingClientRect()
      return box.width > 0 && box.height > 0 && Math.abs(box.width - box.height) > 1
    }).length,
    /* Every control in the panel does something. A dead row here is DES-144's
       fault in the one place the whole model is being explained. */
    dead: [...dialog.querySelectorAll("button")].filter(
      (button) => button.disabled && !/Save as view/.test(button.textContent || ""),
    ).length,
  }
})
if (panel.missing) bad.push("filter panel: did not open")
if (panel.squashed) bad.push(`filter panel: ${panel.squashed} glyphs drawn out of square`)
if (panel.dead) bad.push(`filter panel: ${panel.dead} disabled controls`)

/*
Every menu's glyphs are one size.

Imran, 2026-08-22: "the icons sizing is also inconsistent in the overflow list
there." They were 24px in some menus and 16 in others, and the cause was a
silent mismatch rather than carelessness — shadcn sizes a menu's icons with
`[&_svg:not([class*='size-'])]:size-3.5`, which cannot reach ours, because our
icons are a span wrapping an svg whose class contains `size-full`. Menus whose
author happened to pass a size looked right; menus that trusted the primitive
did not.

Measured rather than read, because the fault lived in the gap between two
stylesheets and neither file was wrong on its own.
*/
for (const route of ["/?page=today", "/?state=folder&folder=Travel", "/?page=all"]) {
  await p.goto(B + route)
  await p.waitForTimeout(650)
  const count = await p.locator('[data-slot="dropdown-menu-trigger"]').count()
  for (let i = 0; i < count; i++) {
    await p.evaluate((n) => {
      document.querySelectorAll('[data-slot="dropdown-menu-trigger"]')[n]?.click()
    }, i)
    await p.waitForTimeout(140)
    const off = await p.evaluate(() => {
      const menu = [...document.querySelectorAll('[role="menu"]')].pop()
      if (!menu) return null
      const sizes = new Set()
      menu.querySelectorAll("svg").forEach((svg) => {
        const box = svg.getBoundingClientRect()
        if (box.width > 0) sizes.add(Math.round(box.width))
      })
      /* A pixel of tolerance, because a glyph caught mid-animation measures a
         fraction over its box and that is motion rather than a size decision.
         The faults this exists to catch are 24 and 14 — both well outside it,
         so nothing real hides in the slack. */
      return {
        name: menu.textContent.trim().slice(0, 24),
        bad: [...sizes].filter((s) => Math.abs(s - 16) > 1),
      }
    })
    if (off?.bad.length) {
      bad.push(`${route}: menu "${off.name}" has ${off.bad.join(", ")}px icons, want 16`)
    }
    await p.keyboard.press("Escape")
    await p.waitForTimeout(90)
  }
}

/*
The sidebar's drag, driven rather than looked at.

Three gestures that a page at rest cannot show: reordering folders, moving one
in and out of a group, and holding two together until they become a group.
Every one of them is invisible to every check above, and the whole surface is
new at F6 — so it is exercised here with a real pointer, and asserted on the
model rather than on the pixels.

The entries are addressable by `data-entry`, which the drag needs anyway to
hit-test its own containers, so nothing exists here purely for the test.
*/
async function pickUp(from, to, { hold = 0, edge = "middle" } = {}) {
  /* A group is grabbed by its heading, not its middle: the middle of a group
     is one of its folders, and pressing there drags that folder — which is
     what a person means by pressing it. */
  const box = (entry) =>
    p.evaluate((e) => {
      const node = document.querySelector(`[data-entry="${e}"]`)
      if (!node) return null
      const r = node.getBoundingClientRect()
      const grab = e.startsWith("group:") ? r.top + 12 : r.top + r.height / 2
      return { x: r.left + r.width / 2, y: grab, top: r.top, bottom: r.bottom }
    }, entry)
  const a = await box(from)
  const t = await box(to)
  if (!a || !t) return false
  const y = edge === "top" ? t.top + 4 : edge === "bottom" ? t.bottom - 4 : t.y
  await p.mouse.move(a.x, a.y)
  await p.mouse.down()
  /* Past the lift threshold first, or the press is still a click. */
  await p.mouse.move(a.x, a.y + 8, { steps: 3 })
  await p.mouse.move(t.x, y, { steps: 12 })
  if (hold) {
    await p.mouse.move(t.x, y + 1, { steps: 2 })
    await p.waitForTimeout(hold)
  }
  return true
}
const release = async () => {
  await p.mouse.up()
  await p.waitForTimeout(400)
}
const directory = () =>
  p.evaluate(() =>
    [...document.querySelectorAll("[data-drop-row]")].map(
      (n) => `${n.dataset.entry}@${n.dataset.container}`,
    ),
  )
async function freshSidebar() {
  await p.goto(B + "/")
  await p.evaluate(() => {
    localStorage.removeItem("dana:prototype-folder-order")
    localStorage.removeItem("dana:prototype-folder-memberships")
  })
  await p.goto(B + "/")
  await p.waitForTimeout(650)
}

await freshSidebar()
const seed = (await directory()).join(",")
/* The alphabet is still the seed: a sidebar nobody has dragged reads exactly
   as it did before any of this existed, which is what keeps the clean-handoff
   export and every capture stable. */
if (
  seed !==
  "group:Personal@directory,folder:Home@group:Personal,folder:Travel@group:Personal," +
    "group:Work@directory,folder:Business@group:Work,folder:Office@group:Work," +
    "folder:Ideas@directory,folder:Reading list@directory"
) {
  bad.push(`sidebar: untouched order is not the alphabet — ${seed}`)
}

/* A group moves too, and carries its folders — the half that was missing
   until Imran said the sidebar sorted alphabetically and nothing else. */
await pickUp("group:Personal", "group:Work", { edge: "bottom" })
await release()
const afterGroup = await directory()
if (
  afterGroup.indexOf("group:Personal@directory") <
  afterGroup.indexOf("group:Work@directory")
) {
  bad.push("sidebar: a folder group cannot be dragged")
}
if (
  afterGroup.indexOf("folder:Home@group:Personal") !==
  afterGroup.indexOf("group:Personal@directory") + 1
) {
  bad.push("sidebar: a dragged group left its folders behind")
}
await freshSidebar()

/* Reorder, within the directory and within a group. */
await pickUp("folder:Reading list", "folder:Ideas", { edge: "top" })
await release()
let now = await directory()
if (now.indexOf("folder:Reading list@directory") > now.indexOf("folder:Ideas@directory")) {
  bad.push("sidebar: two loose folders will not swap")
}
await freshSidebar()
await pickUp("folder:Travel", "folder:Home", { edge: "top" })
await release()
now = await directory()
if (
  now.indexOf("folder:Travel@group:Personal") > now.indexOf("folder:Home@group:Personal")
) {
  bad.push("sidebar: folders inside a group will not swap")
}

/* Into a group, and out again — one gesture in two directions. */
await freshSidebar()
await pickUp("folder:Ideas", "folder:Business")
const proposing = await p.evaluate(() => {
  const tinted = [...document.querySelectorAll("[data-entry]")].filter((n) =>
    /dana-accent-50/.test(n.className),
  ).length
  const said = [...document.querySelectorAll("span")].some(
    (n) => n.textContent?.trim() === "Into Work",
  )
  return { tinted, said }
})
if (!proposing.tinted || !proposing.said) {
  bad.push(`sidebar: a drop into a group is not shown before release — ${JSON.stringify(proposing)}`)
}
await release()
if (!(await directory()).includes("folder:Ideas@group:Work")) {
  bad.push("sidebar: a folder will not join a group")
}
await pickUp("folder:Ideas", "folder:Reading list", { edge: "bottom" })
await release()
if (!(await directory()).includes("folder:Ideas@directory")) {
  bad.push("sidebar: a folder will not leave a group")
}

/* The hold that makes a group, and the dialog it opens. */
await freshSidebar()
await pickUp("folder:Ideas", "folder:Reading list", { hold: 2100 })
await release()
const madeGroup = await p.evaluate(() => {
  const dialog = [...document.querySelectorAll('[role="dialog"]')].pop()
  if (!dialog) return null
  return {
    heading: dialog.textContent?.slice(0, 40),
    ticked: [...dialog.querySelectorAll("label")].filter((l) =>
      l.querySelector('[data-checked],[aria-checked="true"]'),
    ).length,
  }
})
if (!madeGroup || madeGroup.ticked !== 2) {
  bad.push(`sidebar: holding two folders together does not offer a group — ${JSON.stringify(madeGroup)}`)
}
await p.keyboard.press("Escape")
await p.waitForTimeout(250)

/* A press that never travelled is still a press, and one that did is not. */
await freshSidebar()
await p.evaluate(() => {
  document.querySelector('[data-entry="folder:Ideas"] button')?.click()
})
await p.waitForTimeout(650)
if (!/folder=Ideas/.test(p.url())) bad.push("sidebar: a plain click no longer opens a folder")
await freshSidebar()
const parked = p.url()
await pickUp("folder:Reading list", "folder:Ideas", { edge: "top" })
await release()
if (p.url() !== parked) bad.push("sidebar: a drag also navigated")

/* And the arrangement is a person's, so it is kept. */
await p.goto(B + "/")
await p.waitForTimeout(650)
now = await directory()
if (now.indexOf("folder:Reading list@directory") > now.indexOf("folder:Ideas@directory")) {
  bad.push("sidebar: the arrangement did not survive a reload")
}
await p.evaluate(() => {
  localStorage.removeItem("dana:prototype-folder-order")
  localStorage.removeItem("dana:prototype-folder-memberships")
})

/*
The board's cards, moved.

A page at rest cannot show whether a card can leave its column, and for one
stretch it could not — the board drew its cards by hand and had no drag at
all, while the list beside it had had one since F5. It goes on the same
engine now, so the check is the same shape as the sidebar's above: drive it,
and read the model rather than the pixels.
*/
await p.goto(B + "/?state=folder&folder=Travel")
await p.waitForTimeout(900)
await p.evaluate(() =>
  document.querySelector('[role="radio"][aria-label="Board view"]')?.click(),
)
await p.waitForTimeout(600)

const columns = () =>
  p.evaluate(() =>
    [...document.querySelectorAll("[data-board-column]")].map((column) => ({
      id: column.dataset.boardColumn,
      cards: [...column.querySelectorAll('[role="button"][tabindex="0"]')].map((card) =>
        card.textContent.trim().split("\n")[0].slice(0, 30),
      ),
    })),
  )

async function carryCard(fromColumn, toColumn) {
  const points = await p.evaluate(([from, to]) => {
    const cols = [...document.querySelectorAll("[data-board-column]")]
    const card = cols[from]?.querySelector('[role="button"][tabindex="0"]')
    const target = cols[to]
    if (!card || !target) return null
    const a = card.getBoundingClientRect()
    const z = target.getBoundingClientRect()
    return {
      title: card.textContent.trim().split("\n")[0].slice(0, 30),
      from: { x: a.left + a.width / 2, y: a.top + a.height / 2 },
      to: { x: z.left + z.width / 2, y: z.top + 60 },
    }
  }, [fromColumn, toColumn])
  if (!points) return null
  await p.mouse.move(points.from.x, points.from.y)
  await p.mouse.down()
  await p.mouse.move(points.from.x, points.from.y + 8, { steps: 3 })
  await p.mouse.move(points.to.x, points.to.y, { steps: 16 })
  await p.mouse.up()
  await p.waitForTimeout(700)
  return points.title
}

const boardBefore = await columns()
if (boardBefore.length < 3) {
  bad.push(`board: only ${boardBefore.length} columns`)
} else {
  const carried = await carryCard(0, 1)
  const boardAfter = await columns()
  if (!carried || !boardAfter[1].cards.some((title) => title.startsWith(carried.slice(0, 18)))) {
    bad.push(`board: a card will not move between columns (${carried})`)
  }
  /* Done is a column that means a status, so dropping on it completes. */
  const doneAt = boardAfter.findIndex((column) => column.id === "__done")
  if (doneAt < 0) bad.push("board: no Done column")
  else {
    const completedBefore = boardAfter[doneAt].cards.length
    await carryCard(0, doneAt)
    await p.waitForTimeout(1400)
    const done = await columns()
    if (done[doneAt].cards.length <= completedBefore) {
      bad.push("board: a card dropped on Done was not completed")
    }
  }
}

/*
Which views each page offers — DES-177, asserted rather than remembered.

The rule is short enough to hold in the head and that is exactly why it needs a
check: three screens each had a private answer before it, and the folder page
offered a calendar it could never draw. This is the rule written down twice, in
two languages, which is the only way a rule stays true.
*/
const viewsOf = () =>
  p.evaluate(() => {
    const group = [...document.querySelectorAll('[role="radiogroup"]')].find((node) =>
      /view$/i.test(node.getAttribute("aria-label") || ""),
    )
    if (!group) return null
    return {
      options: [...group.querySelectorAll('[role="radio"]')].map((radio) =>
        radio.getAttribute("aria-label"),
      ),
      dead: [...group.querySelectorAll('[role="radio"]')].filter((radio) => radio.disabled)
        .length,
    }
  })

for (const [route, want] of [
  ["/?page=today", ["List view", "Board view"]],
  ["/?page=scheduled", ["List view", "Board view", "Calendar view"]],
  ["/?page=important", ["List view", "Board view"]],
  ["/?page=all", ["List view", "Board view"]],
  ["/?page=assignments", ["List view", "Board view"]],
  ["/?state=folder&folder=Travel", ["List view", "Board view"]],
]) {
  await p.goto(B + route)
  await p.waitForTimeout(700)
  const offered = await viewsOf()
  if (!offered) {
    bad.push(`${route}: no view strip`)
    continue
  }
  if (JSON.stringify(offered.options) !== JSON.stringify(want)) {
    bad.push(`${route}: offers ${JSON.stringify(offered.options)}, rule says ${JSON.stringify(want)}`)
  }
  /* A view a page cannot draw is refused, never greyed: a disabled option
     promises something that is not coming (DES-144). */
  if (offered.dead) bad.push(`${route}: ${offered.dead} disabled view options`)
}

/*
A filter belongs to the page and to the session — DES-179.

Neither half is visible in a screenshot, and the wrong half failing is silent:
a filter that leaked would show as work missing from a page nobody narrowed.
*/
const barText = () =>
  p.evaluate(() => {
    const bar = [...document.querySelectorAll("div")].find(
      (node) =>
        typeof node.className === "string" && /shell-windowbar-height/.test(node.className),
    )
    return bar ? bar.innerText : ""
  })

await p.goto(B + "/?page=today")
await p.waitForTimeout(600)
await p.evaluate(() => sessionStorage.clear())
await p.goto(B + "/?page=today")
await p.waitForTimeout(700)
await p.getByRole("button", { name: /^Filters/ }).click()
await p.waitForTimeout(400)
await p.evaluate(() => {
  const dialog = [...document.querySelectorAll('[role="dialog"]')].pop()
  const label = [...dialog.querySelectorAll("*")].find(
    (node) => node.children.length === 0 && node.textContent.trim() === "Important only",
  )
  const row = label?.closest("label") || label?.parentElement
  const control = row?.querySelector('[role="switch"], button, input') || row
  control?.click()
})
await p.keyboard.press("Escape")
await p.waitForTimeout(500)
if (!/Important/i.test(await barText())) {
  bad.push("filter: setting one does not show as a chip")
}
await p.goto(B + "/?page=scheduled")
await p.waitForTimeout(700)
if (/Important/i.test(await barText())) {
  bad.push("filter: a narrowing followed to another page")
}
await p.goto(B + "/?page=today")
await p.waitForTimeout(700)
if (!/Important/i.test(await barText())) {
  bad.push("filter: a narrowing was lost on the way back to its own page")
}
await p.evaluate(() => sessionStorage.clear())

/*
A task made on a page appears on that page — DES-182.

The fault this catches was invisible for a stretch because the floating button
opens a surface over the page it has just failed to add to: you made a task on
Today, looked at it, closed it, and it was not there. Counting rows either side
of a capture is the only way to see it, which is why it is here rather than in
anybody's memory.
*/
const rowCount = () =>
  p.evaluate(() => document.querySelectorAll("main .rounded-lg.border").length)

for (const route of ["/?page=today", "/?page=important", "/?page=assignments"]) {
  await p.goto(B + route)
  await p.waitForTimeout(800)
  const before = await rowCount()
  const pressed = await p.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((node) =>
      /New task/i.test(node.getAttribute("aria-label") || node.textContent || ""),
    )
    if (!button) return false
    button.click()
    return true
  })
  if (!pressed) {
    bad.push(`${route}: no capture point at all`)
    continue
  }
  await p.waitForTimeout(700)
  await p.keyboard.press("Escape")
  await p.waitForTimeout(700)
  if ((await rowCount()) <= before) {
    bad.push(`${route}: a task made here does not appear here`)
  }
}

/*
And every board column can be captured into, except where a made task could
not belong: Done and Abandoned are states, not places.
*/
for (const [route, wanted] of [
  ["/?page=today", true],
  ["/?page=scheduled", true],
  ["/?page=assignments", true],
  ["/?page=done", false],
  ["/?page=abandoned", false],
]) {
  await p.goto(B + route)
  await p.waitForTimeout(600)
  await p.evaluate(() => sessionStorage.clear())
  await p.goto(B + route)
  await p.waitForTimeout(700)
  await p.evaluate(() =>
    document.querySelector('[role="radio"][aria-label="Board view"]')?.click(),
  )
  await p.waitForTimeout(800)
  const state = await p.evaluate(() => {
    const cols = [...document.querySelectorAll("[data-board-column]")]
    return {
      columns: cols.length,
      withAdd: cols.filter((column) => /Add task/i.test(column.innerText)).length,
      /* The floating button retires wherever a capture row exists — W5's one
         capture point per page, applied to a view rather than to a page
         (DES-133, DES-182). */
      fab: [...document.querySelectorAll("button")].filter((node) =>
        /New task/i.test(node.getAttribute("aria-label") || node.textContent || ""),
      ).length,
    }
  })
  if (wanted && state.columns && !state.withAdd) {
    bad.push(`${route} board: no column can be captured into`)
  }
  if (!wanted && state.withAdd) {
    bad.push(`${route} board: offers capture where a task could not belong`)
  }
  if (state.fab) bad.push(`${route} board: the floating button is still there`)
  await p.evaluate(() => sessionStorage.clear())
}

/*
The view is remembered across pages and the blocks above leave it on the
board, so this one names the view it is measuring rather than inheriting
whatever ran last. It then measures both, because the card is the row's kin
and the rule reached the row first and the card only after this check said so.
*/
await p.goto(B + "/?page=today")
await p.waitForTimeout(400)
await p.evaluate(() => {
  localStorage.setItem("dana.pageView", "list")
  /* And unfiltered, because the filter block above narrowed Today to starred
     work and a filter is kept for the session (DES-179) — measuring the
     overdue tone on a page still showing three of its rows would have been
     measuring the filter. A block states its own preconditions rather than
     inheriting whatever ran last. */
  sessionStorage.clear()
})

/*
A row says what its page does not — DES-183.

Four of the review's row findings were one fault, and all four are invisible
to a check that only asks whether a page rendered: a fill that should not be
there, a red that should be grey, a date that should be gone, and a chip that
should have been there all along. Each is measured rather than read, because
each of them looked fine in a screenshot for four sessions.
*/
const rowStars = () =>
  p.evaluate(() =>
    [...document.querySelectorAll('main button[aria-label="Remove from Important"]')].map(
      (button) => getComputedStyle(button.querySelector("span")).fill,
    ),
  )

const overdueTones = () =>
  p.evaluate(() => {
    let heading = "(top)"
    const found = []
    const walk = (node) => {
      for (const child of node.children) {
        if (/^H[1-6]$/.test(child.tagName)) {
          heading = child.textContent.trim().split("\n")[0]
        }
        if (typeof child.className === "string" && /rounded-lg border/.test(child.className)) {
          const chip = [...child.querySelectorAll("span")].find((node) =>
            /Overdue/.test(node.textContent),
          )
          if (chip) found.push({ heading, colour: getComputedStyle(chip).color })
        } else walk(child)
      }
    }
    walk(document.querySelector("main") || document.body)
    return found
  })

const rowText = () =>
  p.evaluate(() =>
    [...document.querySelectorAll("main .rounded-lg.border")].map((row) =>
      row.innerText.replace(/\n/g, " · "),
    ),
  )

await p.goto(B + "/?page=important")
await p.waitForTimeout(700)
const importantStars = await rowStars()
if (!importantStars.length) bad.push("row rule: no starred rows on Important to measure")
/* R2: the page is defined by the star, so no star on it is filled. */
if (importantStars.some((fill) => fill !== "rgb(0, 0, 0)")) {
  bad.push(`row rule: a star is still filled on Important — ${importantStars.join(", ")}`)
}

await p.goto(B + "/?page=today")
await p.waitForTimeout(700)
const carriedStars = await rowStars()
/* And elsewhere it still is, or the fix has quietened the wrong thing. */
if (!carriedStars.some((fill) => fill !== "rgb(0, 0, 0)")) {
  bad.push("row rule: no star is filled anywhere — Important's rule leaked")
}
/*
And it is never gold — Imran, 2026-08-22, after DES-183 left the shell with
two star colours. Important is a binary and the fill already says it, so a
second signal on the same fact is one more hue in a palette that is one accent
and graphite (W1). Checked across every page a star appears on, because "only
black is good" is exactly the kind of rule that holds in four places and slips
in the fifth.
*/
for (const route of ["/?page=today", "/?page=all", "/?page=important", "/?page=done"]) {
  await p.goto(B + route)
  await p.waitForTimeout(600)
  const gold = await p.evaluate(() =>
    [...document.querySelectorAll("main span, main svg")].filter((node) => {
      const style = getComputedStyle(node)
      return /185, 117, 20/.test(style.fill) || /185, 117, 20/.test(style.color)
    }).length,
  )
  if (gold) bad.push(`${route}: ${gold} elements still draw the star in gold`)
}
await p.goto(B + "/?page=today")
await p.waitForTimeout(600)
/* R4: everything under Carried over is late, so the red says nothing there. */
const carriedTones = (await overdueTones()).filter((row) => /Carried/.test(row.heading))
if (!carriedTones.length) bad.push("row rule: nothing overdue under Carried over to measure")
if (carriedTones.some((row) => /163, 44, 37/.test(row.colour))) {
  bad.push("row rule: overdue is still red inside Carried over")
}

await p.goto(B + "/?page=all")
await p.waitForTimeout(700)
const allTones = await overdueTones()
if (!allTones.some((row) => /163, 44, 37/.test(row.colour))) {
  bad.push("row rule: overdue lost its red everywhere — Carried over's rule leaked")
}
/* R1: an unfiled task is in Desk, and the row says so. */
if (!(await rowText()).some((text) => /Desk/.test(text))) {
  bad.push("row rule: an unfiled task shows no folder")
}

await p.goto(B + "/?page=done")
await p.waitForTimeout(700)
/* R7: the deadline is spent, and the headings already group by completion. */
if ((await rowText()).some((text) => /\bDue\b|Overdue/.test(text))) {
  bad.push("row rule: a finished task still echoes its due date")
}

/*
And the state sheet is drawn by the shipping row, so it cannot disagree with
the product — the fault that let it sit four sessions out of date.
*/
await p.goto(B + "/?view=states")
await p.waitForTimeout(700)
const sheet = await p.evaluate(() => ({
  sections: [...document.querySelectorAll("h2")].map((node) => node.textContent.trim()),
  states: [...document.querySelectorAll("main .font-mono")]
    .map((node) => node.textContent.trim())
    .filter((text) => /^STATE-/.test(text)).length,
  rows: document.querySelectorAll("main .rounded-lg.border").length,
}))
if (sheet.states < 10) bad.push(`states sheet: only ${sheet.states} states listed`)
if (sheet.rows < sheet.states) bad.push("states sheet: fewer rows than states")
if (!sheet.sections.some((title) => /already says/i.test(title))) {
  bad.push("states sheet: the suppression rule is not shown")
}

/*
Prose runs on; blocks get air — DES-193.

Two paragraphs on a folder page sat 32px apart, more than one and a half of
their own line-heights, which is a section break drawn by accident. The gap
is measured rather than eyeballed because it is a number, it regressed once
already, and Imran reported it twice.
*/
await p.goto(B + "/?state=folder&folder=Travel")
await p.waitForTimeout(800)
const prose = await p.evaluate(() => {
  const areas = [...document.querySelectorAll("main textarea")].filter(
    (node) => node.getAttribute("aria-label") === "Paragraph",
  )
  const heading = document.querySelector("main h2, main h3")
  if (areas.length < 2 || !heading) return null
  return {
    between: Math.round(
      areas[1].getBoundingClientRect().top - areas[0].getBoundingClientRect().bottom,
    ),
    toHeading: Math.round(
      heading.getBoundingClientRect().top -
        areas[areas.length - 1].getBoundingClientRect().bottom,
    ),
  }
})
if (!prose) bad.push("folder page: fewer than two paragraphs to measure")
else {
  /* One line-height of 12/20 prose, give or take. More than that and the two
     stop reading as consecutive. */
  if (prose.between > 22) {
    bad.push(`folder page: ${prose.between}px between two paragraphs, want about a line`)
  }
  /* And a block after prose still gets its air, or the fix has flattened the
     page instead of tightening one gap. */
  if (prose.toHeading < 24) {
    bad.push(`folder page: only ${prose.toHeading}px between prose and the next section`)
  }
}

/*
A link that names a view opens on that view — and a board reached by link
has columns, which is a different fact and was the one that broke.
*/
for (const [route, wanted] of [
  ["/?page=scheduled&mode=calendar", "Calendar view"],
  ["/?page=today&mode=board", "Board view"],
]) {
  await p.goto(B + route)
  await p.waitForTimeout(900)
  const got = await p.evaluate(() => ({
    view: document
      .querySelector('[role="radio"][aria-checked="true"]')
      ?.getAttribute("aria-label"),
    columns: document.querySelectorAll("[data-board-column]").length,
  }))
  if (got.view !== wanted) {
    bad.push(route + ": opened on " + got.view + ", not " + wanted)
  }
  if (wanted === "Board view" && !got.columns) {
    bad.push(route + ": board opened with no columns")
  }
  await p.evaluate(() => {
    localStorage.setItem("dana.pageView", "list")
    sessionStorage.clear()
  })
}

/*
A duplicate carries the structure and drops the grants, the progress and the
conversation (DES-198).

Driven from the sidebar's menu rather than the folder page's, because the
sidebar is the surface with no task list of its own — if the seam between the
act and the shell ever breaks, this is the door that shows it.

Every assertion here is a thing that was actually wrong once. The tasks were
missing, then present but assigned, then unassigned but stamped "Overdue ·
6 Aug" from a label the copy inherited while its date moved underneath it.
*/
{
  await p.goto(B + "/?state=folder&folder=Travel")
  await p.waitForTimeout(700)
  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
  })
  await p.goto(B + "/?state=folder&folder=Travel")
  await p.waitForTimeout(800)

  /* The row's menu button only exists under the pointer, so the hover is part
     of the gesture rather than setup for it. */
  await p.hover('button[title="Travel"][data-sidebar-tier="folder"]')
  await p.waitForTimeout(250)
  await p.click('button[aria-label="Manage Travel folder"]')
  await p.waitForTimeout(300)
  await p.click('[role="menuitem"]:has-text("Duplicate")')
  await p.waitForTimeout(700)

  const copy = await p.evaluate(() => {
    const read = (k, f) => JSON.parse(localStorage.getItem(k) || f)
    const tasks = read("dana:prototype-copied-tasks", "[]")
    const layout = read("dana:prototype-folder-layout", "{}")["Travel copy"]
    return {
      tasks: tasks.length,
      /* Nobody else's grant travels — the work lands on the copier, which is
         not the same as landing on nobody (DES-198). */
      granted: tasks.filter(
        (t) => t.assignee || (t.form.assignee && t.form.assignee !== "Imran Wafa"),
      ).length,
      started: tasks.filter(
        (t) => t.status !== "pending" || t.myDayGroup || t.pulled || t.comments,
      ).length,
      stepsDone: tasks.filter((t) =>
        (t.form.steps || []).some((step) => step.done),
      ).length,
      /* The label and the date, which are two copies of one deadline. */
      contradicting: tasks.filter(
        (t) =>
          t.due &&
          t.form.dueDate &&
          !t.due.label.includes(
            String(Number(t.form.dueDate.slice(8, 10))),
          ),
      ).length,
      overdue: tasks.filter((t) => t.due && t.due.overdue).length,
      sections: (layout?.items || []).filter((i) => i.kind === "section").length,
      paragraphs: (layout?.items || []).filter((i) => i.kind === "paragraph")
        .length,
      /* Remapped onto the copies, not still pointing at the originals. */
      strandedAssign: Object.keys(layout?.assign || {}).filter(
        (id) => !tasks.some((t) => t.id === id),
      ).length,
      history: read("dana:prototype-history", "[]").map(
        (e) => e.verb + " " + e.name + " by " + e.actor,
      ),
    }
  })

  if (!copy.tasks) bad.push("duplicate: the copy arrived with no tasks")
  if (copy.granted) {
    bad.push("duplicate: " + copy.granted + " copied task(s) carry someone else's name")
  }
  if (copy.ownerless) {
    bad.push("duplicate: " + copy.ownerless + " copied task(s) belong to nobody")
  }
  if (copy.started) bad.push("duplicate: " + copy.started + " copied task(s) arrived started")
  if (copy.stepsDone) bad.push("duplicate: " + copy.stepsDone + " copied task(s) kept finished steps")
  if (copy.contradicting)
    bad.push("duplicate: " + copy.contradicting + " row(s) show a date their form disagrees with")
  if (copy.overdue) bad.push("duplicate: a brand-new folder arrived overdue")
  if (!copy.sections) bad.push("duplicate: the copy lost its sections")
  if (!copy.paragraphs) bad.push("duplicate: the copy lost its paragraphs")
  if (copy.strandedAssign)
    bad.push("duplicate: " + copy.strandedAssign + " section assignment(s) still point at the original's tasks")
  if (!copy.history.length) bad.push("duplicate: nothing was written to the history")

  /* And it survives the click into it, which is the whole point of a copy. */
  await p.goto(B + "/?state=folder&folder=" + encodeURIComponent("Travel copy"))
  await p.waitForTimeout(800)
  const landedRows = await rowCount()
  const landedText = await p.evaluate(() => document.body.innerText)
  if (landedRows !== copy.tasks) {
    bad.push(
      "duplicate: the copy drew " + landedRows + " of its " + copy.tasks +
        " tasks one click later",
    )
  }
  if (/Overdue/.test(landedText))
    bad.push("duplicate: the copy's page draws an overdue row")
  if (!/0 of /.test(landedText))
    bad.push("duplicate: the copy did not arrive unstarted")

  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
  })
}

/*
The log: one line per act, written by the act, read by the two controls that
show it.

Every assertion is something that was wrong at some point today. Completing
wrote two lines because the row both reports the change and tells the screen.
The resting line said "Edited" over a completion. And the native pages carried
an Activity control for a page nobody edits, over two invented entries.
*/
{
  const HIST = () =>
    p.evaluate(() =>
      JSON.parse(localStorage.getItem("dana:prototype-history") || "[]").map(
        (e) => ({ verb: e.verb, name: e.name, actor: e.actor, kind: e.kind }),
      ),
    )

  await p.goto(B + "/?page=today")
  await p.waitForTimeout(700)
  await p.evaluate(() => localStorage.removeItem("dana:prototype-history"))
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(800)

  const target = p.locator('[role="checkbox"][aria-label^="Complete "]').first()
  const targetName = (await target.getAttribute("aria-label")).replace(/^Complete /, "")
  await target.click()
  await p.waitForTimeout(700)

  const afterComplete = await HIST()
  /* Counted by verb rather than by store size: every object is seeded with the
     line that says it exists (DES-209), so the store is never empty and the
     question is what *this press* wrote. */
  const completions = afterComplete.filter((e) => e.verb === "completed")
  if (completions.length !== 1) {
    bad.push(
      "history: completing one task wrote " + completions.length + " completions",
    )
  }
  if (afterComplete.filter((e) => e.verb === "edited").length) {
    bad.push("history: completing also counted as an edit")
  }
  if (afterComplete[0] && !afterComplete[0].actor) {
    bad.push("history: an event was recorded with no actor")
  }
  const barSaid = await p.evaluate(() => document.body.innerText)
  if (!barSaid.includes("Completed “" + targetName + "”")) {
    bad.push("history: the bar did not say what the log recorded")
  }

  /* A view is not a thing, so it has no activity control. */
  const onToday = await p.evaluate(() =>
    [...document.querySelectorAll("button")].some((b) =>
      /(just now|ago|Yesterday)$/i.test(b.textContent.trim()),
    ),
  )
  if (onToday) bad.push("history: a native page drew an Activity control")

  /* The folder page's control reads the log, and its resting line names the
     act rather than always saying "Edited". */
  await p.goto(B + "/?state=folder&folder=Travel")
  await p.waitForTimeout(900)
  const rest = await p.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /(just now|ago|Yesterday)$/i.test(x.textContent.trim()),
    )
    return b ? b.textContent.trim() : null
  })
  if (!rest) bad.push("history: the folder page has no Activity control")
  else if (/^Edited/.test(rest) && afterComplete[0]?.verb === "completed") {
    bad.push("history: the folder bar said '" + rest + "' after a completion")
  }

  /*
  And a task's own footer, which is the third reader and the one Imran asked
  for: "for individual task we have a row at the footer of each task view".

  Completed first, then opened, because a card covers the list it came from —
  and the point is that the footer shows *that task's* past rather than the
  page's.
  */
  const NAME = "Keep the backup chair reservation"
  await p.click('[role="checkbox"][aria-label="Complete ' + NAME + '"]')
  await p.waitForTimeout(800)

  /* A row opens where there is no control: the title is a button and starts an
     inline rename, and the hover controls own the right end, so the gesture
     has to land in the row's own middle. That is the row's rule, not a quirk
     of this test — see the guard in task-row. */
  const row = p.locator('[class*="group/row"]', { hasText: NAME }).first()
  const box = await row.boundingBox()
  await p.mouse.click(box.x + box.width * 0.6, box.y + box.height / 2)
  await p.waitForTimeout(900)

  const footer = await p.evaluate(() =>
    [...document.querySelectorAll("button")]
      .map((b) => b.textContent.trim())
      .filter((t) => /(just now|ago|Yesterday)$/i.test(t)),
  )
  if (!footer.some((t) => /^Completed/.test(t))) {
    bad.push(
      "history: the open task's footer did not show its own act: " +
        (footer.join(", ") || "(nothing)"),
    )
  }

  await p.evaluate(() => localStorage.removeItem("dana:prototype-history"))
}

/*
Trash: deleting moves a thing rather than ending it (DES-200).

Driven end to end because every step of it was wrong at some point: the page
rendered My Day, the confirmation said "this can't be undone" about something
with two ways back, and a deleted task came back from the fixtures on the next
navigation while still sitting in the bin.
*/
{
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(700)
  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
  })
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(800)

  const NAME = "Water the balcony plants"
  const row = p.locator('[class*="group/row"]', { hasText: NAME }).first()
  await row.hover()
  await p.waitForTimeout(200)
  await row.locator('button[aria-label*="More actions"]').first().click()
  await p.waitForTimeout(300)
  await p.locator('[role="menuitem"]', { hasText: /^Delete task/ }).first().click()
  await p.waitForTimeout(700)

  /* No confirmation: two ways back means the question is friction. */
  const asked = await p.evaluate(() =>
    Boolean(document.querySelector('[role="alertdialog"]')),
  )
  if (asked) bad.push("trash: deleting a task still asks, though it is reversible twice over")

  const binned = await p.evaluate(() =>
    JSON.parse(localStorage.getItem("dana:prototype-trash") || "[]"),
  )
  if (binned.length !== 1) {
    bad.push("trash: deleting put " + binned.length + " things in the bin")
  } else if (!binned[0].from) {
    bad.push("trash: the entry does not say where it goes back to")
  }

  /* And it stays gone across a navigation, which is what a bin is for. */
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(800)
  if (await p.evaluate((n) => document.body.innerText.includes(n), NAME)) {
    bad.push("trash: a deleted task came back from the fixtures one click later")
  }

  await p.goto(B + "/?page=trash")
  await p.waitForTimeout(800)
  const page = await p.evaluate(() => document.body.innerText)
  if (!page.includes("Trash")) bad.push("trash: ?page=trash did not render Trash")
  if (!page.includes(NAME)) bad.push("trash: the bin did not list what was deleted")
  if (!/[0-9]+d left/.test(page)) bad.push("trash: no countdown on the row")

  /* Guarded: with the bin broken there is nothing to press, and a sweep that
     throws there reports a timeout instead of the fault that caused it. */
  const restore = p.locator("button", { hasText: /^Restore$/ }).first()
  if (!(await restore.count())) {
    bad.push("trash: nothing to restore — the bin never received the delete")
  } else {
    await restore.click()
    await p.waitForTimeout(700)
  const afterRestore = await p.evaluate(() => ({
    bin: JSON.parse(localStorage.getItem("dana:prototype-trash") || "[]").length,
    empty: document.body.innerText.includes("Nothing deleted"),
    history: JSON.parse(localStorage.getItem("dana:prototype-history") || "[]").map(
      (e) => e.verb,
    ),
  }))
  if (afterRestore.bin) bad.push("trash: restoring left the entry in the bin")
  if (!afterRestore.empty) bad.push("trash: the emptied bin did not say so")
  if (!afterRestore.history.includes("restored")) {
    bad.push("trash: restoring was not recorded")
  }

  await p.goto(B + "/?page=today")
  await p.waitForTimeout(800)
  if (!(await p.evaluate((n) => document.body.innerText.includes(n), NAME))) {
      bad.push("trash: a restored task did not come back to its page")
    }
  }

  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
  })
}

/*
A task's menu comes from the contract, and every act in it works (DES-201).

The row was the last hand-written menu, which is why a folder could be copied,
linked and duplicated while a task could not. Each assertion below is one of the
four acts that were declared and undrawable.
*/
{
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(700)
  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
  })
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(800)

  const NAME = "Water the balcony plants"
  const openMenu = async (label) => {
    await p.keyboard.press("Escape")
    await p.waitForTimeout(250)
    const row = p
      .locator('[class*="group/row"]')
      .filter({ has: p.locator('[role="checkbox"][aria-label="Complete ' + label + '"]') })
      .first()
    await row.hover()
    await p.waitForTimeout(150)
    await row.locator('button[aria-label="More actions"]').first().click()
    await p.waitForTimeout(350)
  }

  await openMenu(NAME)
  const items = await p.evaluate(() =>
    [...document.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent.trim()),
  )
  for (const wanted of ["History", "Copy link", "Duplicate"]) {
    if (!items.includes(wanted)) {
      bad.push("task menu: no " + wanted + " — got " + items.join(", "))
    }
  }
  /* Order is the contract's, everywhere: destructive last. */
  if (items.length && !/^Delete/.test(items[items.length - 1])) {
    bad.push("task menu: the destructive act is not last — " + items.join(", "))
  }

  const dupItem = p.locator('[role="menuitem"]', { hasText: /^Duplicate$/ }).first()
  if (!(await dupItem.count())) bad.push("task menu: nothing to duplicate with")
  else {
    await dupItem.click()
    await p.waitForTimeout(800)
  }
  const copy = await p.evaluate(() => {
    const copies = JSON.parse(localStorage.getItem("dana:prototype-copied-tasks") || "[]")
    return {
      n: copies.length,
      title: copies[0]?.title,
      started: copies.some((t) => t.status !== "pending"),
      /* A copy lands where you can see it, which the folder rules had cleared. */
      onPage: [...document.querySelectorAll('[role="checkbox"]')].some((b) =>
        (b.getAttribute("aria-label") || "").endsWith("(copy)"),
      ),
      id: copies[0]?.id,
      ownerless: copies.filter((t) => !t.form.assignee).length,
    }
  })
  if (copy.n !== 1) bad.push("task duplicate: made " + copy.n + " copies")
  if (copy.title !== NAME + " (copy)") bad.push("task duplicate: named it " + copy.title)
  if (copy.started) bad.push("task duplicate: the copy arrived started")
  if (!copy.onPage) bad.push("task duplicate: the copy is not on the page it was made from")

  /* History: the copy has a past of exactly one line, and it opens. */
  await openMenu(NAME + " (copy)")
  /* Guarded, like every other press this file makes on a menu the contract
     fills: with the act missing there is nothing to click, and a sweep that
     throws there reports a timeout instead of the fault behind it. */
  const historyItem = p.locator('[role="menuitem"]', { hasText: /^History$/ }).first()
  let sheet = null
  if (!(await historyItem.count())) {
    bad.push("task history: the menu offers no History")
  } else {
    await historyItem.click()
    await p.waitForTimeout(600)
    sheet = await p.evaluate(() => {
      const d = document.querySelector('[role="dialog"]')
      return d ? d.innerText.replace(/s+/g, " ") : null
    })
  }
  if (!sheet) bad.push("task history: the sheet did not open")
  else {
    if (!sheet.includes("(copy)")) bad.push("task history: the sheet named the wrong task — " + sheet)
    if (!sheet.includes("Created")) bad.push("task history: no record of the copy being made")
    if (!sheet.includes("Imran Wafa")) bad.push("task history: no actor on the line")
  }

  /* Copy link produces the address, and the address opens the task. */
  await p.keyboard.press("Escape")
  await p.waitForTimeout(300)
  const link = B + "/?task=" + copy.id
  await p.goto(link)
  await p.waitForTimeout(900)
  const landed = await p.evaluate(() => document.body.innerText)
  if (!/Add a step|Add step/i.test(landed)) {
    bad.push("task link: " + link + " did not open a task")
  } else if (!landed.includes("(copy)")) {
    bad.push("task link: opened the wrong task")
  }

  /*
  And the link stops being an instruction once obeyed (DES-211).

  It used to survive every navigation, so a task opened by a link re-opened on
  every folder pressed afterwards — for ever, with the only clue in the address
  bar. Two checks: the param is gone after it is honoured, and pressing a
  folder leaves nothing open.
  */
  if (await p.evaluate(() => location.search.includes("task="))) {
    bad.push("task link: the param survived being obeyed")
  }
  /* Closed first, which is the sequence a person follows: the surface is a
     panel over the page, so you shut it before pressing something behind it.
     The bug survived that, because it lived in the URL rather than in the
     surface. */
  await p.keyboard.press("Escape")
  await p.waitForTimeout(500)
  await p.locator('button[title="Home"][data-sidebar-tier="folder"]').first().click()
  await p.waitForTimeout(1000)
  const after = await p.evaluate(() => ({
    url: location.href,
    open: /Add a step|Add step/i.test(document.body.innerText),
  }))
  if (after.open) {
    bad.push("task link: a task was still open after opening a folder — " + after.url)
  }

  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
  })
}

/*
A page can hold a picture (DES-202).

Driven with a real file through the real drop handler, because everything worth
checking here is what happens to the bytes: that they are downscaled rather than
stored whole, that the ratio is recorded so the page does not jump, and that the
picture is still there after a reload — which is the whole difference between a
block and the cover's session-only upload.
*/
{
  await p.goto(B + "/?state=folder&folder=Travel")
  await p.waitForTimeout(700)
  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
  })
  await p.goto(B + "/?state=folder&folder=Travel")
  await p.waitForTimeout(800)

  await p.locator('button[aria-label="Insert here"]').first().click()
  await p.waitForTimeout(300)
  const imageItem = p.locator('[role="menuitem"]', { hasText: /^Image here$/ }).first()
  if (!(await imageItem.count())) {
    bad.push("page image: the insert menu does not offer one")
  } else {
    await imageItem.click()
    await p.waitForTimeout(500)

    const zone = await p.evaluate(() =>
      Boolean(document.querySelector('[aria-label="Add an image"]')),
    )
    if (!zone) bad.push("page image: the empty block drew no drop zone")

    /* A 2400x1200 file, dropped. */
    const dropped = await p.evaluate(async () => {
      const c = document.createElement("canvas")
      c.width = 2400
      c.height = 1200
      const g = c.getContext("2d")
      g.fillStyle = "#2b5cff"
      g.fillRect(0, 0, 2400, 1200)
      const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9))
      const file = new File([blob], "shot.jpg", { type: "image/jpeg" })
      const target = document.querySelector('[aria-label="Add an image"]')
      if (!target) return false
      const dt = new DataTransfer()
      dt.items.add(file)
      target.dispatchEvent(
        new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }),
      )
      return true
    })
    if (!dropped) bad.push("page image: nothing to drop onto")
    await p.waitForTimeout(1400)

    const shot = await p.evaluate(() => {
      const img = document.querySelector("figure img")
      const store = JSON.parse(
        localStorage.getItem("dana:prototype-page-images") || "{}",
      )
      const key = Object.keys(store)[0]
      const layout = JSON.parse(
        localStorage.getItem("dana:prototype-folder-layout") || "{}",
      ).Travel
      return {
        rendered: Boolean(img),
        width: img?.naturalWidth ?? 0,
        aspect: img ? getComputedStyle(img).aspectRatio : null,
        kb: key ? Math.round(store[key].length / 1024) : 0,
        /* The layout keeps an id and a ratio, never the bytes. */
        layoutHasBytes: JSON.stringify(layout ?? {}).includes("data:image"),
        ratio: layout?.items?.find((i) => i.kind === "image")?.image?.ratio,
      }
    })
    if (!shot.rendered) bad.push("page image: the drop produced no picture")
    if (shot.width > 1600) {
      bad.push("page image: stored at " + shot.width + "px — not downscaled")
    }
    if (!shot.kb) bad.push("page image: nothing reached the image store")
    if (shot.layoutHasBytes) {
      bad.push("page image: the bytes went into the layout store, not their own")
    }
    if (!shot.ratio || shot.aspect === "auto") {
      bad.push("page image: no aspect ratio reserved, so the page will jump")
    }

    /* And it is still there after a full load, unlike the cover's upload. */
    await p.goto(B + "/?state=folder&folder=Travel")
    await p.waitForTimeout(900)
    const survived = await p.evaluate(() =>
      Boolean(document.querySelector("figure img")),
    )
    if (!survived) bad.push("page image: the picture did not survive a reload")
  }

  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
  })
}

/*
Search finds three kinds, and each one goes somewhere (DES-203).

It found tasks by title and notes and nothing else, so a folder was unfindable
by name, a page unreachable by typing it, and the prose written on a folder page
invisible to the one control whose job is finding words. Each assertion below is
one of those.
*/
{
  const search = async (text) => {
    await p.goto(B + "/?search=open")
    await p.waitForTimeout(900)
    if (text) {
      await p.fill('input[aria-label="Search Dana"]', text)
      await p.waitForTimeout(900)
    }
    return p.evaluate(() =>
      [...document.querySelectorAll('button[id^="dana-search-result"]')].map((b) =>
        b.innerText.replace(/\s+/g, " ").trim(),
      ),
    )
  }

  /* Nothing typed offers the places: a palette that shows a blank panel until
     you have typed is one you have to know the answer to already. */
  const resting = await search("")
  if (!resting.some((row) => /^Today/.test(row))) {
    bad.push("search: an empty box offered no pages — " + resting.slice(0, 3).join(" / "))
  }

  /* A folder by name. */
  const folders = await search("reading")
  if (!folders.some((row) => /Reading list/.test(row))) {
    bad.push("search: a folder is not findable by name")
  }

  /* A folder by what is written on its page: Travel's prose says "Venue and
     catering are settled", and nothing in Travel's *name* says venue. */
  const prose = await search("catering")
  if (!prose.some((row) => /^Travel/.test(row))) {
    bad.push("search: the prose on a folder page is not searchable")
  }

  /* A task by a step title rather than its own. */
  const tasks = await search("venue")
  if (!tasks.length) bad.push("search: no task matched a word in two task titles")

  /* And a page goes to that page. */
  await p.goto(B + "/?search=open")
  await p.waitForTimeout(900)
  await p.fill('input[aria-label="Search Dana"]', "trash")
  await p.waitForTimeout(900)
  const first = p.locator('button[id^="dana-search-result"]').first()
  if (!(await first.count())) {
    bad.push("search: the Trash page is not findable")
  } else {
    await first.click()
    await p.waitForTimeout(1000)
    const landed = await p.evaluate(() => document.body.innerText)
    if (!/Anything you delete waits here|Deleted items are kept/.test(landed)) {
      bad.push("search: opening the Trash page did not go to Trash")
    }
  }

  /* A folder result navigates to that folder. */
  await p.goto(B + "/?search=open")
  await p.waitForTimeout(900)
  await p.fill('input[aria-label="Search Dana"]', "reading")
  await p.waitForTimeout(900)
  const folderRow = p
    .locator('button[id^="dana-search-result"]')
    .filter({ hasText: "Reading list" })
    .first()
  if (!(await folderRow.count())) {
    bad.push("search: no Reading list row to open")
  } else {
    await folderRow.click()
    await p.waitForTimeout(1000)
    if (!/folder=Reading/.test(await p.evaluate(() => location.href))) {
      bad.push("search: opening a folder did not go to it")
    }
  }
}

/*
A picture of you, and a theme (DES-204, DES-205).

The theme half is checked by measurement rather than by looking, which is the
only honest way to check a colourway from here: every text pair on four routes
against WCAG's 4.5:1, and every wide surface against "is this still a light
plate". A dark theme fails by leaving something behind, and both of those catch
the leaving.
*/
{
  await p.goto(B + "/?page=settings")
  await p.waitForTimeout(800)
  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
  })
  await p.goto(B + "/?page=settings")
  await p.waitForTimeout(900)

  /* The picture is the control: pressing the avatar opens the file chooser. */
  const picture = p.locator('button[aria-label="Add a picture"]').first()
  if (!(await picture.count())) {
    bad.push("viewer: the Settings avatar is not a control")
  } else {
    const PNG = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR42mP8z8BQz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC",
      "base64",
    )
    await p.setInputFiles('input[type="file"][accept="image/*"]', {
      name: "me.png",
      mimeType: "image/png",
      buffer: PNG,
    })
    await p.waitForTimeout(900)
    const seen = await p.evaluate(() => ({
      stored: Boolean(localStorage.getItem("dana:prototype-viewer")),
      /* Everywhere the viewer's face is drawn, not only where it was set. */
      images: document.querySelectorAll('img[alt=""]').length,
    }))
    if (!seen.stored) bad.push("viewer: the picture was not kept")
    if (seen.images < 2) {
      bad.push(
        "viewer: the picture reached " + seen.images +
          " place(s) — the sidebar should have it too",
      )
    }
  }

  /* Three states, not a switch. */
  const themes = await p.evaluate(() => {
    const group = [...document.querySelectorAll('[role="radiogroup"]')].find(
      (g) => g.getAttribute("aria-label") === "Theme",
    )
    return group
      ? [...group.querySelectorAll('[role="radio"]')].map((b) => b.textContent.trim())
      : null
  })
  if (!themes) bad.push("theme: no control in Settings")
  else if (themes.join(",") !== "System,Light,Dark") {
    bad.push("theme: the control offers " + themes.join(", "))
  }

  if (themes) {
    await p.locator('[role="radiogroup"][aria-label="Theme"] [role="radio"]', {
      hasText: /^Dark$/,
    }).click()
    await p.waitForTimeout(600)

    /* It survives a reload, and is applied before the first paint. */
    await p.goto(B + "/?page=settings")
    await p.waitForTimeout(800)
    if ((await p.evaluate(() => document.documentElement.getAttribute("data-theme"))) !== "dark") {
      bad.push("theme: the choice did not survive a reload")
    }

    /*
    Dark is measured **against light**, not against an absolute bar.

    The first version held dark to WCAG 4.5:1 and flagged two things that were
    not faults. The floating New task button is graphite-900 with a light
    label — a deliberate contrast plate that is near-black in light and
    near-white in dark, which is the inversion working rather than a surface
    left behind. And a row's count sits on graphite-400, a deliberately faint
    step the *light* theme draws at 2.9:1; holding dark to 4.5 there was
    holding it to a standard the design does not claim.

    So the question a dark theme actually has to answer is "did anything get
    worse", and that is what this asks: the same page, measured twice, and the
    worst pair in dark must be no worse than the worst pair in light. A surface
    that failed to follow the ramp shows up immediately, because it keeps a
    light background under text that went light with everything else.
    */
    const measure = () =>
      p.evaluate(() => {
        const lum = (c) => {
          const parts = c.match(/[0-9.]+/g)
          if (!parts || parts.length < 3) return null
          const [r, g, b] = parts.slice(0, 3).map(Number).map((v) => {
            v /= 255
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
          })
          return 0.2126 * r + 0.7152 * g + 0.0722 * b
        }
        let worst = { r: 99, s: "" }
        for (const el of document.querySelectorAll("*")) {
          if (!el.textContent || el.children.length) continue
          const box = el.getBoundingClientRect()
          if (!box.width) continue
          const cs = getComputedStyle(el)
          let bg = cs.backgroundColor
          let n = el
          while ((bg === "rgba(0, 0, 0, 0)" || bg === "transparent") && n.parentElement) {
            n = n.parentElement
            bg = getComputedStyle(n).backgroundColor
          }
          const a = lum(cs.color)
          const b = lum(bg)
          if (a === null || b === null) continue
          const r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
          if (r < worst.r) worst = { r: +r.toFixed(2), s: el.textContent.trim().slice(0, 24) }
        }
        return worst
      })

    /* A *panel* that stayed light, rather than any light thing: a button may
       legitimately be a light plate in dark mode, and often should be. */
    const panels = () =>
      p.evaluate(() =>
        [...document.querySelectorAll("*")]
          .filter((el) => {
            const parts = getComputedStyle(el).backgroundColor.match(/[0-9.]+/g)
            const box = el.getBoundingClientRect()
            return (
              parts &&
              parts.length >= 3 &&
              parts[3] !== "0" &&
              box.width > 300 &&
              box.height > 120 &&
              (+parts[0] + +parts[1] + +parts[2]) / 3 > 200
            )
          })
          .map((el) => String(el.className || el.tagName).slice(0, 50))
          .slice(0, 3),
      )

    for (const route of [
      "/?page=settings",
      "/?page=today",
      "/?state=folder&folder=Travel",
      "/?page=trash",
    ]) {
      await p.evaluate(() => localStorage.setItem("dana:prototype-theme", "light"))
      await p.goto(B + route)
      await p.waitForTimeout(900)
      const light = await measure()

      await p.evaluate(() => localStorage.setItem("dana:prototype-theme", "dark"))
      await p.goto(B + route)
      await p.waitForTimeout(900)
      const dark = await measure()
      const stale = await panels()

      if (stale.length) {
        bad.push("theme: " + route + " keeps a light panel in dark — " + stale.join(", "))
      }
      if (dark.r < light.r - 0.4) {
        bad.push(
          "theme: " + route + " reads worse in dark — " + dark.r + ":1 on \"" +
            dark.s + "\" against " + light.r + ":1 in light",
        )
      }
    }
  }

  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
    document.documentElement.removeAttribute("data-theme")
  })
}

/*
A folder out as a workflow, and back in as a folder (DES-206).

The round trip is driven whole because the interesting assertion is about what
is *absent*: a workflow is a shape, and the file leaves once it is written, so
"no dates, no assignees, no statuses, no comments" has to be checked on the
bytes rather than believed about the code.
*/
{
  await p.goto(B + "/?state=folder&folder=Travel")
  await p.waitForTimeout(700)
  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
  })
  await p.goto(B + "/?state=folder&folder=Travel")
  await p.waitForTimeout(900)

  /* Catch the download rather than letting the browser take it. */
  await p.evaluate(() => {
    const anyWindow = window
    anyWindow.__wf = null
    const real = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) {
        anyWindow.__wfName = this.download
        return fetch(this.href)
          .then((r) => r.text())
          .then((t) => {
            anyWindow.__wf = t
          })
      }
      return real.call(this)
    }
  })

  await p.click('button[aria-label="More actions for Travel"]')
  await p.waitForTimeout(350)
  const saveItem = p.locator('[role="menuitem"]', { hasText: /^Save as workflow$/ }).first()
  if (!(await saveItem.count())) {
    bad.push("workflow: the folder menu offers no Save as workflow")
  } else {
    await saveItem.click()
    await p.waitForTimeout(900)

    const file = await p.evaluate(() => {
      const anyWindow = window
      return { name: anyWindow.__wfName, text: anyWindow.__wf }
    })
    if (!file.text) {
      bad.push("workflow: nothing was written")
    } else {
      if (!/Travel.dana-workflow.json/.test(file.name || "")) {
        bad.push("workflow: saved as " + file.name + " — a file nobody can identify")
      }
      const low = file.text.toLowerCase()
      /* The list narrowed when Imran widened the file (DES-209): everything
         but people and dates travels, so a status is data and a completion
         *stamp* is still an event. */
      for (const [word, why] of [
        ["duedate", "a due date"],
        ["assignee", "an assignee"],
        ["completedat", "a completion stamp"],
        ["completedby", "who finished it"],
        ["invitepending", "an invitation"],
      ]) {
        if (low.includes(word)) {
          bad.push("workflow: the file carries " + why + " — it is a shape, not a copy")
        }
      }
      const parsed = JSON.parse(file.text)
      if (parsed.dana !== "workflow") bad.push("workflow: the file does not name itself")
      if (!parsed.tasks?.length) bad.push("workflow: no task titles travelled")
      if (!parsed.items?.some((i) => i.kind === "section")) {
        bad.push("workflow: no sections travelled")
      }

      /* And back in, through the control a person would use — a button in the
         footer since DES-209, where Imran asked for it. */
      const importItem = p.locator("[data-sidebar-import-workflow]").first()
      if (!(await importItem.count())) {
        bad.push("workflow: no button imports one")
      } else {
        await p.setInputFiles('input[accept=".json,application/json"]', {
          name: "Travel.dana-workflow.json",
          mimeType: "application/json",
          buffer: Buffer.from(file.text, "utf8"),
        })
        await p.waitForTimeout(1400)

        const landed = await p.evaluate(() => {
          const text = document.body.innerText
          const layout = JSON.parse(
            localStorage.getItem("dana:prototype-folder-layout") || "{}",
          )["Travel 2"]
          const tasks = JSON.parse(
            localStorage.getItem("dana:prototype-copied-tasks") || "[]",
          ).filter((t) => t.form.folder === "Travel 2")
          return {
            url: location.href,
            sections: ["Venue & vendors", "Invitations"].filter((h) => text.includes(h)),
            dated: /Due |Overdue/.test(text),
            /* The file carries no assignee at all; on this side the work is
               the importer's, the way a task they typed would be. */
            strangers: tasks.filter(
              (t) => t.form.assignee && t.form.assignee !== "Imran Wafa",
            ).length,
            ownerless: tasks.filter((t) => !t.form.assignee).length,
            tasks: tasks.length,
            orphans: Object.keys(layout?.assign || {}).filter(
              (id) => !tasks.some((t) => t.id === id),
            ).length,
          }
        })
        if (!/folder=Travel(%20|\+| )2/.test(landed.url)) {
          bad.push("workflow: importing did not land on the new folder — " + landed.url)
        }
        if (landed.sections.length !== 2) {
          bad.push("workflow: the imported folder lost a section")
        }
        if (!landed.tasks) bad.push("workflow: the imported folder has no tasks")
        if (landed.dated) bad.push("workflow: an imported task arrived with a date")
        if (landed.strangers) {
          bad.push("workflow: an imported task carries someone else's name")
        }
        if (landed.ownerless) {
          bad.push("workflow: an imported task belongs to nobody")
        }
        if (landed.orphans) {
          bad.push("workflow: " + landed.orphans + " section assignment(s) point nowhere")
        }
      }
    }
  }

  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
  })
}

/*
A shelf has a page (DES-207).

Option A, which Imran ruled: a personal label that gains a cover, an icon, a
description and blocks, with no link and no members. The assertions are the
three things that make it Option A rather than Option B — the folders are
*derived*, the menu offers no Copy link, and the row's two jobs are two
controls.
*/
{
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(700)
  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
  })
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(800)

  /* The name opens the page; the glyph still discloses. */
  const disclosure = p.locator('button[aria-label="Show the folders on Personal"]')
  if (!(await disclosure.count())) {
    bad.push("shelf: the row has no disclosure of its own")
  }
  const label = p
    .locator('button[data-sidebar-tier="group"]', { hasText: /^Personal$/ })
    .first()
  if (!(await label.count())) {
    bad.push("shelf: the row's name is not a control")
  } else {
    await label.click()
    await p.waitForTimeout(1000)
    const page = await p.evaluate(() => ({
      url: location.href,
      name: document.querySelector('input[aria-label="Shelf name"]')?.value,
      description: Boolean(document.querySelector('textarea[aria-label="Description"]')),
      /* Derived from the membership rather than stored: the fixture puts Home
         and Travel on Personal and nothing on this page records that. */
      folders: ["Home", "Travel"].filter((f) => document.body.innerText.includes(f)),
      /* The folder page's insert line, not a pair of Add buttons (DES-210). */
      blocks: document.querySelectorAll('button[aria-label="Insert here"]').length,
      /* No members: the page is private by construction. */
      sharing: /Share|Invite|Members/.test(document.body.innerText),
    }))
    if (!/state=shelf/.test(page.url)) {
      bad.push("shelf: the name did not open the shelf — " + page.url)
    }
    if (page.name !== "Personal") bad.push("shelf: the page is titled " + page.name)
    if (!page.description) bad.push("shelf: no description, which is where DES-195 sent the explaining")
    if (page.folders.length !== 2) {
      bad.push("shelf: the page shows " + page.folders.length + " of its 2 folders")
    }
    if (!page.blocks) bad.push("shelf: the page offers no way to add a block")
    if (page.sharing) bad.push("shelf: the page offers sharing — Option A has no members")
  }

  /* And the menu comes from the contract, without Copy link. */
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(800)
  await p.hover('button[aria-label="Manage Personal shelf"]')
  await p.waitForTimeout(200)
  await p.click('button[aria-label="Manage Personal shelf"]')
  await p.waitForTimeout(350)
  const menu = await p.evaluate(() =>
    [...document.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent.trim()),
  )
  if (!menu.length) bad.push("shelf: the row's menu did not open")
  /* Copy link belongs here (DES-210): a shelf page has an address, and an
     address is not an invitation — what Option A ruled out was sharing. What
     must stay absent is anything that implies members. */
  if (menu.some((item) => /Share|Invite|Members/.test(item))) {
    bad.push("shelf: the menu offers sharing — Option A has no members")
  }
  if (!menu.some((item) => /Copy link/.test(item))) {
    bad.push("shelf: no Copy link, though the page has an address")
  }
  if (!menu.some((item) => /^Open shelf$/.test(item))) {
    bad.push("shelf: the menu cannot open the page it now has")
  }
  if (!/Delete shelf/.test(menu.join(" ")) || /group/.test(menu.join(" "))) {
    bad.push("shelf: the menu still says group — " + menu.join(", "))
  }
}

/*
The acts a folder row raises actually happen (DES-208).

Every one of these was reported broken by Imran and every one had passed a
green sweep, because nothing here had ever *pressed* a folder row's menu. The
lesson is the one DES-157 keeps making: a check that reads the wiring is not a
check. Rename and Delete navigated to an instrument the shipped page ignored;
Open in a new tab drew nothing because no shell supplied it; and the delete,
once wired, fired an event before the listener that answers it had mounted.
*/
{
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(700)
  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
  })
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(800)

  const rowMenu = async (folder) => {
    await p.keyboard.press("Escape")
    await p.waitForTimeout(200)
    /* Hover the row, not the control: the control is inside the row's own
       button and only appears under the pointer, so hovering it directly is
       what the row intercepts. */
    await p.hover('button[title="' + folder + '"][data-sidebar-tier="folder"]')
    await p.waitForTimeout(200)
    await p.click('button[aria-label="Manage ' + folder + ' folder"]')
    await p.waitForTimeout(350)
    return p.evaluate(() =>
      [...document.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent.trim()),
    )
  }

  const items = await rowMenu("Ideas")
  if (!items.some((i) => /new tab/i.test(i))) {
    bad.push("folder row: no Open in a new tab — " + items.join(", "))
  }

  /* Rename lands you in the field rather than nowhere. */
  await p.locator('[role="menuitem"]', { hasText: /^Rename$/ }).first().click()
  await p.waitForTimeout(1200)
  const renaming = await p.evaluate(() => ({
    url: location.href,
    /* The instrument strikes itself from the URL once obeyed: a destructive or
       state-changing param that survives a reload is a trap. */
    paramGone: !location.search.includes("folder-action"),
    editing: Boolean(document.querySelector('input[aria-label^="Folder name"]')),
  }))
  if (!/folder=Ideas/.test(renaming.url)) bad.push("folder row: Rename went elsewhere")
  if (!renaming.editing) bad.push("folder row: Rename opened no field")
  if (!renaming.paramGone) bad.push("folder row: the action param survived being obeyed")

  /* Delete removes it, records it, and puts it where it can be fetched back. */
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(800)
  await rowMenu("Ideas")
  await p.locator('[role="menuitem"]', { hasText: /^Delete folder/ }).first().click()
  await p.waitForTimeout(1400)
  const deleted = await p.evaluate(() => ({
    asked: Boolean(document.querySelector('[role="alertdialog"]')),
    gone: ![...document.querySelectorAll("button")].some(
      (b) => (b.getAttribute("aria-label") || "") === "Manage Ideas folder",
    ),
    trash: JSON.parse(localStorage.getItem("dana:prototype-trash") || "[]").map(
      (t) => t.kind + ":" + t.name,
    ),
    history: JSON.parse(localStorage.getItem("dana:prototype-history") || "[]").map(
      (e) => e.verb,
    ),
  }))
  if (deleted.asked) {
    bad.push("folder delete: still asks, though Trash makes it reversible")
  }
  if (!deleted.gone) bad.push("folder delete: the folder is still in the sidebar")
  if (!deleted.trash.includes("folder:Ideas")) {
    bad.push("folder delete: nothing reached the Trash — " + deleted.trash.join(", "))
  }
  if (!deleted.history.includes("deleted")) {
    bad.push("folder delete: nothing was recorded")
  }

  /* Desk's description, and the mark's plate in dark. */
  await p.goto(B + "/?page=desk")
  await p.waitForTimeout(900)
  const desk = await p.evaluate(() =>
    [...document.querySelectorAll("textarea")].some((t) =>
      /Nothing decided about it yet/.test(t.value || ""),
    ),
  )
  if (!desk) bad.push("Desk: still the only native page without a description")

  await p.evaluate(() => localStorage.setItem("dana:prototype-theme", "dark"))
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(900)
  const mark = await p.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    const read = (name) => root.getPropertyValue(name).trim()
    const lum = (hex) => {
      const m = /^#([0-9a-f]{6})$/i.exec(hex)
      if (!m) return null
      const n = parseInt(m[1], 16)
      return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114
    }
    return { plate: lum(read("--dana-mark-plate")), page: lum(read("--color-graphite-25")) }
  })
  if (mark.plate !== null && mark.page !== null && Math.abs(mark.plate - mark.page) < 40) {
    bad.push("dark logo: the mark's plate is the same tone as the page it sits on")
  }

  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
  })
}

/*
The second review pass (DES-209, DES-210).

Everything Imran listed on 2026-08-23 after clicking through: the footer's
shape, an image that can be resized and can fold under a heading, search over
the last three sources it could not reach, a folder's own History, and the
shelf page grown into the folder page's grammar.
*/
{
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(700)
  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
  })
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(900)

  /* One primary button, then a row of three. */
  const footer = await p.evaluate(() => {
    const primary = document.querySelector("[data-sidebar-new-folder]")
    const shelf = document.querySelector("[data-sidebar-new-shelf]")
    const row = shelf?.closest("ul")
    return {
      primaryWidth: primary ? Math.round(primary.getBoundingClientRect().width) : 0,
      row: row
        ? [...row.querySelectorAll("button")].map((b) => b.textContent.trim())
        : [],
      importButton: Boolean(document.querySelector("[data-sidebar-import-workflow]")),
    }
  })
  if (footer.row.length !== 3) {
    bad.push("footer: the row has " + footer.row.length + " buttons, not three")
  }
  if (!footer.importButton) bad.push("footer: no button imports a workflow")
  if (footer.primaryWidth < 180) {
    bad.push("footer: New folder is not a single full-width button")
  }

  /* The Activity indicator is findable on a browser that has done nothing. */
  const resting = await p.evaluate(() =>
    [...document.querySelectorAll("button")]
      .map((b) => b.textContent.trim())
      .filter((t) => /(ago|just now|yesterday|[0-9]+ [A-Z][a-z]{2})$/.test(t)),
  )
  await p.goto(B + "/?state=folder&folder=Travel")
  await p.waitForTimeout(900)
  const onFolder = await p.evaluate(() =>
    [...document.querySelectorAll("button")]
      .map((b) => b.textContent.trim())
      .filter((t) => /(ago|just now|yesterday|[0-9]+ [A-Z][a-z]{2})$/.test(t)),
  )
  if (!onFolder.length) {
    bad.push("history: the Activity indicator is invisible on a fresh browser")
  }
  if (onFolder.some((t) => / [a-z]{3}$/.test(t))) {
    bad.push("history: the indicator lower-cases a month — " + onFolder.join(", "))
  }
  void resting

  /* A folder has a History act, like a task. */
  await p.click('button[aria-label="More actions for Travel"]')
  await p.waitForTimeout(350)
  const folderMenu = await p.evaluate(() =>
    [...document.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent.trim()),
  )
  if (!folderMenu.includes("History")) {
    bad.push("folder menu: no History — " + folderMenu.join(", "))
  }
  await p.keyboard.press("Escape")
  await p.waitForTimeout(250)

  /* Search reaches the three sources it could not: a section name, a message,
     and a shelf. */
  for (const [term, want] of [
    ["vendors", "a section name"],
    ["florist", "a message"],
    ["personal", "a shelf"],
  ]) {
    await p.goto(B + "/?search=open")
    await p.waitForTimeout(900)
    await p.fill('input[aria-label="Search Dana"]', term)
    await p.waitForTimeout(900)
    const rows = await p.evaluate(() =>
      [...document.querySelectorAll('button[id^="dana-search-result"]')].length,
    )
    if (!rows) bad.push("search: " + want + " is not findable (" + term + ")")
  }

  /* An image resizes, and folds under a heading with everything else. */
  await p.goto(B + "/?state=folder&folder=Travel")
  await p.waitForTimeout(900)
  await p.locator('button[aria-label="Insert here"]').first().click()
  await p.waitForTimeout(300)
  await p.locator('[role="menuitem"]', { hasText: /^Image here$/ }).first().click()
  await p.waitForTimeout(500)
  await p.evaluate(async () => {
    const c = document.createElement("canvas")
    c.width = 1200
    c.height = 600
    c.getContext("2d").fillRect(0, 0, 1200, 600)
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9))
    const dt = new DataTransfer()
    dt.items.add(new File([blob], "s.jpg", { type: "image/jpeg" }))
    document
      .querySelector('[aria-label="Add an image"]')
      .dispatchEvent(
        new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }),
      )
  })
  await p.waitForTimeout(1500)
  const handle = p.locator('button[aria-label="Resize image"]').first()
  if (!(await handle.count())) {
    bad.push("image: no way to resize it")
  } else {
    const box = await handle.boundingBox()
    const fig = await p.locator("figure").first().boundingBox()
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await p.mouse.down()
    await p.mouse.move(fig.x + fig.width * 0.5, box.y + box.height / 2, { steps: 8 })
    await p.mouse.up()
    await p.waitForTimeout(600)
    const width = await p.evaluate(() => {
      const f = document.querySelector("figure")
      return f ? parseInt(f.style.width || "100", 10) : 100
    })
    if (width >= 95) bad.push("image: the handle did not change its width")
  }

  /* And it folds with the heading above it. */
  const folded = await p.evaluate(() => {
    const key = "dana:prototype-folder-layout"
    const store = JSON.parse(localStorage.getItem(key) || "{}")
    const travel = store.Travel
    if (!travel) return null
    const sectionAt = travel.items.findIndex((i) => i.kind === "section")
    if (sectionAt < 0) return null
    travel.items.splice(sectionAt + 1, 0, {
      kind: "paragraph",
      paragraph: { id: "probe-under", text: "UNDER THE HEADING" },
    })
    localStorage.setItem(key, JSON.stringify(store))
    return true
  })
  if (folded) {
    await p.goto(B + "/?state=folder&folder=Travel")
    await p.waitForTimeout(900)
    const shows = () =>
      p.evaluate(() =>
        [...document.querySelectorAll('textarea[aria-label="Paragraph"]')].some((t) =>
          /UNDER THE HEADING/.test(t.value || ""),
        ),
      )
    if (!(await shows())) bad.push("image/prose: a block under a heading did not draw")
    await p.locator('button[aria-label^="Collapse section"]').first().click()
    await p.waitForTimeout(600)
    if (await shows()) {
      bad.push("blocks: a paragraph under a folded heading stayed on the page")
    }
  }

  /* The shelf page has the folder page's grammar and its full contract. */
  await p.goto(B + "/?state=shelf&shelf=Personal")
  await p.waitForTimeout(1000)
  const shelf = await p.evaluate(() => ({
    insertLines: document.querySelectorAll('button[aria-label="Insert here"]').length,
    folders: ["Home", "Travel"].filter((f) => document.body.innerText.includes(f)).length,
  }))
  if (!shelf.insertLines) bad.push("shelf: no insert line for its blocks")
  if (shelf.folders !== 2) bad.push("shelf: its folders are not listed")

  await p.goto(B + "/?page=today")
  await p.waitForTimeout(800)
  await p.hover('button[data-sidebar-tier="group"]:has-text("Personal")')
  await p.waitForTimeout(200)
  await p.click('button[aria-label="Manage Personal shelf"]')
  await p.waitForTimeout(400)
  const shelfMenu = await p.evaluate(() =>
    [...document.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent.trim()),
  )
  for (const act of ["History", "Copy link", "Duplicate", "Save as workflow"]) {
    if (!shelfMenu.includes(act)) {
      bad.push("shelf menu: no " + act + " — " + shelfMenu.join(", "))
    }
  }

  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
  })
}

/*
The page keeps room for an open panel (DES-212), and the acts nothing had
pressed yet.

The right-edge check lives here rather than in a hand check because a
transitioned property cannot be measured in a hidden document: the transition
never ticks, so the computed value stays pinned at where it started. Every
measurement I took of this by hand read 0 and was wrong for that reason.
*/
{
  await p.goto(B + "/?state=folder&folder=Travel")
  await p.waitForTimeout(1200)

  await p.evaluate(() => {
    const strip = [...document.querySelectorAll('[role="radiogroup"]')].find(
      (g) => g.getAttribute("aria-label") === "Where the conversation lives",
    )
    const panel = [...(strip?.querySelectorAll('[role="radio"]') ?? [])].find((r) =>
      /Side panel/i.test(r.getAttribute("aria-label") || ""),
    )
    panel?.click()
  })
  await p.waitForTimeout(1200)

  const edge = await p.evaluate(() => {
    const n = document.querySelector("[data-shell-scroll]")
    return {
      open: Boolean(document.querySelector('aside[aria-label^="Conversation in"]')),
      pad: parseInt(getComputedStyle(n).paddingRight, 10),
    }
  })
  if (!edge.open) bad.push("right edge: the conversation panel did not open")
  else if (edge.pad < 300) {
    bad.push("right edge: the page kept " + edge.pad + "px clear for a 360px panel")
  }

  /* Importing a workflow, through the footer button. */
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(900)
  const file = JSON.stringify({
    dana: "workflow",
    version: 1,
    name: "Imported",
    items: [{ kind: "section", section: { id: "s1", name: "First" } }],
    tasks: [{ title: "A task from a file", section: "s1", notes: "kept" }],
  })
  await p.setInputFiles('input[accept=".json,application/json"]', {
    name: "x.dana-workflow.json",
    mimeType: "application/json",
    buffer: Buffer.from(file, "utf8"),
  })
  /*
  Waited for rather than slept through.

  This block failed once in three runs on a fixed 1500ms — the import navigates
  to a new folder, and a page that is still mounting has neither its section nor
  its task in `innerText` yet. A flaky check is worse than no check: it cries
  wolf, and a suite that cries wolf is one whose failures get waved through.
  */
  await p
    .locator('body:has-text("A task from a file")')
    .waitFor({ timeout: 8000 })
    .catch(() => {})
  const imported = await p.evaluate(() => ({
    url: location.href,
    text: document.body.innerText,
  }))
  if (!/folder=Imported/.test(imported.url)) {
    bad.push("import: the button did not make a folder — " + imported.url)
  }
  if (!imported.text.includes("A task from a file")) {
    bad.push("import: the file's task did not arrive")
  }
  if (!imported.text.includes("First")) bad.push("import: the file's section did not arrive")

  /* A shelf duplicates: the label and its page, no folders. */
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(900)
  await p.hover('button[data-sidebar-tier="group"]:has-text("Personal")')
  await p.waitForTimeout(200)
  await p.click('button[aria-label="Manage Personal shelf"]')
  await p.waitForTimeout(400)
  const dup = p.locator('[role="menuitem"]', { hasText: /^Duplicate$/ }).first()
  if (!(await dup.count())) bad.push("shelf: nothing duplicates it")
  else {
    await dup.click()
    await p.waitForTimeout(1500)
    const made = await p.evaluate(() => ({
      url: location.href,
      folders: ["Home", "Travel"].filter((f) => document.body.innerText.includes(f)).length,
    }))
    if (!/shelf=Personal(%20|\+| )copy/.test(made.url)) {
      bad.push("shelf duplicate: did not land on the copy — " + made.url)
    }
  }

  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
  })
}

/*
Imran's third review pass (DES-216).

Six reports, and the pattern in them is one thing: every fault was in a place
nothing had ever pressed. The folder's History act had a handler and no sheet.
The shelf page had a measure of its own and no control row. A shelf file could
be written and not read. Each is a surface that was reasoned about and never
operated, so each gets an operation here.
*/
{
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(800)
  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
  })
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(900)

  /* The three footer buttons keep their line and drop their labels as the
     sidebar narrows — driven with the real resize handle, because the whole
     behaviour is a response to width. */
  const handle = p.locator('[aria-label*="idebar width"], [role="separator"]').first()
  const rowShape = () =>
    p.evaluate(() => {
      const row = document.querySelector("[data-sidebar-new-shelf]")?.closest("ul")
      if (!row) return null
      const btns = [...row.querySelectorAll("button")]
      const y = btns.map((b) => Math.round(b.getBoundingClientRect().y))
      return {
        inARow: y.every((v) => v === y[0]),
        labels: btns
          .flatMap((b) => [...b.querySelectorAll("span")])
          .filter((n) => n.offsetParent !== null)
          .map((n) => n.textContent.trim())
          .filter(Boolean).length,
        width: Math.round(row.getBoundingClientRect().width),
      }
    })
  /* The rule since the fourth pass (Imran, 2026-08-24): the three words need
     more room than the default row has, so New shelf keeps its word at every
     width — it was the one clipping — while Import and Trash go to their
     icons until the row genuinely fits all three. */
  const atDefault = await rowShape()
  if (!atDefault) bad.push("footer: no button row")
  else {
    if (!atDefault.inARow) bad.push("footer: the three buttons are not on one line")
    if (atDefault.labels !== 1) {
      bad.push(
        "footer: " +
          atDefault.labels +
          " labels at the default width — New shelf alone keeps its word there",
      )
    }
  }
  if (await handle.count()) {
    const box = await handle.boundingBox()
    if (box) {
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await p.mouse.down()
      await p.mouse.move(box.x + 200, box.y + box.height / 2, { steps: 10 })
      await p.mouse.up()
      await p.waitForTimeout(700)
      const wide = await rowShape()
      if (wide) {
        if (!wide.inARow) bad.push("footer: the buttons stacked at full width")
        if (wide.labels !== 3) {
          bad.push("footer: " + wide.labels + " of 3 labels showing at full width")
        }
      }
      const wideBox = await handle.boundingBox()
      await p.mouse.move(wideBox.x + wideBox.width / 2, wideBox.y + wideBox.height / 2)
      await p.mouse.down()
      await p.mouse.move(wideBox.x - 300, wideBox.y + wideBox.height / 2, { steps: 10 })
      await p.mouse.up()
      await p.waitForTimeout(700)
      const narrow = await rowShape()
      if (narrow) {
        if (!narrow.inARow) {
          bad.push("footer: the buttons stacked when the sidebar narrowed")
        }
        if (narrow.labels > 1) {
          bad.push(
            "footer: " + narrow.labels + " labels still showing at " + narrow.width + "px",
          )
        }
      }
      /* And back to the default, so nothing after this block inherits a
         dragged width. */
      const narrowBox = await handle.boundingBox()
      await p.mouse.move(
        narrowBox.x + narrowBox.width / 2,
        narrowBox.y + narrowBox.height / 2,
      )
      await p.mouse.down()
      await p.mouse.move(narrowBox.x + 32, narrowBox.y + narrowBox.height / 2, {
        steps: 6,
      })
      await p.mouse.up()
      await p.waitForTimeout(400)
    }
  }

  /* Deleting a folder offers the bar DES-200 claimed it had — raised from the
     row, which is where a person raises it, and which no longer travels to the
     folder's page to do the work (DES-216). */
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(900)
  await p.hover('button[title="Ideas"][data-sidebar-tier="folder"]')
  await p.waitForTimeout(200)
  await p.click('button[aria-label="Manage Ideas folder"]')
  await p.waitForTimeout(400)
  await p.locator('[role="menuitem"]', { hasText: /^Delete folder/ }).first().click()
  await p.waitForTimeout(1000)
  const undo = await p.evaluate(() =>
    [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Undo"),
  )
  if (!undo) bad.push("folder delete: no Undo in the bar, though DES-200 assumed one")

  /* Restoring brings back one folder, not two. */
  await p.goto(B + "/?page=trash")
  await p.waitForTimeout(900)
  const restore = p.locator("button", { hasText: /^Restore$/ }).first()
  if (!(await restore.count())) bad.push("trash: nothing to restore after a folder delete")
  else {
    await restore.click()
    await p.waitForTimeout(1200)
    const rows = await p.evaluate(
      () =>
        [...document.querySelectorAll("button")]
          .map((b) => b.getAttribute("title"))
          .filter((t) => t === "Ideas").length,
    )
    if (rows !== 1) bad.push("restore: the folder came back as " + rows + " rows")
  }

  /* History opens where it is offered — folder and shelf. */
  for (const [route, trigger, subject] of [
    ["/?state=folder&folder=Travel", 'button[aria-label="More actions for Travel"]', "Travel"],
    ["/?state=shelf&shelf=Personal", 'button[aria-label="More actions for Personal"]', "Personal"],
  ]) {
    await p.goto(B + route)
    await p.waitForTimeout(1000)
    await p.click(trigger)
    await p.waitForTimeout(400)
    const item = p.locator('[role="menuitem"]', { hasText: /^History$/ }).first()
    if (!(await item.count())) {
      bad.push("history: " + subject + " offers no History")
      continue
    }
    await item.click()
    await p.waitForTimeout(700)
    const sheet = await p.evaluate(() => {
      const d = document.querySelector('[role="dialog"]')
      return d ? d.innerText.replace(/\s+/g, " ") : null
    })
    if (!sheet) bad.push("history: " + subject + "'s sheet did not open")
    else if (!/Created/.test(sheet)) {
      bad.push("history: " + subject + " has no line at all — " + sheet)
    }
    await p.keyboard.press("Escape")
    await p.waitForTimeout(300)
  }

  /* The shelf page has the folder page's measure and a control row. */
  await p.goto(B + "/?state=shelf&shelf=Personal")
  await p.waitForTimeout(1000)
  const shelfPage = await p.evaluate(() => {
    const body = document.querySelector('[class*="--shell-content-max"]')
    return {
      measured: Boolean(body),
      pad: body ? getComputedStyle(body).paddingLeft : null,
      overflow: Boolean(
        document.querySelector('button[aria-label="More actions for Personal"]'),
      ),
    }
  })
  if (!shelfPage.measured) bad.push("shelf page: not on the shared page measure")
  if (!shelfPage.overflow) bad.push("shelf page: no control row overflow")

  /* A shelf round-trips: written and read. */
  const shelfFile = JSON.stringify({
    dana: "shelf-workflow",
    version: 1,
    name: "Imported shelf",
    items: [{ kind: "paragraph", paragraph: { id: "x", text: "from a file" } }],
    folders: ["Travel", "A folder from the file"],
  })
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(900)
  await p.setInputFiles('input[accept=".json,application/json"]', {
    name: "s.dana-shelf.json",
    mimeType: "application/json",
    buffer: Buffer.from(shelfFile, "utf8"),
  })
  await p
    .locator('body:has-text("Imported shelf")')
    .waitFor({ timeout: 8000 })
    .catch(() => {})
  const landedShelf = await p.evaluate(() => ({
    url: location.href,
    text: document.body.innerText,
  }))
  if (!/state=shelf/.test(landedShelf.url)) {
    bad.push("shelf import: did not open the shelf — " + landedShelf.url)
  }
  if (!landedShelf.text.includes("A folder from the file")) {
    bad.push("shelf import: a folder named in the file was not made")
  }
  if (!landedShelf.text.includes("Travel")) {
    bad.push("shelf import: a folder that already existed was not joined")
  }

  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
  })
}

/*
The fourth review pass (DES-217 to DES-219).

The strip became a real tab strip, a shelf renames, and the shelf page grew
the folder page's grammar. Every check here is an operation rather than a
reading, because every fault in this batch was invisible at rest: the strip's
special first tab looked like a tab, and the rename's wiring read as fine
while renaming nothing.
*/
{
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(700)
  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
    sessionStorage.clear()
  })

  /* A fresh visit: one tab, closable, the "+" beside it. */
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(800)
  const strip = await p.evaluate(() => ({
    tabs: [...document.querySelectorAll('header button[aria-label^="Close tab"]')].map(
      (el) => el.getAttribute("aria-label"),
    ),
    plus: Boolean(document.querySelector('button[aria-label="New tab"]')),
  }))
  if (strip.tabs.join("|") !== "Close tab: Today") {
    bad.push("tabs: a fresh visit should hold one closable Today tab — " + strip.tabs.join(", "))
  }
  if (!strip.plus) bad.push("tabs: no + at the end of the strip")

  /* A folder opens as a SECOND tab: beside Today, active, landed on. This is
     the fault Imran named — it used to retarget the first tab. */
  await p.hover('button[title="Ideas"][data-sidebar-tier="folder"]')
  await p.waitForTimeout(200)
  await p.click('button[aria-label="Manage Ideas folder"]')
  await p.waitForTimeout(350)
  await p.locator('[role="menuitem"]', { hasText: /new tab/i }).first().click()
  await p.waitForTimeout(1100)
  const opened = await p.evaluate(() => ({
    url: location.href,
    tabs: [...document.querySelectorAll('header button[aria-label^="Close tab"]')].map(
      (el) => el.getAttribute("aria-label"),
    ),
    active: [...document.querySelectorAll('header [aria-current="page"]')].map((el) =>
      el.textContent.trim(),
    ),
  }))
  if (!/folder=Ideas/.test(opened.url)) {
    bad.push("tabs: Open in a new tab did not land on the folder — " + opened.url)
  }
  if (opened.tabs.join("|") !== "Close tab: Today|Close tab: Ideas") {
    bad.push("tabs: a folder opened as a tab should sit beside Today — " + opened.tabs.join(", "))
  }
  if (opened.active.join() !== "Ideas") {
    bad.push("tabs: the opened folder is not the active tab — " + opened.active.join(", "))
  }

  /* Tabs reorder on a driven pointer. */
  const ideasTab = await p
    .locator('header button[aria-label="Close tab: Ideas"]')
    .locator("..")
    .boundingBox()
  const todayTab = await p
    .locator('header button[aria-label="Close tab: Today"]')
    .locator("..")
    .boundingBox()
  await p.mouse.move(ideasTab.x + ideasTab.width / 2, ideasTab.y + ideasTab.height / 2)
  await p.mouse.down()
  await p.mouse.move(todayTab.x + 8, ideasTab.y + ideasTab.height / 2, { steps: 10 })
  await p.mouse.up()
  await p.waitForTimeout(400)
  const reordered = await p.evaluate(() =>
    JSON.parse(sessionStorage.getItem("dana:tabs") || "[]"),
  )
  if (reordered.join("|") !== "folder:Ideas|page:Today") {
    bad.push("tabs: dragging did not reorder the strip — " + reordered.join(", "))
  }

  /* Closing the active tab lands on the neighbouring place; closing the last
     lands on Desk. */
  await p.click('header button[aria-label="Close tab: Ideas"]')
  await p.waitForTimeout(1100)
  const afterClose = await p.evaluate(() => location.href)
  if (!/page=today/.test(afterClose)) {
    bad.push("tabs: closing the active tab should land on its neighbour — " + afterClose)
  }
  await p.click('header button[aria-label="Close tab: Today"]')
  await p.waitForTimeout(1100)
  const emptied = await p.evaluate(() => ({
    search: location.search,
    tabs: [...document.querySelectorAll('header button[aria-label^="Close tab"]')].map(
      (el) => el.getAttribute("aria-label"),
    ),
  }))
  if (emptied.tabs.join() !== "Close tab: Desk" || emptied.search !== "") {
    bad.push(
      "tabs: an emptied strip should land on Desk — " +
        emptied.tabs.join(", ") +
        " at " +
        (emptied.search || "/"),
    )
  }

  /* The "+" opens an existing page as a tab — a shelf, here. */
  await p.click('button[aria-label="New tab"]')
  await p.waitForTimeout(350)
  await p.locator('[role="menuitem"]', { hasText: /^Work$/ }).first().click()
  await p.waitForTimeout(1100)
  const plusOpened = await p.evaluate(() => ({
    url: location.href,
    tabs: [...document.querySelectorAll('header button[aria-label^="Close tab"]')].map(
      (el) => el.getAttribute("aria-label"),
    ),
  }))
  if (!/state=shelf&shelf=Work/.test(plusOpened.url)) {
    bad.push("tabs: + did not open the shelf — " + plusOpened.url)
  }
  if (plusOpened.tabs.join("|") !== "Close tab: Desk|Close tab: Work") {
    bad.push("tabs: + should append a tab beside Desk — " + plusOpened.tabs.join(", "))
  }

  /* The shelf's control row lives in the window bar, not the page (DES-219). */
  const shelfChrome = await p.evaluate(() => {
    const control = document.querySelector('button[aria-label="More actions for Work"]')
    return {
      present: Boolean(control),
      inChrome: control ? !control.closest("[data-shell-scroll]") : false,
    }
  })
  if (!shelfChrome.present) bad.push("shelf: no overflow control")
  else if (!shelfChrome.inChrome) {
    bad.push("shelf: the control row is inside the page rather than the window bar")
  }

  /* The add-folder row adds one, live, and never offers Desk. */
  const addRow = p.locator("button", { hasText: /^Add folder$/ }).first()
  if (!(await addRow.count())) bad.push("shelf: no add-folder row")
  else {
    await addRow.click()
    await p.waitForTimeout(350)
    const offered = await p.evaluate(() =>
      [...document.querySelectorAll('[role="menuitem"]')].map((el) => el.textContent.trim()),
    )
    if (offered.includes("Desk")) {
      bad.push("shelf add row: offers Desk, which is native and stays off shelves")
    }
    await p.locator('[role="menuitem"]', { hasText: /^Ideas$/ }).first().click()
    await p.waitForTimeout(700)
    const joined = await p.evaluate(() => ({
      rows: [...document.querySelectorAll('button[aria-label^="Reorder folder"]')].map((el) =>
        el.getAttribute("aria-label"),
      ),
      label: JSON.parse(localStorage.getItem("dana:prototype-folder-memberships") || "{}")
        .Ideas?.label,
    }))
    if (!joined.rows.includes("Reorder folder Ideas")) {
      bad.push("shelf add row: the added folder did not join the page — " + joined.rows.join(", "))
    }
    if (joined.label !== "Work") {
      bad.push("shelf add row: the membership did not move — " + joined.label)
    }
  }

  /* A folder pressed on a shelf opens as its own tab and lands you there,
     with the shelf tab kept beside it. */
  await p.locator('[data-shell-scroll] button.min-h-11', { hasText: "Ideas" }).first().click()
  await p.waitForTimeout(1100)
  const landed = await p.evaluate(() => ({
    url: location.href,
    tabs: [...document.querySelectorAll('header button[aria-label^="Close tab"]')].map(
      (el) => el.getAttribute("aria-label"),
    ),
    active: [...document.querySelectorAll('header [aria-current="page"]')].map((el) =>
      el.textContent.trim(),
    ),
  }))
  if (!/folder=Ideas/.test(landed.url)) {
    bad.push("shelf: pressing a folder row did not land on it — " + landed.url)
  }
  if (!landed.tabs.includes("Close tab: Work")) {
    bad.push("shelf: opening a folder closed the shelf tab — " + landed.tabs.join(", "))
  }
  if (landed.active.join() !== "Ideas") {
    bad.push("shelf: the opened folder is not the active tab — " + landed.active.join(", "))
  }

  /* Renaming a shelf works (DES-218): the label moves, the page follows, the
     sidebar agrees, and the act is recorded. */
  await p.goto(B + "/?state=shelf&shelf=Work")
  await p.waitForTimeout(900)
  await p.fill('input[aria-label="Shelf name"]', "Studio")
  await p.locator('input[aria-label="Shelf name"]').blur()
  await p.waitForTimeout(1400)
  const renamed = await p.evaluate(() => ({
    url: location.href,
    name: document.querySelector('input[aria-label="Shelf name"]')?.value,
    sidebar: [...document.querySelectorAll('button[data-sidebar-tier="group"]')]
      .map((el) => el.textContent.trim())
      .filter(Boolean),
    labels: Object.values(
      JSON.parse(localStorage.getItem("dana:prototype-folder-memberships") || "{}"),
    ).map((membership) => membership.label),
    recorded: JSON.parse(localStorage.getItem("dana:prototype-history") || "[]").some(
      (event) => event.kind === "shelf" && event.verb === "renamed",
    ),
  }))
  if (!/shelf=Studio/.test(renamed.url)) {
    bad.push("shelf rename: the page did not follow the name — " + renamed.url)
  }
  if (renamed.name !== "Studio") bad.push("shelf rename: the page is titled " + renamed.name)
  if (!renamed.sidebar.includes("Studio") || renamed.sidebar.includes("Work")) {
    bad.push("shelf rename: the sidebar still says " + renamed.sidebar.join(", "))
  }
  if (!renamed.labels.includes("Studio")) {
    bad.push("shelf rename: the members did not move — " + renamed.labels.join(", "))
  }
  if (!renamed.recorded) bad.push("shelf rename: nothing was recorded")

  /* The footer's New shelf label is whole at the default width, and the
     folder block is labelled Library. */
  const footerShelf = await p.evaluate(() => {
    const span = document.querySelector("[data-sidebar-new-shelf] span")
    return span
      ? { clipped: span.scrollWidth > span.clientWidth + 1, text: span.textContent.trim() }
      : null
  })
  if (!footerShelf) bad.push("footer: no New shelf label")
  else if (footerShelf.clipped) {
    bad.push("footer: the New shelf label is clipped at the default width")
  }
  const libraryLabel = await p.evaluate(() =>
    [...document.querySelectorAll('[data-sidebar-tier="section"]')].some((el) =>
      /Library/.test(el.textContent),
    ),
  )
  if (!libraryLabel) bad.push("sidebar: the folder block is not labelled Library")

  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
    sessionStorage.clear()
  })
}

/*
The role axis (DES-225): a folder shared WITH you offers Leave, never
Rename or Delete; your own offers the reverse. Driven, not read — the whole
fault existed because every fixture folder was the viewer's own and no check
ever asked a member's menu what it held. Leave confirms (the way back is an
invitation, not a Trash row), removes the folder from the sidebar, records
"Left", and writes nothing to the Trash.
*/
{
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(700)
  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
    sessionStorage.clear()
  })
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(800)

  const rowMenuItems = async (folder) => {
    await p.keyboard.press("Escape")
    await p.waitForTimeout(200)
    await p.hover('button[title="' + folder + '"][data-sidebar-tier="folder"]')
    await p.waitForTimeout(200)
    await p.click('button[aria-label="Manage ' + folder + ' folder"]')
    await p.waitForTimeout(350)
    return p.evaluate(() =>
      [...document.querySelectorAll('[role="menuitem"]')].map((el) =>
        el.textContent.trim(),
      ),
    )
  }

  const foreign = await rowMenuItems("Office")
  if (!foreign.some((item) => /^Leave folder/.test(item))) {
    bad.push("roles: a folder shared with you offers no Leave — " + foreign.join(", "))
  }
  if (foreign.some((item) => /^Rename$|^Delete folder/.test(item))) {
    bad.push("roles: a member is offered the owner's acts — " + foreign.join(", "))
  }
  const owned = await rowMenuItems("Ideas")
  if (owned.some((item) => /^Leave folder/.test(item))) {
    bad.push("roles: your own folder offers Leave — " + owned.join(", "))
  }
  if (!owned.some((item) => /^Delete folder/.test(item))) {
    bad.push("roles: your own folder lost Delete — " + owned.join(", "))
  }

  /* Leaving, driven through the confirm. */
  await p.keyboard.press("Escape")
  await p.waitForTimeout(200)
  await p.hover('button[title="Office"][data-sidebar-tier="folder"]')
  await p.waitForTimeout(200)
  await p.click('button[aria-label="Manage Office folder"]')
  await p.waitForTimeout(300)
  await p.locator('[role="menuitem"]', { hasText: /^Leave folder/ }).first().click()
  await p.waitForTimeout(400)
  const asked = await p.evaluate(() =>
    Boolean(document.querySelector('[role="alertdialog"]')),
  )
  if (!asked) bad.push("roles: leaving did not confirm")
  await p.locator('button', { hasText: /^Leave folder$/ }).last().click()
  await p.waitForTimeout(700)
  const left = await p.evaluate(() => ({
    gone: !document.querySelector('button[title="Office"][data-sidebar-tier="folder"]'),
    trash: JSON.parse(localStorage.getItem("dana:prototype-trash") || "[]").map(
      (item) => item.kind + ":" + item.name,
    ),
    verb: JSON.parse(localStorage.getItem("dana:prototype-history") || "[]").some(
      (event) => event.verb === "left" && event.subject === "Office",
    ),
  }))
  if (!left.gone) bad.push("roles: the folder is still in the sidebar after leaving")
  if (left.trash.includes("folder:Office")) {
    bad.push("roles: leaving wrote a Trash row — a return nobody can grant themselves")
  }
  if (!left.verb) bad.push("roles: leaving recorded no 'Left' line")

  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
    sessionStorage.clear()
  })
}

/*
The bell (DES-226): notifications drawn for RFC 0005's 9.12. Driven, because
its whole contract is operations — the badge says the unread count, a row
goes to its thing and reads itself, mark-all zeroes the badge — and none of
that is visible to a page at rest.
*/
{
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(700)
  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
    sessionStorage.clear()
  })
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(800)

  const bell = p.locator('button[aria-label^="Notifications"]')
  if (!(await bell.count())) bad.push("bell: no notifications control in the header")
  else {
    const label = await bell.getAttribute("aria-label")
    if (label !== "Notifications, 2 unread") {
      bad.push("bell: the badge does not say the unread count — " + label)
    }
    await bell.click()
    await p.waitForTimeout(400)
    const list = await p.evaluate(() => ({
      rows: [...document.querySelectorAll('[data-slot="popover-content"] button')]
        .map((el) => el.textContent.trim())
        .filter((t) => /assigned|replied|liked|shared|completed/.test(t)).length,
      markAll: [...document.querySelectorAll("button")].some(
        (el) => el.textContent.trim() === "Mark all read",
      ),
    }))
    if (list.rows !== 5) bad.push("bell: " + list.rows + " of 5 rows drawn")
    if (!list.markAll) bad.push("bell: no Mark all read while unread exist")

    /* A row is a pointer: pressing it reads itself and goes to the thing. */
    await p.locator('[data-slot="popover-content"] button', { hasText: "venue deposit" })
      .first()
      .click()
    await p.waitForTimeout(1300)
    /* Not the URL: `?task=` strikes itself out the moment the surface obeys
       it (DES-211), so the proof is the opened surface, not the address. */
    const landed = await p.evaluate(() => ({
      /* The surface's one stable marker in both presentations is its close
         control; the dialog and the panel each render one. */
      surface: Boolean(document.querySelector('button[aria-label="Close task"]')),
      title: document.body.innerText.includes("Send the venue deposit"),
    }))
    if (!landed.surface || !landed.title) {
      bad.push(
        "bell: the assignment row did not open its task — surface " +
          landed.surface + ", title " + landed.title,
      )
    }
    const after = await p
      .locator('button[aria-label^="Notifications"]')
      .getAttribute("aria-label")
    if (after !== "Notifications, 1 unread") {
      bad.push("bell: pressing a row did not read it — " + after)
    }
    await p.keyboard.press("Escape")
    await p.waitForTimeout(300)
    await p.locator('button[aria-label^="Notifications"]').click()
    await p.waitForTimeout(300)
    await p.locator("button", { hasText: /^Mark all read$/ }).first().click()
    await p.waitForTimeout(300)
    const zero = await p
      .locator('button[aria-label^="Notifications"]')
      .getAttribute("aria-label")
    if (zero !== "Notifications") {
      bad.push("bell: mark-all did not zero the badge — " + zero)
    }
  }
  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
    sessionStorage.clear()
  })
}

/*
The stress pass (review V8), as a block rather than a memory.

The invariant checks above all run against the fixtures, which are polite:
short names, few folders, four steps. These are the extremes the review named
— a 360px sidebar with a folder name that will not stop, a 100-character
title, a 50-step task, 20 folders in one group — built through the same
stores the app reads, so the pass is repeatable instead of a thing somebody
once looked at.
*/
{
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(600)
  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
    sessionStorage.clear()
    const LONG =
      "Confirm the extended venue contingency arrangements with the caterer, the florist and both transport vendors before Friday"
    const steps = Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      title: "Step " + (i + 1) + " of the long checklist",
      done: i < 12,
    }))
    localStorage.setItem(
      "dana:prototype-copied-tasks",
      JSON.stringify([
        {
          id: "task-stress",
          title: LONG,
          myDayGroup: "today",
          steps: { complete: 12, total: 50 },
          folder: { name: "Travel", color: "var(--color-graphite-900)" },
          form: {
            id: "task-stress", title: LONG, dueDate: "", important: false,
            notes: "", folder: "Travel", assignee: "Imran Wafa", dueTime: "",
            reminder: "none", repeat: "none", repeatDays: ["Mo"],
            repeatInterval: "2", repeatMonthlyDay: "10", repeatEnds: "",
            invitePending: "", createdAt: "2026-08-04T09:14:00-06:00",
            createdBy: "Imran Wafa", steps,
          },
        },
      ]),
    )
    localStorage.setItem(
      "dana:prototype-folder-presentation",
      JSON.stringify({
        names: {
          Ideas:
            "A very long folder name that keeps going and refuses to stop anywhere sensible",
        },
        deleted: [],
        identity: {},
      }),
    )
    const twenty = Array.from({ length: 20 }, (_, i) => ({
      name: "Stress folder " + (i + 1),
      pending: 0,
      color: "var(--color-graphite-900)",
    }))
    localStorage.setItem("dana:prototype-created-folders", JSON.stringify(twenty))
    localStorage.setItem(
      "dana:prototype-folder-memberships",
      JSON.stringify(
        Object.fromEntries(
          twenty.map((f) => [f.name, { label: "Work", color: "var(--color-graphite-900)" }]),
        ),
      ),
    )
    localStorage.setItem("dana:desktop-sidebar-width", "360")
  })
  const stressPages = [
    "/?page=today",
    "/?page=today&task=task-stress&open=tab",
    "/?state=folder&folder=Ideas",
    "/?page=all",
  ]
  for (const route of stressPages) {
    await p.goto(B + route)
    await p.waitForTimeout(900)
    const shape = await p.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      text: document.body.innerText.trim().length > 40,
    }))
    if (shape.overflow) bad.push("stress: horizontal overflow at " + route)
    if (!shape.text) bad.push("stress: nothing rendered at " + route)
  }
  await p.goto(B + "/?page=today")
  await p.waitForTimeout(900)
  const stressChecks = await p.evaluate(() => {
    const row = [...document.querySelectorAll("button, [role='button']")].find(
      (el) => /extended venue contingency/.test(el.textContent || ""),
    )
    const sidebarRows = [...document.querySelectorAll('[data-sidebar-tier="folder"]')]
    const longRow = sidebarRows.find((el) => /refuses to stop/.test(el.textContent || ""))
    return {
      rowFound: Boolean(row),
      stressFolders: sidebarRows.filter((el) => /Stress folder/.test(el.textContent || ""))
        .length,
      /* scrollWidth, not the bounding box: a row whose text refuses to
         truncate keeps its clamped box and paints the words straight past
         it, so measuring the box passed while the fault was on screen —
         this check was watched to MISS its probe once, which is DES-157's
         BLIND state, and this is the correction. */
      longRowFits: longRow ? longRow.scrollWidth <= longRow.clientWidth + 1 : null,
      stepCount: /12\/50/.test(document.body.innerText),
    }
  })
  if (!stressChecks.rowFound) bad.push("stress: the 100-character task is not on Today")
  if (stressChecks.longRowFits === null) {
    /* A missing row must not read as a passing one — the first draft of this
       check returned null for absent and asserted nothing, which is the
       silent-pass shape DES-157 exists to kill. */
    bad.push("stress: the long-named folder is not in the sidebar at all")
  }
  if (stressChecks.stressFolders !== 20) {
    bad.push("stress: " + stressChecks.stressFolders + " of 20 folders in the group")
  }
  if (stressChecks.longRowFits === false) {
    bad.push("stress: the long folder name grows its sidebar row")
  }
  if (!stressChecks.stepCount) bad.push("stress: the 50-step count is not on the row")
  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("dana:")) localStorage.removeItem(k)
    }
    sessionStorage.clear()
  })
}

console.log("ROUTES:", routes.length)
console.log("PROBLEMS:", bad.length ? bad.join("\n") : "none")
console.log("CONSOLE:", errs.length ? errs.join("\n") : "none")
await b.close()
