/*
The consistency audit.

Imran, 2026-08-22: "It's applying everything separately instead of creating a
logic and rule and working and updating things based on that… if a behavior is
finalized for an element such as TaskRow it should be updated anywhere else."

He is right, and the evidence was on the record: tap-to-open was written once
and reached six screens out of seven; the folder mark was resolved in two
surfaces and generic in eleven; three pieces of studio scaffolding sat in
user-visible menus. Each was found by looking rather than by checking, which
means the next one will be found by looking too — probably by him.

So the rules stop living in review comments and become assertions.

    node tools/audit.mjs

Static checks only: it reads the source, so it needs no dev server and can run
before a commit. The runtime sweep — routes, console, overflow — stays a
browser job and is separate (`tools/sweep.mjs`).

── Every rule proves it still bites ──────────────────────────────────────────

Added F5, 2026-08-22, and it is the most important thing in this file.

Rule 2 reported PASS for a week while `folder-group-dialog.tsx` drew the
generic folder mark beside a named folder — the exact fault the rule exists to
catch. Its matcher was `/<Folder[\s/>]/`, applied line by line, so a tag
written with its props on the following lines had nothing after `<Folder` to
match and slipped through. A green audit was worse than no audit: it was used
as evidence that the thing it never checked was fine.

A check nobody checks is a rumour. So every rule now carries a **probe** — a
scrap of deliberately wrong source it must flag — and the audit refuses to
report anything until each rule has caught its own probe. A rule that stops
biting fails as `BLIND`, loudly, in the place people are already looking. That
is the only structural defence against a matcher rotting silently under a
refactor, and it costs five lines per rule.
*/

import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import * as Lu from "lucide-react"
import * as Anim from "@animateicons/react/lucide"

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const SRC = join(ROOT, "src")

/*
The labs are where concepts are compared and are deliberately allowed to hold
things the shipping surfaces may not (DES-124).

`states-page` left this list at F6, and the reason is worth keeping: it is not
a lab, it is **V3's deliverable** — the sheet a person reads to find out what
the row does. Sitting in the exclusion, it drifted for four sessions into
showing a row the product no longer draws, four identical "interaction states"
and two states that rendered nothing at all, with nothing able to say so. A
reference nobody checks is a rumour (DES-157), and a wrong one is worse than
none, because it is wrong in the one place somebody goes to be right.

`folder-screen` joined it at F7, and for the opposite reason: it is the *v1*
folder page, rendered only behind `?folder-page=v1` as the by-looking control,
exactly as `task-row-baseline` is the v1 row. The object-menu rule found its
hand-written folder menu on its first run, which was the rule working — a
frozen control is allowed to be out of date, and the way to say so is to name
it here rather than to keep repairing it.
*/
const LAB = /row-concepts|row-lab|task-row-baseline|folder-screen|swatch-options/

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.tsx?$/.test(full) ? [full] : []
  })
}

const files = walk(SRC)
  .filter((f) => !LAB.test(f))
  .map((f) => ({ path: relative(ROOT, f).replaceAll("\\", "/"), text: readFileSync(f, "utf8") }))

/* The line a character offset falls on, so a whole-file matcher can still
   point at a place rather than at a file. */
const lineOf = (text, index) => text.slice(0, index).split("\n").length

/*
The same file with its comments blanked out, offsets intact.

A rule that matches a symbol will otherwise match the paragraph explaining why
that symbol is banned — which is what happened the moment one was written down
here. Newlines survive so `lineOf` still points at the right place; everything
else inside a comment becomes a space.
*/
const codeOnly = (text) =>
  text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (block) =>
    block.replace(/[^\n]/g, " "),
  )

/* ── The rules ─────────────────────────────────────────────────────────────
   Each is `check(files) -> [{ where, detail }]`, plus `probe`: files that are
   deliberately wrong and must be caught. */

const RULES = [
  {
    key: "row-opens",
    title: "every task list opens its rows",
    /*
    A row's body opens the task (Imran, 2026-08-22). The list resolves the
    gesture and the row owns what "open" means, so the two are joined by
    `onRegisterOpen` in the wiring — which means a `renderRow` screen must
    spread that wiring onto its row, or the tap goes nowhere. This is the rule
    the folder page broke silently.
    */
    check(input) {
      const out = []
      for (const { path, text } of input) {
        const renders = [...text.matchAll(/renderRow=\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1])
        for (const fn of new Set(renders)) {
          const builder = new RegExp(`function ${fn}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}`, "m")
          const body = text.match(builder)?.[0]
          if (!body) continue
          if (!/\{\.\.\.wiring\}/.test(body)) {
            out.push({
              where: `${path} → ${fn}()`,
              detail: "renderRow builder does not spread {...wiring}, so tap-to-open cannot reach the row",
            })
          }
        }
      }
      return out
    },
    probe: [
      {
        path: "probe/row-opens.tsx",
        text: [
          "function renderTask(task) {",
          "  return <TaskRow key={task.id} {...task} />",
          "}",
          "const view = <TaskList renderRow={renderTask} />",
        ].join("\n"),
      },
    ],
  },

  {
    key: "folder-mark",
    title: "a folder is drawn by the one resolver",
    /*
    DES-130 gives a folder a glyph and a colour its owner picked. Anything
    that draws `<Folder>` directly beside a folder's *name* is showing the
    generic mark where an identity exists — which is why Desk wore a tray in
    the sidebar and a plain folder on a task chip.

    Matched against the whole file rather than line by line, because JSX wraps:
    the fault this rule missed for a week was written as `<Folder` with its
    props underneath. `(?![A-Za-z])` keeps `<Folders`, `<FolderPlus`,
    `<FolderOpen`, `<FolderInput` and `<FolderMark` out of it — five real
    components whose names begin the same way, which is why the boundary has
    to be explicit rather than assumed.
    */
    check(input) {
      const out = []
      for (const { path, text } of input) {
        if (/folder-icon-picker|folder-mark/.test(path)) continue
        for (const match of text.matchAll(/<Folder(?![A-Za-z])/g)) {
          /* The element and a little of what follows it: enough to see the
             props and the label beside them, whether or not they wrap. */
          const context = text.slice(match.index, match.index + 320)
          if (/\.name|folderName|group\.name|folder\.color|group\.color/.test(context)) {
            out.push({
              where: `${path}:${lineOf(text, match.index)}`,
              detail: "draws <Folder> for a named folder; use FolderMark / useFolderMark / folderMarkFor",
            })
          }
        }
      }
      return out
    },
    probe: [
      {
        /* Not named after the rule: this check skips any file whose path
           contains `folder-mark`, and the first draft of this probe was
           called exactly that — so the probe was skipped, and the probe
           mechanism caught it on its first run. */
        path: "probe/group-dialog.tsx",
        text: [
          "<label>",
          "  <Folder",
          '    className="size-4"',
          "    style={{ color: folder.color }}",
          "  />",
          "  <span>{folder.name}</span>",
          "</label>",
        ].join("\n"),
      },
    ],
  },

  {
    key: "no-scaffolding",
    title: "no studio scaffolding in user-visible copy",
    /* A prototype's instruments are addressed by URL, never by furniture. */
    check(input) {
      const ARTEFACTS = [
        /Previous folder page/,
        /arrives with V\d/,
        /not available here/,
        /coming soon/i,
        /\bTODO\b|\bFIXME\b/,
      ]
      const out = []
      for (const { path, text } of input) {
        text.split("\n").forEach((line, index) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
          /* Only inside a string or as JSX text — a comment mid-line is still
             a comment, and an identifier is not copy. */
          if (!/["'>]/.test(line)) return
          for (const pattern of ARTEFACTS) {
            if (pattern.test(line)) {
              out.push({ where: `${path}:${index + 1}`, detail: line.trim().slice(0, 90) })
            }
          }
        })
      }
      return out
    },
    probe: [
      {
        path: "probe/scaffolding.tsx",
        text: '<DropdownMenuItem>Previous folder page</DropdownMenuItem>',
      },
    ],
  },

  {
    key: "one-icon-module",
    title: "one icon module",
    /*
    DES-125: the family is one decision in one file. A direct `lucide-react`
    import puts a second, unanimated vocabulary into the product.

    `components/ui/**` is vendored shadcn, regenerated by its CLI, so an edit
    there comes back. The two icons it draws are structural parts of those
    primitives rather than Dana's vocabulary. Exempt deliberately, and named
    so the exemption is a decision rather than an oversight.
    */
    check(input) {
      const out = []
      for (const { path, text } of input) {
        if (path.endsWith("lib/icons.tsx")) continue
        if (path.includes("components/ui/")) continue
        if (/from ["']lucide-react["']/.test(text)) {
          out.push({ path, where: path, detail: "imports lucide-react directly instead of @/lib/icons" })
        }
      }
      return out
    },
    probe: [
      { path: "probe/icons.tsx", text: 'import { Star } from "lucide-react"' },
    ],
  },

  {
    key: "real-folder-list",
    title: "folder menus read the real library",
    /*
    `FOLDERS` in task-model is four names written for the row lab. Any menu a
    person picks a folder from reads `folderLibrary()`.

    **This rule was written too narrowly and passed over three real
    violations.** It matched the literal `items={FOLDERS.map`, which was the
    shape of the one call site it was written against, and missed
    `{FOLDERS.map((folder) => (` in the Move-to-folder submenu, the bulk move
    menu and the card's move menu. Imran found them by using the menu.

    A probe proves a rule still fires; it cannot prove the rule was aimed
    widely enough in the first place. So this one matches the *symbol*
    wherever it appears, and its probe is deliberately written in a different
    shape from the matcher — a probe that mirrors the pattern only proves the
    pattern matches itself.
    */
    check(input) {
      const out = []
      for (const { path, text } of input) {
        if (/lib\/task-model|lib\/folder-library/.test(path)) continue
        const code = codeOnly(text)
        for (const match of code.matchAll(/\bFOLDERS\b/g)) {
          const lineStart = code.lastIndexOf("\n", match.index) + 1
          const lineEnd = code.indexOf("\n", match.index)
          const line = code.slice(lineStart, lineEnd < 0 ? undefined : lineEnd)
          /* The import is how it reaches the file; the use is the fault, and
             counting both would double every report. */
          if (/^\s*(import|\})/.test(line)) continue
          out.push({
            where: `${path}:${lineOf(code, match.index)}`,
            detail: "reads the lab's FOLDERS constant; use folderLibrary()",
          })
        }
      }
      return out
    },
    probe: [
      {
        path: "probe/folders.tsx",
        text: "<DropdownMenuSubContent>\n  {FOLDERS.map((folder) => (\n    <Item>{folder.name}</Item>\n  ))}\n</DropdownMenuSubContent>",
      },
    ],
  },

  {
    key: "no-dead-controls",
    title: "no control that cannot do anything",
    /*
    DES-144: "a menu of dead items is the least premium thing an interface
    owns." F5 found six of them in one place — the task card's footer band
    carried Undo, Redo, Copy link, Share, Email and History, and not one had a
    handler. Undo and Redo were worse than inert: both were wired to a depth
    counter that starts at zero, with Undo disabled at `<= 0` and Redo at
    `>= 0`, so neither could ever become pressable by any route.

    `IconAction` is the card's own icon button, and one written with neither
    `onClick` nor `disabled` is a drawing of a control rather than a control.
    */
    check(input) {
      const out = []
      for (const { path, text } of input) {
        for (const match of text.matchAll(/<IconAction\b/g)) {
          const end = text.indexOf("/>", match.index)
          if (end < 0) continue
          const element = text.slice(match.index, end)
          if (!/onClick|disabled|render=/.test(element)) {
            out.push({
              where: `${path}:${lineOf(text, match.index)}`,
              detail: `dead control: ${element.replace(/\s+/g, " ").trim().slice(0, 70)}`,
            })
          }
        }
      }
      return out
    },
    probe: [
      { path: "probe/dead.tsx", text: '<IconAction icon={Mail} label="Email" />' },
    ],
  },

  {
    key: "system-form-controls",
    title: "form controls come from the system",
    /*
    Imran, 2026-08-22: the conversation "is still not following the shadcn UI
    code or structure". It was not, and neither were five other places: every
    multi-line field in the prototype was a bare `<textarea>` carrying its own
    border, radius, ring and placeholder, because the project never installed
    shadcn's Textarea and so there was nothing to reach for. Six fields, six
    spellings of one control.

    A bare `<input>` or `<textarea>` outside `components/ui/**` is that fault
    starting again. The exceptions are narrow and both are real: a file input
    is a hidden trigger with no appearance to inherit, and a checkbox or radio
    has its own primitive.
    */
    check(input) {
      const out = []
      for (const { path, text } of input) {
        if (path.includes("components/ui/")) continue
        for (const match of text.matchAll(/<(textarea|input)(?![A-Za-z])/g)) {
          const element = text.slice(match.index, text.indexOf(">", match.index) + 1)
          if (/type=["'](file|checkbox|radio|hidden)["']/.test(element)) continue
          out.push({
            where: `${path}:${lineOf(text, match.index)}`,
            detail: `bare <${match[1]}>; use the Input / Textarea primitive`,
          })
        }
      }
      return out
    },
    probe: [
      {
        path: "probe/field.tsx",
        text: '<textarea\n  rows={1}\n  className="rounded-md border"\n/>',
      },
    ],
  },

  {
    key: "one-page-one-mark",
    title: "no two views wear the same mark",
    /*
    Imran, 2026-08-22: "'Anytime' has the same icons as 'All'." It did — I
    gave it `Layers3`, which All already wore, while adding it.

    The lesson is about the checks rather than the glyph. `one-drawing-one-name`
    guards the icon *module*: two exported names resolving to one drawing. It
    cannot see two entries in a list choosing the same exported name, which is
    the same fault one level up and the one a person actually meets, because
    they meet it in the sidebar with both rows visible at once.

    Two pages sharing a mark is worse than two names sharing a drawing: the
    sidebar is the one place every view is on screen together, so a collision
    there is not a subtle inconsistency, it is two rows that look like the
    same row.
    */
    check(input) {
      const model = input.find((f) => f.path.endsWith("lib/nav-model.ts"))
      if (!model) return []
      const code = codeOnly(model.text)
      const seen = new Map()
      const out = []
      for (const entry of code.matchAll(
        /name:\s*"([^"]+)",[\s\S]{0,200}?icon:\s*([A-Za-z0-9_]+)/g,
      )) {
        const [, page, mark] = entry
        const first = seen.get(mark)
        if (first) {
          out.push({
            where: `${model.path}:${lineOf(code, entry.index)}`,
            detail: `${page} wears the same mark as ${first} (${mark})`,
          })
        } else {
          seen.set(mark, page)
        }
      }
      return out
    },
    probe: [
      {
        path: "lib/nav-model.ts",
        text: [
          'export const NAV_PAGES = [',
          '  { name: "All", icon: Layers3, pinned: true },',
          '  { name: "Anytime", icon: Layers3, pinned: false },',
          "]",
        ].join("\n"),
      },
    ],
  },

  {
    key: "one-drawing-one-name",
    title: "one drawing, one name",
    /*
    Imran's rule, 2026-08-22: "one native concept should not carry two
    different icons". Its mirror matters just as much — one drawing must not
    answer to two names, because two names are how one drawing ends up
    meaning two things.

    It had: `AlertCircle` and `CircleAlert` are the same lucide glyph exported
    twice, and both were live — one saying "this failed" in the error state,
    the other saying "this is late" on an overdue row. Same picture, two
    meanings, and nothing in the source made that visible.

    Lucide keeps deprecated aliases beside their replacements, so this cannot
    be caught by reading names. The icons are rendered and compared by their
    actual geometry.
    */
    check(input) {
      const icons = input.find((f) => f.path.endsWith("lib/icons.tsx"))
      if (!icons) return []
      const draw = (name) => {
        try {
          return renderToStaticMarkup(createElement(Lu[name])).replace(/class="[^"]*"/g, "")
        } catch {
          return `?${name}`
        }
      }
      const byDrawing = new Map()
      for (const match of icons.text.matchAll(/export const (\w+) = icon\(\s*Lu\.(\w+)/g)) {
        const key = draw(match[2])
        if (!byDrawing.has(key)) byDrawing.set(key, [])
        byDrawing.get(key).push({
          dana: match[1],
          lucide: match[2],
          at: lineOf(icons.text, match.index),
        })
      }
      const out = []
      for (const group of byDrawing.values()) {
        if (group.length < 2) continue
        out.push({
          where: `${icons.path}:${group[0].at}`,
          detail: `${group.map((g) => `${g.dana} (Lu.${g.lucide})`).join(" and ")} are the same drawing — keep one name`,
        })
      }
      return out
    },
    probe: [
      {
        path: "lib/icons.tsx",
        text: [
          "export const AlertCircle = icon(Lu.AlertCircle, Anim.TriangleAlertIcon)",
          "export const CircleAlert = icon(Lu.CircleAlert, Anim.TriangleAlertIcon)",
        ].join("\n"),
      },
    ],
  },

  {
    key: "one-glyph-at-rest-and-in-motion",
    title: "an icon animates as itself",
    /*
    Imran, 2026-08-22: some icons are "having one icon but changes with
    another when replaced". Twenty-nine were — the filter was three lines at
    rest and a funnel under the pointer, Settings was sliders and then a gear.

    **The first version of this rule was blind, and he found the instance.**
    It compared *names*: for `icon(Lu.Share, Anim.ShareIcon)` it asked whether
    lucide's `Share` matched lucide's `Share`, said yes, and passed — while the
    animated component was drawing `Share2`, a completely different picture.
    The library names its components for the **concept**, not for lucide's
    current name for it, so name-matching proves nothing at all. That is
    DES-157's fault in this very file: a green rule used as evidence about
    something it never looked at.

    It renders both and compares the drawings now. They differ innocently far
    more often than not — the library splits a heart in two so the halves can
    draw in, reverses a tick so it can be stroked on, adds a shape that only
    appears mid-flight — so a plain inequality would report thirty icons and
    mean nothing. The fault is only real when the animation **is a different
    lucide icon**, and that can be proved by finding which one it is.
    */
    check(input) {
      const icons = input.find((f) => f.path.endsWith("lib/icons.tsx"))
      if (!icons) return []

      /* What a component actually draws. Styling, animation state and element
         order are stripped, and a line's two ends are unordered because the
         animated library reverses some of them. */
      const signature = (Component) => {
        let markup
        try {
          markup = renderToStaticMarkup(createElement(Component))
        } catch {
          return null
        }
        const shapes = []
        for (const m of markup.matchAll(
          /<(path|line|circle|rect|polyline|polygon|ellipse)\b([^>]*)>/g,
        )) {
          const attrs = {}
          for (const a of m[2].matchAll(/\s([a-zA-Z-]+)="([^"]*)"/g)) {
            if (/^(d|x|y|x1|y1|x2|y2|cx|cy|r|rx|ry|width|height|points)$/.test(a[1])) {
              attrs[a[1]] = a[2]
            }
          }
          if (m[1] === "line") {
            shapes.push(
              "line " +
                [`${attrs.x1},${attrs.y1}`, `${attrs.x2},${attrs.y2}`].sort().join(" "),
            )
          } else if (Object.keys(attrs).length) {
            shapes.push(
              m[1] +
                " " +
                Object.keys(attrs)
                  .sort()
                  .map((k) => `${k}=${attrs[k]}`)
                  .join(" "),
            )
          }
        }
        return shapes.sort().join("|")
      }

      const out = []
      for (const match of icons.text.matchAll(
        /export const (\w+) = icon\(\s*Lu\.(\w+),\s*Anim\.(\w+)Icon\s*\)/g,
      )) {
        const [, dana, still, moving] = match
        const resting = signature(Lu[still])
        const playing = signature(Anim[moving + "Icon"])
        if (!resting || !playing || resting === playing) continue

        const actually = Object.keys(Lu).find(
          (name) =>
            name !== still && !name.startsWith("Lucide") && signature(Lu[name]) === playing,
        )
        if (!actually) continue
        out.push({
          where: `${icons.path}:${lineOf(icons.text, match.index)}`,
          detail: `${dana} rests as Lu.${still} and animates as Lu.${actually} — one glyph, two drawings`,
        })
      }
      return out
    },
    probe: [
      {
        path: "lib/icons.tsx",
        /* The real fault, found by Imran and missed by this rule's first
           version: `ShareIcon` draws `Share2`, whatever it is called. */
        text: "export const Share2 = icon(Lu.Share, Anim.ShareIcon)",
      },
    ],
  },

  {
    key: "one-object-menu",
    title: "an object's menu comes from its contract",
    /*
    Imran's brief of 2026-08-23 asked for Copy link, Duplicate, Open as a tab
    and a Trash "consistently everywhere". They were missing in different
    places for one reason: every overflow menu was written by hand, so an act
    existed exactly where somebody had remembered it.

    The proof was one folder with two menus. Its sidebar row offered Rename,
    Label and colour, Move and Delete; its own page's bar offered Rename, Move
    and Delete — no Label and colour. Neither file was wrong, and nothing could
    say the two disagreed.

    `lib/object-acts` declares the acts once and `ObjectMenu` draws them, so
    this rule guards the one thing that would undo it: a menu item for an act
    that belongs to an object, written straight into a surface. It matches the
    labels rather than the components, because the next hand-rolled menu will
    be built from whatever primitives are nearest.
    */
    check(input) {
      const OBJECT_LABELS =
        /Delete folder|Delete task|Delete shelf|Label and colou?r|Save as workflow|Copy link|Move to shelf/
      const out = []
      for (const { path, text } of input) {
        if (/components\/object-menu|lib\/object-acts/.test(path)) continue
        for (const match of text.matchAll(
          /<DropdownMenuItem\b[\s\S]{0,240}?<\/DropdownMenuItem>/g,
        )) {
          if (!OBJECT_LABELS.test(match[0])) continue
          out.push({
            where: `${path}:${lineOf(text, match.index)}`,
            detail: `an object's act written into a surface: ${match[0]
              .replace(/\s+/g, " ")
              .slice(0, 60)}… — declare it in lib/object-acts, draw it with ObjectMenu`,
          })
        }
      }
      return out
    },
    probe: [
      {
        path: "probe/menu.tsx",
        text: [
          '<DropdownMenuItem variant="destructive" onClick={onDelete}>',
          '  <Trash2 className="size-4" />Delete folder…',
          "</DropdownMenuItem>",
        ].join("\n"),
      },
    ],
  },

  {
    key: "one-chip-family",
    title: "the row's chips come from the one list",
    /*
    W2, the review's second standing constraint: the row's state-chip and
    assignee slots are **cut as open sets**, because `docs/design/vision.md`
    has work going to "a person, an AI agent, or both" and states like
    "waiting, working, blocked, ready for review".

    The strip was eight hardcoded conditionals in one JSX block. Nothing
    declared what the family was, the order lived in the source sequence where
    nobody could review it, and `bare` restated all eight conditions by hand —
    and had already drifted, still counting notes and attachments, which have
    not been chips since the card took them.

    A list makes the order data and adding one an entry. This rule is what
    keeps it that way: the next chip is easiest to add where the last eight
    were, and a conditional slipped back into the strip would be invisible in
    review and unnoticed for a session.
    */
    check(input) {
      const row = input.find((f) => f.path.endsWith("components/task-row.tsx"))
      if (!row) return []
      const start = row.text.indexOf("  const details = (")
      if (start < 0) {
        return [{ where: row.path, detail: "no detail strip found to check" }]
      }
      const end = row.text.indexOf("\n  const actions = (", start)
      const strip = row.text.slice(start, end < 0 ? start + 1200 : end)
      const out = []
      if (!/visibleChips\.map/.test(strip)) {
        out.push({
          where: `${row.path}:${lineOf(row.text, start)}`,
          detail: "the detail strip no longer renders from the chip list",
        })
      }
      /* A chip drawn on a condition rather than declared with one. */
      for (const match of strip.matchAll(/\{\s*(?:task|props)\.\w+[^\n]*\?\s*\(/g)) {
        out.push({
          where: `${row.path}:${lineOf(row.text, start + match.index)}`,
          detail: `chip drawn inline instead of declared: ${match[0].trim().slice(0, 48)}`,
        })
      }
      return out
    },
    probe: [
      {
        path: "components/task-row.tsx",
        text: [
          "  const details = (",
          "    <div>",
          "      {visibleChips.map((chip) => chip.body())}",
          "      {task.blocked ? (",
          "        <DetailChip>Blocked</DetailChip>",
          "      ) : null}",
          "    </div>",
          "  )",
          "",
          "  const actions = (",
        ].join("\n"),
      },
    ],
  },
]

/* ── The probes run first ──────────────────────────────────────────────────
   Nothing is reported until every rule has proved it still catches its own
   deliberately-wrong input. */
const blind = RULES.filter((rule) => rule.check(rule.probe).length === 0)

if (blind.length) {
  for (const rule of blind) {
    console.log(`BLIND ${rule.title}`)
    console.log(`        this rule no longer catches its own probe — it is reporting nothing, not passing`)
  }
  console.log(`\n${blind.length} rule${blind.length === 1 ? " is" : "s are"} blind. Fix the matcher before trusting any result above.`)
  process.exit(2)
}

/* ── Report ──────────────────────────────────────────────────────────────── */
let bad = 0
for (const rule of RULES) {
  const hits = rule.check(files)
  bad += hits.length
  console.log(`${hits.length === 0 ? "PASS" : "FAIL"}  ${rule.title}${hits.length ? ` (${hits.length})` : ""}`)
  for (const hit of hits) console.log(`        ${hit.where}\n          ${hit.detail}`)
}

console.log(
  bad === 0
    ? `\nAll ${RULES.length} rules hold across ${files.length} files, and all ${RULES.length} proved they still bite.`
    : `\n${bad} violation${bad === 1 ? "" : "s"} across ${files.length} files.`,
)
process.exit(bad === 0 ? 0 : 1)
