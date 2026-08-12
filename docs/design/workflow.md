# Dana UI workflow

Current session: **Session 8 - Final QA and handoff**  
Current status: **APPROVED - Session 8 and the desktop handoff are complete**  
Previous session: **Session 7 - Remaining coverage, completed on 2026-08-11**  
Next step: **Share `Dana-Design-Prototype-v1.zip` with Hassan for production integration**

Current delivery scope: **desktop UI at 1440px**. Mobile application UI and
detailed responsive design are deferred. The registry continues to record mobile
requirements so they are not lost when that work resumes.

## Why this file exists

This is the only workflow/control document. We will discuss the details of each
session in the Codex conversation instead of creating a new Markdown file for
every step.

The reusable handoff documents are:

- `design-contract.md` - product/design rules, components, decisions and open questions.
- `screen-registry.csv` - every required surface and its design/QA status.
- `notes.md` - added later for approved motion, scrolling, desktop behavior and
  deferred-mobile notes.
- `screens/` - added later for approved screen exports only.

The running prototype and final ZIP are product artifacts, not session reports.

## Gate used for every session

`NOT STARTED -> IN PROGRESS -> REVIEW -> APPROVED`

1. Work on one session only.
2. Show its visible output.
3. Check it against the specification and the session acceptance list.
4. Correct it without starting the next session.
5. Record approved decisions in `design-contract.md` and update affected rows in
   `screen-registry.csv`.
6. Start the next session only after Imran says the current one is approved.

Rejected explorations remain in Claude Design history. They are not exported into
the Dana project.

## Sessions and persistent outputs

| Session | Goal | External design review | What is saved after approval |
| --- | --- | --- | --- |
| 1. Product contract | Confirm complete scope, states and open questions | No | Updated `design-contract.md` and `screen-registry.csv` |
| 2. Visual foundation | Define the approved compact, content-first direction | Completed | Approved design decisions, `prototype/src/styles/tokens.css`, one foundation reference image |
| 3. Component state lab | Finalize TaskRow and repeated states | Optional | Reusable prototype components, working states page, one approved states reference image |
| 4. Application shell | Finalize desktop navigation and chrome | Optional | Shell components and one approved 1440px shell image |
| 5. Task form | Finalize create/edit dependencies and warnings | Optional | TaskForm components, form states and interaction notes |
| 6. Golden screens | Establish Dana's final visual language | Recommended critique | Approved desktop My Day, Tasks, Folder/sharing, Planned calendar and integrated task-form screens |
| 7. Remaining coverage | Compose all secondary surfaces | Optional | Remaining prototype screens and approved exports |
| 8. Final QA and handoff | Verify and package Hassan's desktop deliverable | No | `notes.md`, 1440px screen exports, icons and `Dana-Design-Prototype-v1.zip` |

No session creates its own report file. It updates the shared contract, registry,
prototype or approved handoff assets.

## Session 6 working plan

Goal: establish Dana's production-facing desktop language through a small set
of integrated golden screens, reusing the approved shell, TaskRow, states and
TaskForm instead of redesigning them.

1. My Day approved: populated, important-only, carried, recap, empty, loading,
   error and offline states; TaskRow and TaskForm interactions are connected.
2. Finalize Tasks now because it establishes reusable folder grouping and
   inline QuickAdd behavior for undated work.
3. Finalize one shared Folder screen and its sharing panel, including owner and
   member permissions, scheduled/unscheduled/completed sections and warnings.
4. Finalize Planned list and calendar modes, including dated/timed tasks,
   unassigned treatment and repeating-task ghost context.
5. Run one integrated desktop QA pass, resolve cross-screen inconsistencies,
   obtain an optional Claude Design critique, and approve the golden set before
   Session 7 expands the remaining surfaces.

Session boundary: desktop golden screens only. Search, Settings, authentication,
emails, installation surfaces and other secondary coverage remain in Session 7;
mobile remains deferred. No API or backend work is added.

Saved after approval: reusable screen composition components, only necessary
fixture data, approved 1440px golden-screen exports, updated registry statuses
and decisions. No separate per-screen report files are created.

## Session 7 working plan

Goal: complete the remaining required desktop coverage without reopening the
approved foundations, shell, TaskRow, TaskForm or golden-screen language.

1. Compose the secondary task views: Important, All and Done.
2. Compose Search, People and Settings from existing approved components.
3. Cover the public/authentication, incoming-invite, system/PWA and
   transactional-email surfaces at handoff fidelity.
4. Review each surface before moving to the next, then run the complete desktop
   QA pass before approval.

Session boundary: desktop coverage only. Mobile remains deferred. No backend,
API or production implementation is added, and unresolved product copy or
destinations remain explicitly OPEN.

Session 7 completion: the 1440px integrated pass covered 32 representative
routes across public/auth, shell, core and secondary task views, folders,
sharing, Search, TaskForm, People, Settings, system feedback and transactional
emails. No horizontal overflow, broken images, suspicious placeholder text or
console errors remained. Interaction checks passed for completion/Undo, new
folder creation, Search keyboard entry, task steps, typed account deletion,
connection removal, recurring un-complete confirmation, owner/member/default
folder permissions, live delete counts, folder management and profile-menu
Settings navigation. The production build also passed; the existing bundle-size
warning is non-blocking for this design prototype.

## Session 8 completion

The final desktop handoff contains the reusable prototype, fake fixtures, the
single token source, shared components and state coverage, sixteen clean 1440px
reference exports, the 192px and 512px Dana icons, and implementation notes. A
fresh extraction passed `npm install` with zero reported vulnerabilities and
passed `npm run build`. The existing Vite chunk-size warning remains non-blocking
for this throwaway design reference. Imran approved the final sidebar density,
folder-directory behavior, neutral icon rules and collapsed-rail alignment on
2026-08-11. Session 8 is complete.

## Codex-first design rule

Codex owns the runnable prototype, rendered review and implementation QA. Claude
Design is optional and is best used as an independent critique after the golden
screens exist. Do not design and implement every session twice. The prompt blocks
below are retained as historical inputs for Sessions 2-3, not as the active path.

### Session 2 prompt

Attach `brief.md`, `design-contract.md`, `screen-registry.csv`, the supplied
`09-ui.md`, and the finalized primary/reverse Dana Mark SVGs. Then use:

```text
We are beginning Session 2 of the approved Dana UI workflow: Visual Foundation.

Dana is an installable, online-only collaborative task PWA. Treat the attached
design contract, screen registry, UI specification and brief as requirements.
Do not add behavior, copy or screens that are not in those files.

Locked constraints:
- Product name: Dana.
- shadcn/ui is the component foundation.
- Vite, React, TypeScript and Tailwind CSS 4 are fixed.
- Dana Mark geometry is final and locked. Do not redesign it.
- Brand mark direction is dark monochrome.
- No AI, chat, integrations, offline editing or notification center in v1.
- Normative copy must remain word for word.
- Accessibility requires 4.5:1 text contrast, visible keyboard focus, at least
  44px touch targets, and non-color status signals.
- This delivery is desktop-only at 1440px. Do not create phone, tablet or
  responsive-layout explorations. Mobile remains a later requirement.
- Mobile references in the attached source files are retained for traceability;
  they are not work for this session.

This session is foundations only. Do not design product screens.

Create one restrained visual-foundation board for Dana's approved compact,
content-first direction. It must show:
- a typography hierarchy;
- neutral, accent and semantic color roles;
- 8 to 16 folder-color swatches;
- spacing, density, radii and elevation;
- button, input, checkbox, switch, badge, avatar and menu examples;
- pending, overdue, completed, abandoned, disabled and keyboard-focus states;
- the locked Dana Mark on an appropriate light surface.

Use a compact, Notion-inspired information hierarchy with ChatGPT-like calmness
and restraint. This is one direction, not a request for two alternatives. Do not
copy either product's branding, exact interface, colors or proprietary assets.

Use Inter Variable as the single proposed UI typeface, with this fallback stack:
`Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
sans-serif`. Use only weights 400, 500 and 600. Test this exact compact type scale:
- Page title: 24px / 32px, weight 600.
- Section heading: 16px / 24px, weight 600.
- Task and body text: 14px / 20px, weight 400; weight 500 for emphasis.
- Control and label text: 14px / 20px, weight 500.
- Supporting metadata: 12px / 16px, weight 400 or 500.

Do not copy ChatGPT or Notion font files, type values or color values. They are
references for hierarchy and restraint only.

Create one original Dana color system:
- a graphite neutral ramp that works with the locked monochrome mark;
- one restrained product accent that remains clearly separate from semantic
  status colors;
- semantic success, warning, danger/overdue and information roles;
- ten coordinated folder colors with similar perceived strength, each usable
  with a non-color label or icon cue.

Provide exact OKLCH and hex values for proposed colors. Verify relevant text and
control combinations against the 4.5:1 contrast requirement. Do not import a
default shadcn palette or copy a palette from another product.

Use a 4px spacing base and keep interactive targets at least 44px. Achieve the
compact feeling through clear grouping and restrained gaps, not undersized
controls. Propose one exact radius scale, one minimal elevation scale and one
Lucide icon system using `lucide-react`. Use 16px for metadata and compact chips,
and 20px for controls, navigation and row actions, with a 1.75 stroke and round
caps and joins. Do not mix icon libraries or use decorative icons. Prefer
borders for structure; reserve shadows for floating overlays and dialogs.

Do not silently use the default shadcn theme. Every value must belong to a named
Dana token. Present the complete proposal as a token table plus the visual
examples. Briefly explain how it supports fast task scanning without making the
interface feel busy.

Stop after presenting the board. Do not create product screens or begin the
prototype. Imran will review the foundation first.
```

### Session 3 prompt

Continue in the same Claude Design project. Attach only:

- `design-contract.md`
- `brief.md`
- `09-ui.md`
- `tokens.css`
- `foundation-reference.png`

Then use:

```text
We are beginning Session 3 of the approved Dana UI workflow: Component State Lab.

Sessions 1 and 2 are approved and locked. Use the attached design contract,
approved Dana tokens and foundation reference. The attached brief and UI
specification define required behavior and normative copy. If anything conflicts,
the UI specification and approved design contract win. Do not reword normative
copy.

Scope constraints:
- Desktop only at 1440px. Do not design mobile or responsive transformations.
- Use shadcn/ui structure and Lucide icons only.
- Use Inter and the approved token values exactly; do not create another palette,
  type scale, spacing scale, radius system or shadow system.
- Light mode only. Do not add dark mode.
- Do not design the application shell, complete pages, task form or calendar yet.
- Do not add AI, chat, drag-and-drop, attachments, comments or unapproved features.

Create one focused component-state lab that finalizes Dana's most repeated
component: TaskRow. Treat the states as composable properties, not eleven
unrelated row designs. Establish one base anatomy and show the required examples:

1. Pending.
2. Pending and overdue, with a non-color cue.
3. Completed: checked and faded.
4. Abandoned: faded, struck through, an "Abandoned" chip and "Restore" control.
5. Important: filled star.
6. Assigned to someone else: avatar chip with name.
7. Unassigned in a shared folder: "unassigned" chip; Planned/calendar context only.
8. Pulled into My Day: pulled marker and "Remove from My Day" action.
9. Assignment invite pending: "Invite pending: sara@example.com".
10. With steps: compact progress such as "2/5".
11. Repeating: Lucide repeat glyph.

The row anatomy must support the exact elements required by the source documents:
completion control, title, folder name with color dot, due treatment, assignee,
important control, pulled marker, steps, recurrence and overflow actions. Decide
the desktop scanning order, row height, alignment, truncation, metadata wrapping,
and which secondary actions are persistent versus shown on hover/focus. Preserve
44px interaction targets even when visible glyphs are smaller.

Also show:
- default, hover, keyboard-focus and selected/open-menu interaction examples;
- task-row skeletons matching the final row geometry;
- the persistent offline banner using the exact specified copy;
- one reusable inline error-and-retry pattern;
- the exact My Day and Tasks empty states as restrained reusable patterns.

Accessibility requirements:
- text contrast at least 4.5:1;
- visible focus on every interactive element;
- never use color alone for overdue, completed, abandoned, assignment or folder
  meaning;
- metadata inside tinted fills uses graphite-600 or the relevant semantic-700;
- warning is never an amber filled button with white text.

Deliver one 1440px component-state board, not product screens. Include a short
anatomy/behavior annotation and clearly mark any genuinely unresolved choice as
OPEN. Stop after the board so Imran can approve Session 3 before Session 4.
```

For later Claude sessions, begin with:

```text
Sessions 1 through [N-1] are approved and locked. Work only on Session [N].
Use approved tokens and components before creating anything new. If a requirement
is missing or contradictory, label it OPEN instead of inventing an answer.
Present this session for review and stop before Session [N+1].
```

## Final output for Hassan

- Throwaway Vite/React/TypeScript/Tailwind 4/shadcn prototype.
- Hardcoded fake data only.
- One `tokens.css` containing all design values.
- Reusable components and one screen file per required surface.
- States page covering task-row and global states.
- Approved 1440px desktop screen exports.
- Dana PNG icons at 192 and 512 pixels without geometry changes.
- PWA theme and background values.
- `notes.md` covering motion, scrolling, desktop behavior, deferred mobile scope
  and unusual decisions.
- A ZIP that runs with `npm install` and `npm run dev`.

No production or backend code belongs in this package.
