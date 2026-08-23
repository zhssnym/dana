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
const B = "http://127.0.0.1:5240"
const routes = [
  "/", "/?page=today", "/?page=scheduled", "/?page=scheduled&mode=calendar",
  "/?page=assignments", "/?page=important", "/?page=all", "/?page=done",
  "/?state=folder&folder=Travel", "/?state=folder&folder=Home",
  "/?page=people", "/?page=settings", "/?view=states", "/?search=open",
  "/?state=empty", "/?state=offline", "/?view=landing", "/?view=form&form=expanded",
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
      granted: tasks.filter((t) => t.assignee || t.form.assignee).length,
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
  if (copy.granted) bad.push("duplicate: " + copy.granted + " copied task(s) still assigned")
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
  if (afterComplete.length !== 1) {
    bad.push(
      "history: completing one task wrote " + afterComplete.length +
        " lines (" + afterComplete.map((e) => e.verb).join(", ") + ")",
    )
  }
  if (afterComplete[0] && afterComplete[0].verb !== "completed") {
    bad.push("history: completing recorded '" + afterComplete[0].verb + "'")
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

  /* And a task's own footer, which is the third reader and the one Imran
     asked for: "for individual task we have a row at the footer of each task
     view". It shows that task's past, not the folder's. */
  /* A row opens where there is no control: the title is a button and starts an
     inline rename, so the gesture has to land on the row's own space. That is
     the row's rule, not a quirk of this test — see the guard in task-row. */
  const row = p
    .locator('[class*="group/row"]', { hasText: "Review the guest transport plan" })
    .first()
  const box = await row.boundingBox()
  await p.mouse.click(box.x + box.width - 90, box.y + box.height / 2)
  await p.waitForTimeout(900)
  const opened = await p.evaluate(() => /Add a step|Add step/i.test(document.body.innerText))
  if (!opened) {
    bad.push("history: could not open a task to check its footer")
  } else {
    const footer = await p.evaluate(() =>
      [...document.querySelectorAll("button")]
        .map((b) => b.textContent.trim())
        .filter((t) => /(just now|ago|Yesterday)$/i.test(t)),
    )
    /* Nothing has happened to this task, so its footer says nothing — a
       control that opened onto an empty list would be the old fiction with
       real plumbing behind it. */
    if (footer.length) {
      bad.push("history: an untouched task claimed a past: " + footer.join(", "))
    }
    await p.locator('[role="checkbox"][aria-label^="Complete "]').first().click()
    await p.waitForTimeout(700)
    const after = await p.evaluate(() =>
      [...document.querySelectorAll("button")]
        .map((b) => b.textContent.trim())
        .filter((t) => /(just now|ago|Yesterday)$/i.test(t)),
    )
    if (!after.some((t) => /^Completed/.test(t))) {
      bad.push("history: the task footer did not pick up its own act: " + after.join(", "))
    }
  }

  await p.evaluate(() => localStorage.removeItem("dana:prototype-history"))
}

console.log("ROUTES:", routes.length)
console.log("PROBLEMS:", bad.length ? bad.join("\n") : "none")
console.log("CONSOLE:", errs.length ? errs.join("\n") : "none")
await b.close()
