# Components

Conventions for `src/client/components`. `../README.md` holds the
client-wide conventions and this file does not repeat them.

## What lives here

| Path | What it is |
| - | - |
| `ui/` | The shadcn primitives, with @base-ui/react behaviour underneath (`dialog.tsx`, `dropdown-menu.tsx`, `checkbox.tsx`, `sidebar.tsx` and the rest), plus `ConfirmDialog.tsx` |
| `ui/utils.ts` | `cn`, the class composer every component uses |
| `ui/use-mobile.ts` | `useIsMobile`, the viewport predicate the primitives import |
| `ui/copy.ts` | The strings section 9 fixes word for word, as constants (`MORE_ACTIONS`, `ADD_A_TASK`, `COMPLETE_TASK` and so on) |
| lower-case files in this directory | Presentational components: `task-row.tsx`, `folder-row.tsx`, `quick-add.tsx`, `person-face.tsx`, `object-menu.tsx` and their siblings |
| `calendar/`, `search/`, `page/` | Larger components with their own internal modules |
| `index.ts`, `ui/index.ts` | Barrel entry points |
| `../lib/object-acts.ts`, `object-menu.tsx` | The object-menu contract (below) |
| `../lib/icons.tsx` | The icon module (below) |
| `../lib/time-format.ts` | The 12/24-hour preference store (`useTimeFormat`) that rows, cards and pickers read |
| `../styles/tokens.css` | The only token file |

## What a component may do

- A component takes its data and its callbacks as props and does not fetch.
  The same component is rendered more than once on a page, so it cannot own a
  query.
- Which way a page's star tooltip points is the page layer's decision and
  arrives as a prop (`importantTooltip` on `task-row.tsx`); a component never
  reads the route to decide.
- Copy that section 9 fixes comes from `ui/copy.ts`, character for character.
  Design may restyle, never reword.

## The object menu

- `../lib/object-acts.ts` declares, once per object kind, the acts an object
  has, their words, their glyphs and their order; `object-menu.tsx` draws them.
- `actsFor(kind, handlers)` draws only the acts whose handler the surface
  supplies. An act with no handler does not appear, which is also how role
  restrictions are applied, so never add an act by listing exceptions.
- A folder's menu is the same menu everywhere it appears; surfaces differ only
  in the handlers they pass.

## Tokens

- `../styles/tokens.css` is the only place a raw colour, type size, spacing
  step or radius may be written. A raw value anywhere else is a defect, fixed
  by moving the value into that file.
- Components write Tailwind utilities composed with `cn`, with variants as
  class-variance-authority definitions. Utilities reach token values through
  `@theme`, so `bg-primary` or a bracket utility wrapping a token `var()` is
  fine and a bracket utility wrapping a literal value is not.
- Tailwind scans `../**/*.{ts,tsx}` through an explicit `@source` in
  `tokens.css`; do not rely on automatic detection.

## No minimum width floor

- There is no viewport minimum width on `html` or `body`, and adding one is
  forbidden: it turns an unsupported narrow viewport into a page that refuses
  to render.
- Never write that utility's literal bracket form in any file Tailwind can
  scan, a comment included, because the build emits whatever class name it
  finds. Check the built output in `dist/`, not the source. (Utilities that
  reset a flex child's minimum to zero are unrelated and fine.)

## Font stack

- `--font-family-sans` leads with `"Inter Variable"` because that is the
  family `@fontsource-variable/inter` registers; a stack opening with `Inter`
  never reaches the loaded face.
- Inter is self-hosted through that package and never linked from another
  origin, so an installed app renders its typeface offline.

## Checked controls

- A checked control uses `primary`, which is `--color-dana-accent-600`, the
  same accent as links and the focus ring (`ui/checkbox.tsx`).
- The task row's completion check (`Check` in `task-row.tsx`) is the exception
  and fills with `--color-success-600`.

## Icons

- The family is `@animateicons/react/lucide`, and `../lib/icons.tsx` is the one
  module that imports it. Components import icons from that module.
- Nothing imports `lucide-react` per icon. Where the animated set lacks a
  drawing, the substitution happens inside `icons.tsx` with its reason on the
  same line. `quick-add.tsx` and a few files outside this directory still import
  `lucide-react` directly; move them to the module when you touch them.
- A decorative glyph is `aria-hidden`; the accessible name belongs to the
  control around it.

## Naming

- An accessible name that section 9 fixes is a fixed string from `ui/copy.ts`
  and is never interpolated with the object it acts on: `More actions`, not a
  name containing the folder. Sibling controls are told apart by the region
  they sit in.
- Only controls section 9 does not name may interpolate (for example `Add task
  to {folder}` in `folder-row.tsx`).
- `ConfirmDialog` owns its `Continue` and `Cancel` names; callers pass the
  message, not the button names.
- A control that states a toggled state carries two names, one per state
  (`Complete task` / `Mark as not done`; `Collapse sidebar` / `Expand
  sidebar`), never one name for both.
- Files in this directory are kebab-case (`task-row.tsx`); `ui/` primitives keep
  their shadcn file names.
- Controls that are revealed on hover reveal by opacity only and always reserve
  their box, so they stay reachable by role and name without hovering.
