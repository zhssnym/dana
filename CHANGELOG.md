# Changelog

Notable changes to Dana, per release. Curated for humans: not every commit appears
here, only things worth knowing about. Format follows Keep a Changelog; versions
follow Semantic Versioning.

## [Unreleased]

**The landing page is the Codex lane's, and section 9.2 stopped carrying its
copy (S13, 2026-08-24).** The public page at `/` is now the ten-section design
the owner directed, replacing the two-column composition that shipped at P8.
The specification changed with it, on his ruling: 9.2 used to fix seven
marketing strings in a table, and now fixes the rules that copy is written
under while the design record holds the sentences. One rule is new rather than
moved, and it is the point of the exercise: **the landing may claim no
capability Dana does not ship.** The standing no-AI-claim rule is that rule's
instance for the one capability anybody was tempted to claim, and AC-159
asserts it unchanged.

Two things the design draws are deliberately not shipped. The second "Continue
with Google" in the closing block is gone, 9.2 admitting one and AC-159
counting the page; the header is sticky in exchange, so the single path stays
reachable from the foot of a long page. The copyright year is computed rather
than typed.

**New accounts are offered a worked example (S13, 2026-08-24).** A person whose
account holds no folder but Desk and no task is offered three starter
workflows on Desk: a trip, a small team, and something to learn. Choosing one
posts an ordinary 7.16 workflow file, so it creates nothing a person could not
have created themselves and costs no new backend. Each arrives with a folder
page that says, in its first paragraph, that the example is theirs to change or
delete.

No starter carries a comment or a reminder. The owner ruled both out, and the
workflow file format already had no key for either: a fabricated comment would
attribute words to somebody who never said them, and a reminder would mail a
person about a plan they did not make, most likely long after they forgot the
example was there. New section 9.13 records the reasoning, and AC-226 asserts
the behaviour.

## [1.0.0] - 2026-08-16

The first shipping release of Dana, the whole of RFC 0001's packages P0 to P10.

**First restore drill, 2026-08-16, green.** Render's free instance type carries no
point in time recovery, so the drill ran the runbook's other route: a custom
format `pg_dump` of production, restored into a scratch `dana_restore_drill`
database on the local PostgreSQL 18 created with the 11.10 builtin C.UTF-8
locale, with AC-001's constraint catalog asserted against the restored copy. 24
of 24 green. The run was proved to have used the restored database rather than
falling back to PGlite by repeating it against a nonexistent database name and
confirming it fails instead of passing. The scratch database was dropped and
`dana_test` was not touched.

**Production smoke, 2026-08-16, green**, including one reminder email that really
arrived. That leg found the only defect the automated suite cannot see: a
`RESEND_FROM` that was not an address, which Resend refused with HTTP 422 while
the scheduler retried silently every 60 seconds. Configuration only, no code
change.

### Added

- **RFC 0003 implements the free 30-day application-log route chosen for the
  basic MVP.** Dana keeps every privacy-approved structured event on stdout
  and, when both private production settings are present, mirrors the same
  Pino record directly to the scoped `dana-production-logs` Axiom dataset over
  HTTPS. Missing or partial configuration remains stdout-only and never logs
  the token. This replaces the paid Render-to-Secure-Syslog path without
  changing stored data or APIs; Render build and platform logs keep Render's
  own shorter retention. The new destination remains inactive until the two
  settings are added together during P10.

- **P9 hardening is implemented on `codex/p9-hardening`, without a production
  merge or deploy.** Authenticated mutations, invite creation, and search now
  have the per-user limits fixed by section 10.4 and return `429` with
  `Retry-After`. A typed logging boundary records the events section 10.5
  requires while excluding task content, invite addresses, credentials, and
  session identifiers. Server and browser Sentry adapters send sanitized
  errors only; account and folder deletion logs include row counts; scheduler
  delivery logs and heartbeat outcomes use the same policy. AC-101 to AC-104
  now have executable coverage. The task-form limits import their shared schema
  constants, the duplicated database adapters have one server-level home, and
  the stale DES-029 manifest comment is corrected. The external Sentry,
  uptime, heartbeat, and 30-day log-retention setup remains an operator step
  documented at `docs/operator/p9-observability.md`.

- **RFC 0002 RE-ACCEPTED by the human owner, 2026-08-13, on the three amendments
  of the P8R mid-package change control and on nothing else.** Nothing here is
  application code and nothing here amends `docs/spec/`. The three amendments
  changed RFC 0002's specification delta, which the preamble says returns an
  Accepted RFC to Draft, so the RFC has been sitting at Draft since 6f8dbaf
  waiting on exactly this decision. The status line at
  `docs/rfcs/0002-client-ui-replacement.md` reads Accepted from this date, and
  the header carries the return to Draft and the re-acceptance as separate lines
  so that a later reader finds the round trip rather than a status that appears
  never to have moved. The owner accepted all three: the eleven rows added to
  9.1's names table, the striking of 9.8's People-screen invite list together
  with AC-172's third clause, and the new 9.4 sentence that a task row opens
  that task's form on every page and whatever its status.
  **The numbers were re-checked rather than inherited, and again not one moved.**
  The preamble makes a Draft's numbering provisional and has the Steward assign
  final numbers at acceptance; a re-acceptance is an acceptance, so the check was
  run against the specification and against every other RFC on this date rather
  than carried over from 2026-08-13's first one. Section 12 still ends at AC-173,
  section 13 still ends at item 34, AC-174 to AC-183 and items 35 to 37 are
  claimed by nothing outside the RFC itself, and RFC 0001 is still the only other
  RFC and still adds no criterion. The three amendments assign no number between
  them: the first is eleven rows inside a table the 9.1 delta unit already
  carried, the second strikes a sentence from the 9.8 unit and a clause from the
  text of AC-172, which this RFC was already rewriting under its own number, and
  the third is a new delta unit whose rule AC-178 and AC-179 already assert,
  which is why it was a silence rather than an addition.
  **The implementation plan is untouched, verified by comparison rather than by
  reading.** Everything in the RFC from the section 12 unit to the end of the
  file is byte for byte what it was at 32e51e0: the ten new criteria, the three
  section 13 items, the two item replacements, the compatibility accounting, the
  alternatives, the open questions and the twelve-row plan. Two figures did move
  and neither is a number anything cites: the delta is sixteen units rather than
  fifteen, and the touched-sections line gained 9.4.
  **One thing the untouched plan does not carry, recorded so nobody reads its
  absence as an oversight.** R3 has landed and amendment 1 rules four names
  against what it shipped, so corrections are owed inside R3's own paths with no
  row scheduling them. They are enumerated in the change control entry below, and
  the sessions from R5 on build against the ruled names either way, so what is
  owed is a correction to landed work rather than a dependency any later row
  waits on.
  **With this, package P8R is unblocked from R5 onward**, which is where two of
  the three amendments were blocking, and the third stops costing the session it
  was already costing.

- **The P8R mid-package change control, 2026-08-13: ten controls named, one
  unreachable surface deleted, one silent rule stated, and RFC 0002 returned to
  Draft because all three change its delta.** Nothing here is application code
  and nothing here amends `docs/spec/`. These amend RFC 0002's specification
  delta, which has not merged and is what package P8R builds against; the delta
  merges at implementation, unchanged in that respect. The preamble returns an
  Accepted RFC to Draft when its specification delta changes, and each of these
  three does, so the RFC's status line now reads Draft and the owner's
  re-acceptance is owed on these three items rather than on the RFC again. No
  number moves, the implementation plan is untouched, and a session already
  building against this delta needs only the three.
  **Ten controls this package builds had no normative name, which is the item
  that blocks the sessions after R4.** The Adversarial Test Engineer escalated
  them after writing criteria it could not fully express. 9.1's addressing
  sentence makes a control reachable by its role and its normative name, and a
  control this specification never names is reachable only by position, so a
  criterion written against one asserts the implementation rather than the
  contract, which is the exact thing that sentence exists to prevent. Eleven rows
  are added to 9.1's names table: "Open full form" for the quick-add's escalation
  control; "Complete task" and "Mark as not done" for the completion checkbox of
  9.4 and the completion control of 9.3; "More actions" for a sidebar folder
  row's menu and a folder group's menu; "Filter open tasks" with "All open
  tasks", "With a due date" and "Without a due date"; "New folder group",
  "Rename group", "Delete group" and "Move to group"; "Folder name"; "Group
  name"; "Label" and "Color"; "Collapse sidebar" and "Expand sidebar"; "Resize
  sidebar" and "Resize task form"; and "Account" for the avatar menu.
  **Four names in the tree are corrections owed to role 08 rather than silent
  divergences**, which is why R3's output was read before these were ruled and
  not after. R3 shipped four of the ten at f48b063. Three agree with what is
  ruled here and stand untouched: the quick-add's collapsed control and its input
  both read "Add a task", the task row's checkbox reads "Complete task" and "Mark
  as not done", and its overflow reads "More actions". Four disagree. The
  quick-add's escalation control ships as "Open full task form for {folder}" and
  becomes "Open full form". A sidebar folder row's menu ships as "Manage {folder}
  folder" and becomes "More actions". The two dialog fields ship as "Folder name"
  and "Group name", which are the ruled names, so those two stand; what does not
  is the pattern the first two share, an accessible name interpolating the object
  it acts on. A name in this table is a fixed string, and the region rule beneath
  it is what tells two instances apart, which is the same reason the folder
  header got a region name rather than its menu getting a third one.
  **"Open full form" rather than "More options", and the ground is sharper than
  the escalation's.** The tester's reason was that 9.3 already spends "More
  options" on the form's expander and both can be on the page at once. That
  understates it: the two are not alternatives on a page, they are alternatives
  at one instant, because the escalation control opens the form and the form's
  expander then sits behind the dialog's scrim. A shared name there is not a
  collision a test can scope its way out of.
  **Four controls now answer to "More actions", which is not a new decision.** It
  is this section's own argument at the folder header, applied again rather than
  reconsidered: they are the same control pointed at different objects, a fourth
  name would assert a difference in kind that is not there, and each is reached
  the way a task row's menu is reached, inside the row or the region that names
  its object.
  **AC-172's third clause and 9.8's People-screen invite list are struck,
  because they described a surface no person could reach.** RFC 0002's amended
  9.8 renders the invite gate at every /app path while Q12 is non-empty, and it
  also gave the People screen the same list for as long as any invite exists.
  `/app/people` is an /app path. So the one page that was to hold the list is the
  one page unreachable exactly while the list would have anything in it, and the
  tester could not assert the clause because nothing could satisfy it. The
  sentence was carried over from the ruling the gate replaced and does not fit
  the gate. The alternative is recorded so it is not reintroduced: exempting
  `/app/people` would have kept the list at the cost of a hole in a gate whose
  entire point is that invites come first, and it would have given a person two
  places to answer an invite where the ruling's own argument was that they should
  have one that finds them. Deleting it costs nothing, because what the list was
  for was "where a person returns to an invite they have not answered" and the
  gate is now that place by construction.
  **Section 9 never said that a task row opens its form, and 9.4 now says it**,
  on every page that draws a row and whatever the task's status. It was stated
  once, in 9.5's Planned bullet, where it reads as a property of the calendar,
  and the status half was never stated anywhere. That silence was already costing
  a session: AC-178's completion clause and AC-179's un-complete arm both need a
  completed task's form, and 9.3's history block renders a completer that would
  otherwise have no surface at all. It lands in 9.4 because the row is defined
  there and the rule belongs to the row rather than to any page, which is the
  tester's recommendation to restate it generally rather than per page. Section
  9.4 is a new delta unit and the RFC's touched-sections line now carries it.
  **One thing not reopened, recorded so nobody does.** AC-097 is red on this
  branch because 8232e23 removed the abandoned-state tokens with the file it
  retired, and it is not owed a fix. The designer's task row, landed at f48b063,
  draws an abandoned row struck through and muted, so the criterion resolves when
  the pages consume that component at R6. Restoring tokens from a file this
  package deleted on purpose would put back the appearance it is deleting.

- **RFC 0002 ACCEPTED by the human owner, 2026-08-13, with both open questions
  closed and every provisional number confirmed as final.** Nothing here is
  application code and nothing here amends the specification: an RFC's delta
  merges when its package is implemented, which is the preamble's lifecycle and
  which this RFC's own implementation plan schedules at R1 to R12. The status
  line at `docs/rfcs/0002-client-ui-replacement.md` reads Accepted from this
  date.
  **The numbers are final and not one moved.** The preamble makes a Draft's
  numbering provisional and has the Steward renumber at acceptance if another RFC
  claimed any number first, so this was checked rather than assumed: section 12
  still ends at AC-173, section 13 still ends at item 34, AC-174 to AC-183 appear
  nowhere in this repository outside the RFC itself, items 35 to 37 are
  unclaimed, and RFC 0001 is the only other RFC and adds no criterion of its own.
  AC-174 to AC-183 and items 35 to 37 are therefore assigned exactly as authored,
  and nothing downstream that cites one has to be revisited.
  **Open question 1 closes on the comma.** The designer's landing subheading
  carried an em dash, and the delta already transcribed it as a comma. The owner
  confirmed the substitution on the ground that protocol section 7's convention
  holds across the whole corpus, including copy adopted from outside it, and that
  the sentence's meaning is unchanged; the alternative he declined was ruling the
  designer's punctuation part of the approved copy and letting the convention
  yield to it. No delta text moves. What closed is whether the comma was allowed
  to be there, which is worth the entry because the copy is normative and a later
  reader comparing 9.2 against the prototype will find the two punctuated
  differently and needs to know which is deliberate.
  **Open question 2 closes with section 13 item 33's human visual review
  standing, unchanged and unwaived.** The item was ruled for P8D, a package that
  added no acceptance criterion, and the case for it was that a green gate
  certified nothing about appearance. RFC 0002 adds ten criteria, which weakens
  that case without answering it: every one of the ten asserts a landmark, a
  link, a grid cell, a region or a copy string, and none of them can see whether
  the product looks right, while this package's subject is still appearance. The
  owner affirmed the requirement in writing on 2026-08-13, which is the form item
  33 demands of a decision either way. So R12's review remains a precondition of
  the merge, the Steward refuses on its absence exactly as on a red leg, and the
  evidence is unchanged: one recorded line naming who looked, on what date, at
  which built pages against which prototype screens, and what verdict they gave.
  The affirmation is written into the RFC's own Open questions section, which is
  where item 33 says a waiver would be written, and for the reason that item
  gives: a reader of it should find the decision rather than a silence to
  interpret.
  **With this, package P8R is unblocked at R1**, the tester session that writes
  AC-093, AC-166 and AC-172 rewritten plus AC-174 to AC-183, all red, against the
  amended text the delta carries.

- **RFC 0002 authored as a Draft, 2026-08-13: the client user interface is
  replaced by the designer's prototype, four owner rulings are transcribed into
  section 9, and ten prototype affordances are ruled rather than left to arrive
  silently.** Nothing here is application code and nothing here touches a frozen
  section. The RFC is at `docs/rfcs/0002-client-ui-replacement.md`, status Draft;
  the human owner accepts it and a later session records the acceptance and
  finalises the provisional numbers. The specification is deliberately not
  amended here: an RFC's delta merges when its package is implemented, which is
  the template's own lifecycle.
  **It was written with both applications running, and that is the correction it
  is under.** `SESSION-LOG.md` records why P8D stopped: six sessions read the
  designer's files and not one opened his application, in a package whose entire
  subject was appearance. Three claims in the research handed to this session
  were false, and every one of them was false in a way that only running the
  prototype exposes.
  **The suite's role contract is not carried by his markup, which is the finding
  that most changes the work.** The research reported that his markup carries all
  of it once relabelled. Measured on 2026-08-13: his sidebar has no `nav` element
  and no navigation landmark, where AC-155 and AC-173 read one; its six page
  entries are buttons, where AC-091, AC-160 and AC-171 read links and
  `harness.ts` records in its own comment why a link, 9.1's routes making every
  page a URL; his calendar emits no `grid`, `gridcell`, `row` or `columnheader`
  at all, where AC-093, AC-098 and AC-158 read grid cells; the regions "Folder
  header" and "Sharing panel" do not exist; and two of the eight `getByLabel`
  field names are wrong, title being labelled "Task name" and important being a
  button rather than a control named "Important". The delta answers this by
  giving 9.1 a roles table beside its names table and its sections table, on the
  ground that stating it costs six rows and the alternative is what just
  happened: the roles the suite reads have been the tester's inference defended
  in harness comments rather than specification text, which was tolerable while
  one client was written against the suite and stopped being tolerable when a
  second body of markup arrived.
  **Normative copy is missing, split or reworded in ten places and not four.**
  Checked string by string with JSX entities decoded. Beyond the four reported,
  9.3's "Limit 50 steps" is absent, 9.4's abandon confirm and 9.8's
  remove-connection confirm are split across a dialog title and its description
  so the sentence never renders as one text run, and 9.6's leave, remove-member
  and delete-folder confirms are reworded. AC-183 is added for the nine that must
  be restored. It is a regression criterion rather than a behavioural one and is
  admitted as such: the nine were found by measurement, and a criterion is the
  only thing in this build that survives the session that learned them.
  **Two of the research's cautions were wrong in the prototype's favour**, and
  both are recorded that way rather than quietly dropped. His task form does
  carry an assignee field, rendered on 9.3's own two-or-more-members rule and
  invisible only because the default fixture folder holds one member. And his
  history block already renders "Deleted user" for a null author, which is the
  rendering section 13 item 27 says v1 ships no surface for; that item closes for
  `created_by` and `completed_by` and stays live for `invites.accepted_by`, which
  7.5 still exposes to nobody.
  **Item 30 closes, verified rather than assumed.** His `components.json`
  declares shadcn's own schema and the `base-mira` style, and his twenty
  components import `@base-ui/react`, which is the primitive library that
  distribution is built on. Copying them into `app/src/client/components/ui/` is
  what 11.4's sentence has asked for since it was written, so a provenance
  deviation closes rather than widening. What replaces it is item 35: the
  behaviours the old item worried about are now a library's, the version is
  pinned exactly, and an upgrade re-runs the browser leg before it merges.
  **Ten affordances his prototype carries that no numbered section names are
  ruled here**, because the path of least resistance for every implementing
  session is to port the component and say nothing, and protocol section 1 makes
  an unrecorded deviation a defect even where the code works. Nine are admitted
  with names and criteria: the folder due-date filter, the new-folder dialog, the
  label-and-colour dialog, folder-group create, rename, delete and "Move to
  group", the calendar's "+N more", the task form's history block and its
  completion control, and the sidebar's rail and both resize handles. The
  five-second completion Undo is refused, and refused in the specification's text
  so that removing it is an instruction rather than an omission: 5.1's
  transitions are immediate, 8.3 refetches after each own mutation, and a client
  holding a write back for five seconds has to answer what its own list shows
  meanwhile and what happens when the tab closes inside the window. What ports is
  the completion toast without the undo control.
  **FullCalendar 7 leaves and the dependency set the P8D kickoff refused is
  approved**, both on the owner's rulings. The calendar bullet in 11.4 always
  said the visible order was the contract and the mechanism was not, so a grid
  whose cells we render orders them by rendering them in order, and the custom
  `eventOrder` comparator and its documented fallback both disappear with the
  library; 11.15 loses a hazard, which is one fewer thing every future session
  must read. What is given up is the library's keyboard and accessibility
  handling in the grid, which is why 9.1's roles table fixes the grid cell and
  AC-177 asserts it. `@base-ui/react` pinned, `class-variance-authority`, `clsx`,
  `tailwind-merge` and `tw-animate-css` are approved; the `shadcn` package stays
  refused as a runtime dependency, being a copy-in generator, which is 11.4's own
  reading and not a new one.
  **Section 9 was amended to match a design artifact four times, and 11.13's rule
  that artifacts never do that is unchanged.** Recorded as item 37 because four
  escalations decided the same way looks from a distance like a rule that no
  longer binds. Each of the four went to the owner, was decided on the merits and
  arrived in section 9 as text, which is the route 11.13 prescribes working
  exactly as written; what that rule forbids is an implementer resolving a
  divergence by building the artifact, and none was resolved that way.
  **Three criteria are rewritten and none is deleted**: AC-093, whose folder row
  read a section context 9.6 no longer has; AC-166, whose quick-add is now a
  disclosure; and AC-172, whose invite list is now a gate. AC-058 is untouched
  and it is worth saying so, since it looks reachable from the folder page's
  restructuring: it asserts Q7's arrays on the wire, and section 6 and section 7
  do not move.

- **The P8D mid-package change control, 2026-08-12: three owner rulings
  transcribed, six audit findings ruled, and two sessions added to a package
  that owned none of its pages.** Nothing here is application code and nothing
  here touches a frozen section. The kickoff at 05a8e52 stands unchanged; this
  is the docket that arrived after it, three rulings from the owner and six
  findings from the co-lead's audit, each verified against the artifacts before
  it was written down.
  **The pages had no session, which is the finding the rest hangs on.** The P8D
  row described a role 07 session covering the sidebar, the top bar and the page
  canvas, then role 09's three surfaces, and stopped. Persona 07 owns the pages,
  the shared page states and `index.html`, so thirteen pages and
  `src/client/states/` sat between those two cells with nobody told to touch
  them, in a package whose entire subject is appearance. `PageStates.tsx`
  renders loading as a "Loading" span over three empty list items where the
  design gives skeleton lists, and its empty branch has no icon where `notes.md`
  asks for one restrained contextual Lucide glyph. The owner approved two role
  07 sessions and they are in the row: the list pages plus the shared states,
  then the management and public pages, bounded against each other by file, both
  after the shell and before role 09, so that seat runs contiguously and the
  states file lands before the pages that consume it.
  **A findings return is now a step rather than a discovery.** The owner
  approved a loop between the item 33 human review and the merge review:
  findings route back to the persona owning each surface, the merge review
  follows them, and the merge condition is that every one is applied or recorded
  as declined with its reason. Every merge review of this build has produced
  returns, so this schedules something that happens anyway. It is in the P8D
  row's session order, in its acceptance cell, and in section 13 item 33, which
  defined the review and said nothing about where its output went.
  **Section 13 item 32 is answered: v1 ships desktop-first.** The owner ruled
  the first of the three options on 2026-08-12, accepting the designer's
  deferral. The item does not close on it and its revisit trigger survives
  deliberately, for the reason the co-lead put and the owner heard: this is v1's
  answer and P8D's rather than Dana's permanent one, and 10.6 still makes Dana
  installable on a phone, so the product now keeps a promise its layout does
  not. The P8D half ruled at the kickoff is untouched and still binds, the
  `min-width: 1180px` prohibition included.
  **Five things in the prototype do not port, listed rather than left to five
  separate escalations.** The folder page's one open list with a due-presence
  filter (DES-062) against 9.6's three sections and 9.1's named regions; the
  sidebar's 56px collapsed rail and its 224 to 360px resize; the task form's
  horizontal resize handle (DES-025), where the right-side sheet it sits on is
  appearance and does port; and the five-second completion Undo, where the undo
  this product specifies is Done's "Mark as not done" of 9.5. The fifth was
  found at this change control rather than by the audit, and it is the one a
  session would have walked into: the prototype has no top bar at all,
  `app-sidebar.tsx` carrying the mark, the wordmark and the global search
  control in the sidebar header and the profile menu in its footer, where 9.1
  puts the app name, the search control and the avatar menu in the top bar.
  Three named controls relocated is structure and not a skin, so section 9 wins,
  the top bar keeps all three, and what ports is the mark, rendered as the app
  name 9.1 already puts there. One correction to the audit's evidence, because a
  session should not over-trust it: no browser case addresses the Scheduled or
  Unscheduled regions by name. `rendered-halves.spec.ts` asserts both open
  sections' rows and the Completed collapsible, and AC-093 and AC-166 turn on
  which section a quick-add sits in, but the refusal rests on 9.6 and 9.1 being
  normative, not on the suite catching a breach.
  **Three transcriptions into session cells that had no home for them.** The
  brand assets ride the shell session: `index.html` has never carried a favicon,
  and the two manifest icons are correctly sized placeholders whose art differs
  by hash from the approved DES-030 exports, which `vite.config.ts` already
  called "design's to replace", so this was a handoff the row failed to pick up
  rather than a defect found late. The motion values ride the role 08 session,
  existing today only as prose in `notes.md`, 100, 150, 200 and the 240ms
  completion collapse plus reduced-motion suppression, with neither token file
  carrying one of them; they belong in `tokens.css` under the reading of 11.4
  the P8 merge already recorded, that the rule governs the values the design
  fixes, and the row says so because 11.4's own list of colour, type, spacing
  and radius names no duration and is not widened here. That session also
  settles OPEN-3 and OPEN-4, both of which the artifacts already answer, so what
  is owed is transcription: the foundation board gives `--color-accent-600` for
  checked controls with DES-044's neutral completed checkbox as the named
  exception, and DES-029 was approved at `#FFFFFF` on 2026-08-10, which is what
  both PWA tokens already hold. The manifest's copy of that pair is Platform's
  file, its values are already right and its comment still calls DES-029
  unsigned, so the correction is routed to P9 and the P9 row names it, per the
  lesson item 31 taught at the kickoff.
  **The calendar starts the week on Monday.** The P6 change control left the
  week start to the designer and the 11.13 artifacts because nothing in the
  specification turns on it; his `planned-screen.tsx` answers Monday and our
  `PlannedCalendar` sets nothing, taking FullCalendar's locale default. The role
  09 cell now carries it. It is cheap: the six-week range of 9.5 is computed
  from the calendar's own `datesSet` rather than by hand, and AC-082's file
  header already records that the Monday-start six weeks carry the same ghost as
  the Sunday-start six.
  **And section 13 gains item 34, for four surfaces this package cannot reach.**
  `screen-registry.csv` has twenty-eight rows and P8D's sessions reach
  twenty-four. The three transactional emails render from Platform's
  `notify/templates.ts` and the unverified-email refusal from Security's
  `auth/pages.ts`, and P8D's roster is roles 07, 08 and 09, all client. The
  owner approved that list without an email session, so this is a deferral, and
  it is a comfortable one: DES-034 is still OPEN and all three email rows say
  "exact body unresolved", the templates render the plain text 10.7 fixes, and
  the refusal page carries 9.2's copy exactly. Recorded in section 13 rather
  than in the row alone, because a merged RFC row is not where a later reader
  looks for why the emails are not designed, and named in the row too so the
  roster does not read as complete. The item carries the fact that is not
  scheduling: neither surface can import `tokens.css`, so styling either
  duplicates values 11.4 puts in one file, and that reading is owed before the
  work rather than during it.

- **The P8D kickoff, 2026-08-12: spec 11.13 rewritten, two open questions
  opened as items 32 and 33, and the package retraced.** P8D ports the
  designer's appearance onto the client P8 built, and it exists because
  section 9's first sentence excludes colour, typography and spacing, so no
  acceptance criterion can see appearance and P8 shipped 173 green criteria
  over a client whose sidebar was a full-width block. Nothing here is
  application code.
  11.13 named `docs/design/screens/*.png`, deleted at 552d4a5 on the owner's
  call, and did not name the two artifacts that now matter most. It is
  replaced by a table of six artifacts and what each is authoritative for,
  plus the reconciliation of the two files that carry token values: the
  foundation board adjudicates a value, `app/src/client/styles/tokens.css`
  stays the single tokens file of 11.4 and is where that value lives, and the
  designer's `prototype/src/styles/tokens.css` is read for the two things the
  board never carried, the layout dimensions and the role mapping. The two
  agree on every primitive they share, checked value by value; they differ in
  spelling. The missing layout layer is the direct cause of what P8 shipped:
  a tokens file that described every colour correctly and never said how wide
  the sidebar is.
  Section 13 item 30 now records that the shadcn provenance departure does
  **not** close in this package, the owner having ruled restyle over
  replacement on 2026-08-12; the RFC row had left that between two options and
  a reader would have inferred the wrong one. Item 31's routing to P9 was
  checked and had not landed: the P9 row named a limits sweep written before
  that item existed and named neither `TaskForm.tsx` nor the item, so a P9
  session would have found no instruction. The P9 row now names it.
  Two new items. **Item 32, whether Dana v1 owes a mobile layout, is packaged
  for the human owner and not ruled.** The phrase in 11.13 naming exported
  screens at phone and desktop was the only mention of a phone layout in the
  whole specification and its subject was deleted; section 9 fixes no
  responsive behaviour, no criterion runs at any width, and 10.6 implies
  phones without specifying a layout, while the designer has answered by
  default, DES-037 deferring mobile and 23 of the registry's 28 surfaces
  reading "MOBILE DEFERRED". This package's own half is ruled: P8D ports
  desktop artifacts, owes no mobile layout, and must not carry the prototype's
  `min-width: 1180px` into an installable PWA. **Item 33 rules the human
  visual review a precondition of the merge**, waivable by the owner and by
  nobody else, on the ground that this package can never have a criterion and
  a fully green gate is therefore capable of certifying exactly what was false
  at P8. Its evidence is one recorded line, not a document.
  Also ruled at the kickoff and transcribed into the RFC row: the dependency
  set, where restyle refuses six of the prototype's seven and approves
  `@fontsource-variable/inter`, which is owed rather than optional because
  both token files name Inter and the client loads no font at all today; and
  the session order, where the finding that every visual value lives in one
  file with one owner makes role 08 wide and first and collapses two forecast
  sessions into one.
- **Package P8 of RFC 0001, the web client, merged into main on 2026-08-12.**
  The largest row in the plan and the first that renders anything: the shell,
  the router over 9.1's route table, the TanStack Query data layer sending tz
  on every view request and the CSRF header on every mutation, the component
  set and the design foundation transcribed into `tokens.css`, the calendar,
  the task form and the search overlay, the pages of 9.4 to 9.8, the landing
  page, and the PWA layer of 10.6. Section 9 had never been implemented before
  this package, and implementing it is what turned a great deal of it from
  describable into assertable: the route table, the addressing sentence, eight
  control names, the named regions, and nineteen appended criteria that each
  close a rule the specification states and nothing asserted.
  Merged at the commit below. Every leg green: lint, typecheck, 1476 tests
  across 188 files on PGlite and the same on real Postgres 18, build, and the
  browser leg at 97 of 97, which is the leg AC-091 to AC-100 and AC-155 to
  AC-173 run in and the reason protocol section 4 now names CI's workflow as
  the authority on the gate's set rather than listing four commands.
- **9.1's colour dot, the item the merge review held on, and the two readings
  it raised.** The review of 2026-08-12 found one element of 9.1's folder list
  sentence implemented by nothing and asserted by nothing at once, ruled it
  P8's rather than P9's because the P9 row names roles 06 and 10 and neither
  owns the sidebar or the tokens file, numbered it AC-173 from the ruling
  rather than from a proposal, and held the merge. Role 11 wrote it red and
  role 07 closed it in one file, which is the separation the swarm's first
  structural rule exists for and the reason the number is worth anything.
  *Inbox shows a dot like every other folder row.* 9.1's sentence is genuinely
  readable both ways, Inbox having its own clause naming only the badge while
  "each folder" is universal, so the reading is written into 9.1 rather than
  left for the next reader. The design brief this sentence was written from
  puts the three adornments in a final sentence of their own, after Inbox, the
  label groups and the unlabeled folders have each been placed, so they are a
  property of a folder row rather than of a group, and Inbox's clause fixes
  where it sits rather than what it carries. Frozen 4.4 settles it: it gives
  `folder_members.color` a free-form #RRGGBB check with no exclusion for the
  default folder, and 7.4's my-membership accepts a colour on any membership,
  so the other reading would take a colour from a person and never show it
  back. AC-173's "each folder row" already reaches that row, so no criterion
  text moves. *The inline colour is ratified, and recorded in 11.4 as a
  reading rather than as a deviation, because it is not one.* That rule
  governs the values the design fixes. A folder's colour is a person's runtime
  choice carried on the wire, per member and free-form, and the sidebar writes
  no colour at all: only the fill comes from the response, while the dot's
  size and shape stay in `tokens.css` where the rule puts them. Obeying the
  rule literally would mean mapping a free-form hex onto the ten swatches that
  file carries, which would paint a folder a colour its owner did not pick,
  and it would buy nothing, because the hazard the rule exists to prevent is a
  design that cannot be changed in one place and changing `tokens.css` must
  never change what colour somebody's own folder is.

- **P8's merge review, 2026-08-12, and the merge is held on one sentence of
  9.1.** Five of the six docket items closed cleanly and the sixth did not.
  *Section 13 item 14 closes*: the landing copy was the designer's to write and
  the human owner wrote it himself on 2026-08-11, which is his to do, the
  constraint that item recorded having always been 9.2's no-AI-claim rule
  rather than whose pen it came from, and AC-159 now pins the page including
  that rule. *The crossing into `app/vite.config.ts` is ratified rather than
  reverted.* The Frontend Architect changed one literal in Platform's file,
  theme_color from #1f2933 to #ffffff, and disclosed it under ESCALATION with
  a comment at the site rather than leaving it to be found. Ratified because
  10.6 makes the theme and background colours the design's choice, so the
  value is the design's and only the file is Platform's, and because the
  revert would put back a colour the design no longer contains, which trades a
  boundary tidy for a defect. The crossing itself stands as one: the route was
  a Platform session by request, which the P8 row already names, and
  ratification here rests on the change being a single literal whose value
  another section fixes. *The two departures from 11.4 were recorded nowhere,
  which protocol section 1 makes a defect even where the code works, and they
  are recorded now as section 13 items 30 and 31.* The client hand-rolled the
  components 11.4 says are copied in from shadcn/ui, and its task form holds
  six `useState` hooks where 11.4 names react-hook-form 7 with
  @hookform/resolvers. Neither sentence of 11.4 moves. A rule is not rewritten
  to match what was built, so what is recorded is the departure and its cost,
  which is the shape protocol section 1 asks for and the opposite of the drift
  the Steward exists to prevent. Both are recorded rather than routed because
  the criteria measure these from the outside and the browser leg is green at
  94 across every confirmation, overflow menu and collapsible section, so
  rewriting the package's hardest component at its merge gate would trade a
  measured state machine for an unmeasured one. One half is routed rather than
  recorded, and it is the half 11.4's sentence was actually guarding: without
  the resolver the form restates 10.3's limits, `TITLE_LIMIT = 300` and
  `NOTES_LIMIT = 10000`, beside the shared zod schema that already carries
  both, and nothing fails if the two drift because 7.11 makes the client's
  copy advisory. No criterion in this suite can see that, every one of them
  asserting the server's refusal, so it goes to P9's limits sweep, where the
  fix is an import rather than a library.
- **9.1's folder colour dot is P8's, numbered AC-173, and the merge waits on
  it.** 9.1's folder list sentence names three things every folder row shows,
  a colour dot, a name and a pending count, and the client renders two:
  `my_color` appears nowhere under `app/src/client`, and AC-155, this
  package's own criterion for that sentence, asserts the pinning, the grouping
  and both orderings and stops short of the dot. One element of a section 9
  sentence is implemented by nothing and asserted by nothing at once, which is
  the class the P4 change control swept for. *It is P8's rather than P9's and
  the persona files decide it, not convenience.* The RFC 0001 P9 row names
  `06-security-and-privacy.md` with `10-platform.md` for AC-104, and neither
  owns `app/src/client/shell/Sidebar.tsx` or `styles/tokens.css`, so routing
  the dot there would either be a boundary violation by construction or would
  add P8's own two client personas to a later row, which is this package's
  sessions running under another package's name. Nothing about the work argues
  for deferral either: `my_color` has ridden the 7.4 Folder object since P2,
  the sidebar already maps every folder, and `tokens.css` has carried the ten
  folder swatches since the design foundation landed at 34c0b29, two commits
  before the branch tip, so the one dependency that could have blocked this
  cleared before the review opened. The number is appended here rather than
  left to the session that writes the test, the AC-124 and AC-141 shape where
  the Steward appends from a ruling rather than from a proposal, so the tester
  writes against settled text instead of inheriting a debt. What it asserts is
  identification rather than a colour value, which is what the tokens file
  itself says the swatches are for: the dot is present, it carries the
  folder's own colour rather than one colour for every row, and a folder with
  no colour still renders. *The merge is held rather than taken with the gap
  recorded*, because a package that delivers section 9 and leaves a sentence
  of 9.1 unimplemented has not met the first line of the definition of done,
  and recording a gap is not the same as closing one. The gate is green on the
  merged tree with the dot missing, which is the whole argument for the
  criterion: no leg can see a sentence nothing asserts.

- **Package P8 of RFC 0001, the web client, kicked off on branch `p8-client`
  on 2026-08-10.** The P8 row is traced into its session list in the form
  every package since P2 has carried, and with one thing no earlier list
  needed: every session is marked blocked or not against the committed 11.13
  artifacts. The plan already drew that line, structure does not wait for
  them and fidelity does, and no session list expressed it, so the operator
  could not tell which work was startable with `docs/design/` holding
  `brief.md` and nothing else. It is now two sessions that are blocked and no
  others: the Component role's fidelity pass, which transcribes the
  foundations page into `tokens.css` and restyles every state against the
  screens, and a small Frontend Architect return carrying the manifest's 192
  and 512 icons with the theme and background colors of 10.6 and the landing
  copy that closes section 13 item 14. The Complex Interaction role is not
  blocked at all, its four criteria being 9.3's dependency table, its six
  entry-point default sets and the ghost banner, none of which an image
  decides. Both blocked sessions are separated from the unblocked work rather
  than folded into it, so that a missing PNG does not hold the PWA layer, and
  the fidelity pass is a required session rather than a follow-up, because a
  provisional token file that no session is scheduled to revisit is how
  placeholder values ship.
- **Five P8 kickoff rulings, 2026-08-10, grounds recorded here.** *Tests
  first holds as written.* The tension the kickoff was asked to settle, this
  row's permission to start page structure against the frozen contract with
  mocked data against the standing rule that the tester precedes the
  implementer, is not a conflict once each sentence is read against what it
  contrasts: the permission contrasts P8 with the packages it integrates
  against and with the 11.13 artifacts and is about package dependencies,
  while tests before implementation is about session order inside a package
  and binds through protocol section 8 and the first structural rule of
  `docs/team/README.md`. One consequence is a rule rather than a preference,
  and it is the hole the permission would otherwise open: *no acceptance test
  runs against mocked data*, 11.10 putting end to end tests on the seed
  dataset and the development login endpoint, and a criterion satisfied
  against a fixture the client itself supplied asserting nothing about the
  contract it exists to measure. What tests first needed to become executable
  is in section 9 rather than in this entry, because every earlier tester
  wrote against a frozen section 7 whose paths and keys were text while
  section 9 named neither a URL nor any way to address a control: 9.1 now
  carries the route table AC-095 asserts and the sentence that every control
  the section names is reachable by its accessible role and its normative
  name, both landed before any test asserts either, the P4 session 1b order
  and its reason. *One inversion, bounded.* P0 inverted tester and
  implementer once because the scaffold its tester needed was part of P0, and
  that ground reaches exactly one session here: a Playwright run needs a
  configuration, a browser and a server to point at. What bounds it is what
  makes it safe, that the session writes no test, asserts no criterion, and
  encodes no sentence of section 9, so it anchors nothing. *The Playwright
  seam splits by file*, the P2 routes-directory precedent and the P6 one for
  `src/shared/recurrence.ts`: `app/playwright.config.ts` with the dependency,
  the browser install and the npm script are Platform's, a runner
  configuration of the kind persona 10 enumerates beside Vitest's, whose
  consuming CI step is Platform's and has existed since P0 keyed on that
  exact path; every end to end test and every harness it needs is the
  Adversarial Test role's under `app/tests/e2e/`. The two collectors are
  disjoint without touching `vitest.config.ts`, whose include takes
  `*.test.ts` while Playwright's specs take `*.spec.ts`. Two consequences
  bite at a gate rather than at a keyboard: the P8 gate is five commands, not
  protocol section 4's four, since AC-091 to AC-100 pass in the Playwright
  leg alone; and that leg self-activates on the first push carrying the
  config, so it can turn red having never run. *What "exercised end to end"
  obliges.* Ten criteria for the largest package is a floor by construction,
  the sentence P4's row carried and which produced AC-125 to AC-131, and the
  obligation is already itemized in the repository rather than something the
  plan must invent: every clause a P0 to P7 test file or the suite's own
  `README.md` recorded as P8's half is P8's to close, AC-039's faded home,
  AC-048's unassigned chip, AC-053's fading in Tasks and All, AC-058's
  collapsed section. It is not renumbering those criteria, whose server
  halves stay green where they are, and it is not re-asserting server
  behavior through a browser, which buys latency rather than truth; it is the
  clause each states about what the viewer sees, asserted once against the
  rendered page, plus at least one whole path through the development login
  against the seed dataset. The tester's judgment on further numbers works as
  it did at P4, P5 and P6, authored with their tests on the branch and
  numbered by a mid-package change control from AC-144 onward on the
  Steward's authority. *And 9.1's sidebar grouping is presentation rather
  than a rule 7.11 forbids*, settled at the kickoff because 7.11's closing
  sentence, that any rule found only in the client is a specification
  violation and as specified there are none, would otherwise make a session
  either escalate the regrouping or answer it by asking the server for an
  order frozen 7.4 does not name. 7.11 divides rules by authority and both of
  its lists are decisions the server also makes; a grouping the server never
  makes and cannot be wrong about is a rendering of fields the Folder object
  already carries, in the section that owns rendering.
- **Section 9's sections are named regions, ruled 2026-08-11 on the tester
  return's routed recommendation.** Two closures made the same day interacted
  and neither session could have seen it alone: 9.3 gave a folder page's two
  quick-add rows different due dates, Scheduled opening with today and
  Unscheduled with empty, while 9.1's control table gave the inline quick-add
  input one name for the control class. A folder page carries two of them, so
  a test could address "a quick-add row" and not "the Scheduled section's",
  and the only remaining distinguisher was DOM position, which is the
  implementer's internals and the one thing the addressing sentence exists to
  keep out of this suite. Until it was ruled, the two dates the change
  control had just written were asserted by nothing. *The container is named
  rather than the control, and the decisive argument is not cost but scale.*
  Qualifying the input, "the Scheduled section's quick-add", would put a
  per-page variation into a table whose other seven entries are one control
  each, which is the reason the return gave; the stronger one is that it
  cannot be done at all for Tasks, which carries one quick-add row per folder
  group, so its instances number as many folders as hold undated tasks and no
  table of names can enumerate a set the data decides. Naming containers
  costs almost nothing extra because section 9 already names most of them:
  9.4's three headings, All's two, 9.7's three and 9.9's three are normative
  strings today, and the rest take the datum they are generated from, a
  folder, a label, a day. *Generalized once rather than per page*, because
  the alternative is a session discovering it on Tasks, coming back, and a
  second one discovering it on All. The rule is that every section a page's
  structure names is a named region and a control inside one is addressed
  within it, with three consequences written down: a collapsible section is a
  region plus a control of the same name whose expanded state is what
  collapsed means, which is what AC-058's clause now reads and which covers
  9.4's recap and 9.1's label groups with it; a region's name is announced
  rather than rendered, so Tasks' Inbox block is named without acquiring the
  heading 9.5 deliberately denies it; and where the name comes from data
  whose rendering this section leaves free, Done's day groups being the case,
  a test asks for the text the page rendered rather than a string fixed here.
  *Completed is named beside the two open sections*, which the routed item
  raised and left open. Naming only where the collision was would have been
  arbitrary, 9.6's body being three sections, and AC-058's half was reaching
  a heading-shaped button by regex, which is exactly the loose description
  matching the naming ruling exists to remove. *And one adjacent silence is
  closed with them*, recorded because it sits inside the same table: the
  Inbox block carries a quick-add row like every folder group beside it. 9.1
  places the row at the bottom of Tasks groups and 9.5 calls that block
  ungrouped, which between them left the one folder every account has as the
  only one on that page that could not be captured into, on the page whose
  whole purpose is capture without a date.
- **P8's mid-package change control, 2026-08-11.** Twelve criteria numbered,
  four silences ruled, two properties recorded in section 13, one CI edit
  routed to Platform, and a tester return declared owed. *The numbering
  crossed two trees, which is new.* Every earlier batch was numbered by one
  Steward reading one section 12; this one was authored while package P7 was
  numbering its own batch in a second working tree, so the proposing session
  numbered from AC-154 on a brief already stale when written and two of its
  twelve collided with numbers P7 had since assigned. The coordinating
  session holds the ledger across both trees and ruled the allocation, which
  is recorded rather than merely applied: ten stand exactly as authored, the
  file claiming AC-154 becomes AC-166 and the one claiming AC-164 becomes
  AC-167, and section 12 says why the range has gaps at those two. Appending
  is safe precisely because these are identifiers rather than a sequence, and
  renumbering something another branch has already assigned is the one move
  that would make it unsafe. The same arithmetic reaches section 13, whose
  new items are 26 and 27 because P7 holds 25; that gap is deliberately not
  explained in section 13 itself, since it closes at P7's merge, where
  section 12's two do not and are explained there.
- **The four P8 silences, ruled 2026-08-11, three closed and one recorded.**
  All four were routed by the tester rather than guessed at, and section 9
  not being frozen is what let three of them be answered here. *The
  entry-point table's folder-page cell* stated no due date, its value being
  "per that folder's section context" while the floating add button belongs
  to no section. 9.6's two open sections are now the context, Scheduled
  opening with today and Unscheduled with empty, and the button opens empty,
  which is what having no section context means in every other row of that
  table. The reason is that a folder is not a dated page: My Day, the Planned
  list and a calendar cell default to a date because the page is about that
  date, Tasks and All default to none because they are not, and a folder
  holds both kinds at once, so a defaulted today files a task into a section
  nobody aimed at. *The star's inward tooltip* had no string at all, so
  AC-099 could assert only that it did not point outward. It is now the
  star's own state, "Important" filled and "Mark as important" not, both
  states rather than one because the star is an icon-only toggle that owes a
  screen reader something true in each, and because AC-055's un-star needs a
  control it can ask for by name. *Eight controls this section described
  without naming* are named, and this is the largest of the four and the
  cheapest. The addressing sentence added at the kickoff reaches only named
  controls, so the suite had been matching descriptions and escalating each
  gap; a description matched loosely is a locator that finds the wrong
  control the day a second one resembles it. Every name is lifted or
  minimal: "Add a task" is the brief's own words for the quick-add row, "Add
  task" separates the floating button from it on a page carrying both, the
  two overflow menus take "More actions" because 9.3 spends "More options" on
  the form's expander, and every confirmation offers "Continue" and "Cancel",
  "Continue" being this section's own word in 9.5's un-complete confirm and
  uniform because the destructive verb already sits in the normative message
  above the buttons. These are accessible names, so nothing visual moves: an
  icon-only control still shows an icon, and design may restyle and may not
  rename, exactly as it may restyle and not reword. *And AC-138's "Deleted
  user" clause is neither closed nor deleted.* The P5 row routed the
  rendering half of 8.10's surviving-references sentence here, and section 9
  names no page that displays created_by, completed_by or accepted_by. That
  is not section 9's omission: 8.10's own ordering empties every path a page
  renders a display_name through, clearing the assignment at step 4, dropping
  the membership with it, and 7.3 excluding soft-deleted users from the
  roster. The clause in frozen 4.1 and in 8.10 is correct and dormant, AC-138
  pins the server half unchanged, and the obligation lifts from this package
  as section 13 item 27, recorded as a reading of frozen text rather than a
  change to it, the shape 11.9 took for UNTIL at P6.
- **The Playwright leg's CI guard and its twenty-minute ceiling, both routed
  to Platform on 2026-08-11.** The step's second condition, a matching spec
  beside the config, is removed and the first is kept. The window it covered
  opened at the Platform session's own commit and closed at `1a79a9b`, and it
  cannot reopen: specs are only ever added, and a branch deleting every spec
  while keeping the config is a branch deleting ten acceptance criteria,
  which is what this leg exists to turn red for. Platform's own reason for
  rejecting a no-tests-found flag, that it makes an empty collection
  permanently indistinguishable from a passing one, applies verbatim to the
  condition it kept instead, a skipped step being green. Riding the same
  request is a fact measured from the runs rather than inferred: the first
  two to reach this leg, on `5d46ce0` and `89d7470`, were both cancelled at
  the job's `timeout-minutes: 20`, with lint, typecheck, both vitest legs and
  build green in each. The cause is not the browser leg alone. The four legs
  ahead of it spent 13 minutes 59 seconds and 14 minutes 28 seconds of the
  twenty, the PGlite vitest leg about ten on its own, so the browser leg was
  handed under six minutes and was cut off rather than concluding, and that
  does not self-resolve when the pages render, since the fourteen minutes
  ahead of it do not shrink while P9 and P10 add cases to the legs spending
  them. It is a note to Platform and not a section 13 item, that section
  holding unresolved external facts and assumptions the specification rests
  on, and a job's ceiling being neither. It is not nothing either: a
  cancelled run is worse than a failed one, branch protection reading it as
  not green while the report names no assertion, so a session reading CI to
  learn whether its own work passed learns nothing.
- **P8's second change control, 2026-08-11.** Seven items ruled, four criteria
  numbered from AC-169, one section 13 item recorded, two amendments to
  section 11, and nothing routed to the human owner: every item turned out to
  sit in section 9 or section 11, and neither is frozen. Two returns already
  declared owed grow rather than two new sessions being added, which is the
  cheaper shape and the one this row has used since its first return. The
  items came from three places, which is worth naming because no single
  session could have raised them: the tester escalated one from a locator it
  could not write, the co-lead found one by reading the client against
  section 7 endpoint by endpoint, and five were recorded as open silences and
  readings in `app/src/client/README.md` by the sessions that met them. One
  further item was noted rather than escalated and is agreed with here:
  AC-100 appends one comment to `dist/client` during its run and restores the
  bytes in a `finally`, which is a fixture action on the running system of
  the same kind as seeding rows, over build output that is gitignored and
  rebuilt at the start of every run. The one thing it is not is a fixture
  written through section 7, so if it ever failed to restore, the next case
  would read a modified worker; the `finally` and the rebuild bound that, and
  the alternative that session measured is worse, `context.route()` not
  intercepting the browser's fetch of a worker script at all.
- **The reminder the client never sent, found by the co-lead and numbered as
  AC-169 and AC-170.** `api/mutations.ts` carries a hook for every write of
  section 7 except frozen 7.9's, so a reminder set in the task form was held
  in the form's state and discarded at save, silently, with the whole suite
  green. That last part is the finding rather than the missing hook: AC-092
  asserts the form's state and says so in its own text, AC-146 to AC-150
  assert the endpoints, and no criterion read the two together, which is the
  gap shape AC-132 and AC-142 were written for one and two packages earlier.
  Nothing frozen has to move, the endpoints having landed with P7, so this is
  the client's obligation alone and 9.3 now states it: a reminder set while
  creating rides the reminder arm of frozen 7.6's create body, and a reminder
  set or changed while editing is 7.9's PUT, with DELETE
  /tasks/:id/reminder for removal because no task body expresses one. *Two
  numbers rather than one*, because create and edit are two paths to two
  endpoints, which is the split section 12 already carries on the server side
  with AC-149 against AC-146 and AC-148; one number covering both would pass
  on an implementation that wired whichever path its author happened to test,
  which is exactly the failure that produced the pair. Neither criterion
  names a transport beyond what section 7 fixes, the stored reminder being
  the assertion, so a client using the reminder arm of a PATCH body that 8.6
  also names satisfies them.
- **Section 9 gains the copy it had been implying, five strings in three
  places.** All five were recorded as open silences by the sessions that met
  them and none is invented to fill a gap in the abstract. *Two inline page
  states* are written into 9.1: the failed read's "Couldn't load this.
  Nothing was changed." with a "Try again" control, and the 404 answer's
  "Not found. This may have been deleted, or it may never have been yours to
  see." Section 9 gives every page five states and had spelled the toast
  alone, while 10.2's chokepoint makes an inaccessible resource answer as a
  missing one, so a client with no words there tells the person something
  false about their own account. AC-171 asserts both. *The truncation notice*
  is written beside them, "This list is long, so only the first part is
  shown. Narrow it down to see the rest.", with no number interpolated
  because the flag reports that rows were dropped and never how many, and a
  client spelling "1000" would transcribe a limit of 10.3 the response does
  not carry. It is deliberately asserted by no criterion, and the reason is
  recorded in section 12 rather than left to look like an oversight:
  producing it takes a thousand and one rows through section 7, and section
  13 item 6 records that the cap is unreachable at v1 scale. The copy sits in
  section 9 rather than section 6 because these are page states and page
  states are section 9's; the cap rule that produces the flag does not move.
  *And 9.6's two missing confirmations* are written word for word, before a
  member is removed and before one leaves, each stating the R-CLEAN of 5.3
  that a person cannot see from where they are standing, which is what the
  four confirmations section 9 already wrote exist to state. They add no
  criterion: AC-162's text is every destructive action section 9 puts a
  confirm on rather than a list of four, so it reaches them as written and
  what is owed is two cases in its file.
- **The folder header is a region and the invite list is not, ruled the same
  day and deliberately in opposite directions.** The tester escalated a
  locator it could not write: 9.1's control table gives "More actions" to the
  task form's overflow menu and to a task row's, 9.6's folder header carries
  a third, and AC-162 reaches it as the first match on the page, which is
  position and which that suite's own rule forbids. Of the two answers
  offered, the tester preferred giving that menu a name of its own and this
  change control took the other, applying the sections rule added to 9.1 on
  the same date: the header and the sharing panel are named regions, "Folder
  header" and "Sharing panel", both 9.6's own words, and the menu is
  addressed as "More actions" within the first. *Why the tester's preference
  lost*: the two named menus share one name deliberately, being the same
  control pointed at different objects, so a third name would assert a
  difference in kind that is not there, and the sections ruling's own
  argument applies unchanged, that naming containers scales where qualifying
  controls does not. Naming the header also reaches further for less, since
  AC-058's 8.11 ratio, the Share button and the inline rename all sit in it
  and are all addressed today by looking anywhere on the page. *And the
  opposite ruling on the invite list*, which the page assembly session
  recorded as owed rather than escalated, expecting disagreement: it stays
  unnamed, because the sections rule takes a region's name from the heading
  the section gives it or from the datum it is generated from, and this list
  has neither, being one list with no heading. Its rows are addressed the way
  a task row's controls are, from the row's own sentence, which is what
  "Hassan invited you to Wedding" is for. A rule that produces a name where
  the specification has one and produces none where it does not is one rule;
  inventing a string here would have been a second.
- **Two readings where two sentences agreed about one case and were silent
  about the next.** *Where the Q12 invite surface lives*: 9.8 renders the
  invite list "before anything else" after callback and 9.2 lands first-run
  on My Day, which between them fix the first load and say nothing about the
  second. It is a standing section of My Day, and of the People screen, for
  as long as Q12 is non-empty, and AC-172 asserts it, because both wrong
  implementations are plausible and silent: a surface rendered once leaves
  anyone who reloads before answering with no invite in front of them, and a
  band above every page invents global chrome 9.1 does not name. *Whether
  9.3's assignee dropdown offers unassignment*: it does not, and 9.3 now says
  so. Section 4 makes assignee_id nullable and INV-5 permits the null in a
  folder of two or more, but AC-094 asserts the dropdown lists exactly the
  members plus the invite option, so a "Nobody" entry would close a silence
  by falsifying a criterion that passes, which trades the wrong way round.
  The field is hidden in single-member folders, where AC-032's 409 lives, so
  nothing is lost at the only place the refusal bites, and the form defaults
  the assignee to the viewer, the null arriving from events rather than
  choices: a move whose target the assignee is not a member of, and 5.3's
  R-CLEAN. What it costs is recorded as section 13 item 28 rather than left
  implicit, that a task in a shared folder can be reassigned from the
  interface and not unassigned.
- **Two carried items closed in section 11, neither of them frozen.** *The
  CSRF cookie's name* is fixed: `dana_session` and `dana_csrf`, which is what
  the server has set since P1. 11.6 fixed that the token cookie is readable
  and fixed no name, so `api/csrf.ts` preferred a guess and fell back to
  whatever the sole readable cookie turned out to be, a fallback worse than
  the guess it protects, being correct exactly until something else sets a
  readable cookie and then sending the wrong value on every mutation for a
  403 that says nothing about why. The recommendation carried with the item,
  moving both names into `app/src/shared`, is declined: that directory is the
  contract as code, the section 7 schemas and types both sides import, and a
  transport detail of 11.6 is not part of it. With the name in the
  specification each side transcribes one specified constant, which is the
  discipline the acceptance suite already runs on for section 9's copy,
  restating rather than importing so that neither side takes its definition
  of correct from the other. Removing the fallback is one line and is routed
  with the client return. *And 11.4's `virtual:pwa-register` parenthesis*
  names the flow rather than the import, which is the reading the shell
  session recommended and which is now recorded in 11.4 so that a client not
  importing that module is not read later as a deviation. The bullet's
  obligation is 10.6's non-forcing update; the parenthesis identifies which
  of the plugin's registration flows satisfies it, prompt-for-update rather
  than autoUpdate, and a module specifier is how the plugin's own
  documentation names that flow. The measured reason it is not merely a
  preference: the virtual module exists only while the plugin is configured,
  so a static import of it fails the build outright, and this package's
  client had to be green on a tree where `vite.config.ts` was not yet wired.
  Nothing forbids the import to a later session and the swap is one file.
  Recorded as a reading of 11.4 rather than a change to it, the shape 11.9
  took for UNTIL's spelling at P6.
- **Package P7 of RFC 0001, reminders: 8.6's fire instants with both DST rules,
  all five recompute triggers, frozen 7.9's two endpoints, and 11.7's delivery
  pass with Resend behind it.** The fire-instant module implements the gap
  clamp and the fold's earlier instant explicitly, because 11.9 records that
  Luxon guarantees neither, and section 13 item 25 records why no oracle exists
  for either: they are policy chosen where the standard is silent, so the
  module is asserted against raw Luxon by name rather than against a second
  library. The five triggers are one transaction-taking callable its consumers
  invoke, never arithmetic they restate, and one invariant carries fired_at
  across all of them, null exactly when state is scheduled. The scheduler is a
  60-second in-process interval with an in-flight guard, claiming due rows with
  SELECT FOR UPDATE SKIP LOCKED, honoring 8.6's skips, invoking Security's
  session pruning from the same pass, and recording each cycle into the health
  field that has answered null since P0. P6's deferred reminder-copy seam and
  P3's deferred reminder arm of frozen 7.6's two write bodies both close here,
  which was the plan's own sequencing rather than late discovery. AC-083 to
  AC-090, AC-144 to AC-154, AC-164 and AC-168 pass by number beside every
  earlier range: 1476 tests across 188 files, the whole gate green in CI's
  order, on PGlite and on postgres:18. Zero dependencies were added across the
  package, verified against main.
- **One retrace error is corrected at the merge review rather than overwritten,
  because it is the error this column exists to prevent.** The third change
  control recorded that AC-168 would fold into the tester return already queued
  for AC-164, calling it a shorter sequencing than the separate session the
  endpoint shape review had proposed. The branch shows the fold was impossible:
  that return had landed at `0cbd9a5`, four commits before the shape review at
  `4ae05d6` found the defect AC-168 exists for, so there was nothing left to
  fold into. AC-168 took a session of its own at `b2f8ef1`, exactly as the
  review proposed, and the 02 return at `bd49621` carried the fix and both
  routed comments together. The mistake was made by retracing against the row's
  own prose instead of against the log, which is why the merge review's retrace
  reads the branch.
- **One defect shape accounted for three of this package's defects, recorded
  because the pattern is more useful than the three fixes.** Frozen 7.9's
  bullet named a state instead of reading the one the instant earned. 8.5's
  copy hardcoded 'scheduled' over the state planReminder had already computed
  and returned. And generateSuccessor handed down an `at` that the copy ignored
  in favour of its own clock reading. Each is the same move: a value computed,
  made available, and then discarded, with a second value substituted for it.
  Each was invisible until something downstream began depending on the
  discarded one, which is why none of the three was found by the suite. Two
  were found by sessions reading sections against each other, the tester
  finding 7.9 against 8.6 and the endpoint shape review finding 8.5 against
  8.6. What generalizes is not "check for hardcoded states" but that a
  discarded return value is a defect waiting for a dependency, and that reading
  two sections against each other catches what testing one of them cannot. The
  structural repair matches: 8.6 now defines the rule once for all five
  writers, rather than each path restating it, which is the condition that let
  one shape recur three times.
- **The cross-file isolation repair is measured rather than reasoned.** Six
  delivery criterion files share one database under TEST_DATABASE_URL where
  PGlite gives each its own, so one file's scheduler pass could claim another's
  due rows, redden both files at once and neither for its own reason. The
  repair scopes the delivery count by recipient address, every actor carrying a
  fresh uuid, rather than scoping the poll, which is the specification, or
  disabling file parallelism, a whole-suite cost paid for six files. It was
  written from a code reading and could not be reproduced on this machine,
  which has neither Docker nor a TEST_DATABASE_URL, and the harness comment
  says so. It is measured now: the postgres:18 leg is green on this branch,
  which is the leg the defect could only ever have appeared on, and the first
  time that leg ran in this package's life.
- **Four disclosures ratified at the P7 merge review, none of them routed.**
  The trigger union keeps its `{ kind: 'reminder' }` arm with its prose
  corrected, ruled at the third change control and executed by the Scheduling
  engineer's return; 8.6 names five triggers and a union naming four is the
  worse lie. The pass decides a fourth skip case, `no_recipient_address`, which
  8.6 does not name; it is ratified and 8.6 now records it, because a behavior
  the code performs and the specification omits is a deviation whatever its
  reachability. The code's defence was verified against migration 0000 rather
  than taken: `users.email` is genuinely nullable, for 8.10's scrub alone, and
  R-CLEAN unassigns that user's tasks before the scrub, so the branch is
  unreachable wherever account deletion ran whole. Treating it as the
  unassigned skip is right for the reason 8.6 gives that one, there being no
  one person to deliver to, and throwing would take down every other reminder
  in the batch for one unreachable row. Sending is gated on NODE_ENV ===
  'production' plus all three provider variables, which is fail-safe in the
  direction that matters, an unset value logging rather than sending, and it is
  not silent: an unconfigured production boot logs one line naming the missing
  variables and every suppressed send logs its own. What it is not is alerted,
  so a host that never sets them logs every reminder forever and only a reader
  of logs would know. That is P10's to close, 10.7's launch checklist being
  where the sending domain, SPF, DKIM and DMARC are set up, and it is recorded
  here as the revisit trigger rather than fixed in a package whose gate cannot
  observe a real delivery. And the branch adds one private copy each of
  `rowsOf` and `inTransaction`, both in the scheduler's new `pass.ts`, tagged
  for the P9 consolidation the existing copies already carry; the count is
  corrected from report by measurement, `rowsOf` now standing at four
  definitions and `inTransaction` at three rather than five apiece.
- **No frozen-text hold was owed at this merge, which is worth stating so it is
  not read as an omission.** Three frozen edits landed on this branch, 7.9's
  response body, 7.9's past-instant qualifier and 7.6's mirror clause, and each
  was read in a second context before the work that depended on it, which is
  the standing lesson from the P5 merge. Frozen section 4 was not touched at
  all. Section 7's whole diff is nine inserted lines and one changed bullet,
  and that bullet is 7.9's PUT taking the qualifier the owner ruled.
- **P7's third change control, 2026-08-10, after the endpoint shape review.**
  8.5's copy arm wrote a state 8.6 forbids and the loop delivered it.
  `copyReminderToSuccessor` computes the right state through `planReminder`,
  then hardcodes 'scheduled', NULL at the INSERT and discards the answer, and
  falsifies its own return value the same way. The implementation is faithful:
  8.5's pseudocode named the state flat, so 8.5 is what disagreed with 8.6.
  It is a live defect rather than a harmless override, because the loop selects
  state = 'scheduled' with fire_at <= now() and skips only beyond six hours, so
  a row written scheduled with a past instant inside that window is mailed on
  the very next tick. The comment defending the override, that the loop reaches
  the same answer one tick later, is true beyond six hours and exactly inverted
  inside them, which is where ordinary values land: 4.8 admits offsets up to
  10080 minutes, so a daily task due 09:00 whose reminder leads by a day,
  completed at 10:00, puts the successor's instant an hour in the past and the
  next tick mails a reminder for a deadline that has not arrived.
- **The rule is generalized into 8.6 rather than qualified in a fourth
  section.** This is the second appearance of one defect shape on one row.
  Frozen 7.9's unqualified PUT bullet was the first, escalated at the first
  change control and ruled by the owner; both are a path that computes an
  instant and then names a state instead of reading the one the instant earns.
  8.6 had written the rule as a property of the recompute alone, and that
  narrowness is what let three other writers each restate or ignore it, so the
  fix is one sentence governing every path that writes the column, with 8.5's
  line pointing at it instead of naming a state. The repository's own standing
  warning is that a rule stated twice will one day disagree with itself, and
  this rule already had, twice. Frozen sections are untouched: 7.9 keeps its
  qualifier as a client-facing clause consistent with the general rule rather
  than a second definition of it, and 7.6 needs none, saying nothing about
  state and correctly leaving it to section 8.
- **The class was measured rather than read, and it corrects the count.** There
  are five writers of the column, not four. The three API paths, 7.9's PUT and
  the reminder arms of 7.6's create and patch bodies, all reach it through one
  `upsertReminder` helper that writes `plan.state` and `plan.firedAt`, verified
  at `createTask`, `patchTask` and `putTaskReminder`. The recompute's own
  UPDATE writes them too. `copyReminderToSuccessor` was the only override, so
  the shape review's instance was the whole class, which is worth more than the
  fix itself: the same measurement would have found a second override had one
  existed, and none does.
- **AC-168 numbered, from the ledger's free number.** It pins the rule across
  the creating paths rather than per path, a per-path number repeating in
  section 12 the spread that caused the defect in 8.6. Nothing asserted this on
  any creating path before, so even the owner's 7.9 qualifier was unpinned:
  AC-148 deliberately confined itself to future instants, where the two
  readings agree. Its scheduler clause is what makes it more than a column
  check, the harm being that the poll matches on the stored value, and its
  future-instant control stops an implementation that wrote skipped
  unconditionally, which would satisfy every past-instant clause while
  silencing every reminder in the product.
- **The trigger union's reminder arm is kept, and only its prose is routed.**
  The shape review recommended against retiring it and the argument holds: 8.6
  names five triggers, a union naming four is the worse lie, the recompute
  handles the arm and the module's own tests exercise it. What is wrong is two
  comments naming PUT /tasks/:id/reminder as a caller the PUT provably is not,
  every write going through the upsert and a recompute after it taking a second
  clock reading, so an instant falling between the two calls would be scheduled
  by one and skipped by the other. The docstring also splits first write from
  overwrite, which the ON CONFLICT upsert does not. The module is the
  Scheduling engineer's, so the correction is routed to its return rather than
  made by the Steward; left standing it invites the next reader to restore the
  missing call and reintroduce the defect the upsert argued out.
- **The mirror arm reaches frozen 7.6, by owner ruling of 2026-08-10 on the
  change control's escalation.** The appended paragraph gains one sentence:
  setting due_time on a date-only task carrying a time_of_day reminder deletes
  it, for the same reason and in the same transaction, so 7.6 and 8.4 state one
  policy rather than half of one each. The reasoning the owner named as
  carrying it is 9.3's, that the reminder control switches mode with due_time,
  so a surviving row would render an offset picker over a wall time, a reminder
  the interface can neither show nor edit. No bullet moved through either of
  the two rulings this paragraph now carries, both being silences beside
  bullets that name a consequence for due_date and none for due_time.
- **The cascade criterion is AC-164, assigned from the cross-tree ledger on
  2026-08-10, and section 12's pending heading is retired.** The number was
  withheld while package P8 ran live in a second working tree with its own
  tester proposing concurrently, neither branch able to see the other. The
  coordinating session holds the ledger and settled it: P7 keeps AC-144 to
  AC-154, P8 takes AC-155 to AC-163 plus AC-165, one P8 file renaming because
  it had claimed AC-154 before that number was taken here, and AC-164 is free.
  Both arms are one criterion because they are one policy over one field, with
  a third clause as the control that keeps them from being implemented as a
  blanket over the column: a due_time moving between two non-null values
  cascades nothing and recomputes, which is AC-151's trigger. It is the one
  criterion in this package written after the implementation it tests, which
  AC-131 precedents and which a constraint outside the branch forced rather
  than anyone choosing; the cost is limited because both arms were fully
  specified in 8.4 and frozen 7.6 before the implementing session read either,
  so it tests a written rule rather than a silence. The tester return that
  writes it is no longer gated.
- **A PATCH that invalidates the reminder's mode deletes the reminder, both
  arms, 2026-08-10.** The first arm is the human owner's ruling on the P7
  engine session's escalation: clearing due_time on a task carrying an offset
  reminder clears the time and deletes the reminder. It is the one live route
  to a shape 8.6 cannot compute, the offset arm reading the task's due_time
  and there being none left to read. His grounds are the engine's own. 8.4
  already deletes the reminder when the date is cleared, so clearing the time
  is that action's smaller sibling and the two read as one policy rather than
  two; refusing with 422 blocks an edit the user is entitled to make over a row
  they may have forgotten; and converting the mode is the only option that
  silently changes when a reminder fires, by inventing a time of day nobody
  chose. 8.4 carries the substance, that section's subject being the cascade
  itself, with both arms written as code beside the clear-date one. Frozen 7.6
  carries the clause a client reads, appended with no bullet moved: those
  bullets name a consequence for due_date in both directions and say nothing
  at all about due_time, which is a silence and not a falsehood, so the form is
  the 7.9-response-body one rather than the `d7c81eb` one that qualified 7.9's
  PUT on this same branch.
- **The mirror arm is ruled with it, at the P7 change control rather than left
  for the session that would meet it next.** Setting due_time on a date-only
  task carrying a time_of_day reminder deletes that reminder too. It differs in
  one way, stated rather than hidden: this shape computes, 8.6's date-only arm
  reading the reminder's own time_of_day and never the task's, so the row would
  go on firing correctly and only 4.8's cross-table mode rule makes the pair
  illegal. It cascades anyway, for three reasons. The pair is one 4.8 says the
  API must not permit, and a task write that creates a shape the schema section
  forbids is incoherent whether or not the arithmetic survives it. 9.3 switches
  the reminder control's mode with due_time, so the form would show an offset
  picker over a row holding a wall time, a reminder the interface can neither
  render nor edit. And both alternatives here are the ones already rejected on
  the other arm. Ruling the two together is what makes this one rule rather
  than three, covering the date clear, the time clear and the time set. Only
  8.4 carries the mirror; its frozen 7.6 clause is escalated with a
  recommendation rather than written on the Steward's authority, this branch's
  standing limit on frozen sections 4 and 7. Two consequences are recorded for
  the call site so it does not derive them: the delete precedes any recompute,
  the callable throwing on a shape it cannot compute being correct as a
  backstop and wrong as a live path, verified in the engine's committed module
  rather than assumed; and a due_time moving between two non-null values
  cascades nothing and is the ordinary trigger AC-151 pins.
- **A criterion is owed for the cascade and its number is deliberately
  withheld.** Both arms belong to one criterion, being one policy over one
  field. Nothing today asserts any of it: AC-028 covers the date clear and
  stops there, so an implementation that refuses the edit with 422, or leaves
  an uncomputable row standing, or reaches the recompute and throws, passes
  every existing number. The number is not assignable on this branch, because
  package P8 is live in a second working tree and its tester session is
  proposing criteria from AC-155 onward, having been told P7 took AC-144 to
  AC-154, and neither branch can see the other; guessing here is how two ranges
  collide. Section 12 records it as owed with the number pending, which is
  where a reader checks whether a ruled behavior has one. The coordinating
  session assigns it before P7's merge review, and the tester return that
  writes the test is gated on that.
- **8.6's fired_at consequence is widened from the sent case to both terminal
  states, 2026-08-10, on the tester return's routing.** The ruling of the
  mid-package change control recorded that where one of the four non-timezone
  triggers returns a sent row to scheduled, fired_at is cleared with it, so
  frozen 4.8's note that the column is set when state leaves scheduled stays
  true of every row rather than of most of them. The tester return observed
  that a skipped row revived by those same triggers falls outside those words
  and keeps a stale fired_at, so the narrow wording did not merely omit a case,
  it defeated its own reason: it left exactly one row shape uncovered, a
  scheduled row holding a fired_at, which is the shape the sentence exists to
  rule out. The recommendation is taken in full. A skipped row carries a
  fired_at like a sent one, set by the delivery loop when it skips and required
  by 4.8's note when a recompute skips, and neither terminal state is a
  delivery that happened, so nothing distinguishes them at this point; the
  distinction the ruling does draw, between the timezone trigger and the other
  four, is a separate sentence and is untouched. It is ruled now rather than at
  the merge because the Scheduling engineer implements the five-trigger
  callable next and would otherwise decide it alone or stop and ask. The
  routing itself is worth recording: the return asserted the sent case, where
  the ruling's words reached, and declined to assert the skipped case rather
  than read one step past a ruling its own file cites, which is the separation
  role 11 exists to hold.
- **P7's mid-package change control, 2026-08-10, after the tester session.**
  Six items, opened by the four findings that session raised. State re-derived
  on this tree before ruling any of them: 179 files, 1341 tests, 68 failures,
  every failure an assertion in the eighteen files the tester added, which
  matches its own report exactly. Its four commits touched twenty-three files
  and every one is under `app/tests/`.
- **Frozen 7.9's PUT bullet takes a past-instant qualifier, by owner ruling of
  2026-08-10 on the tester's finding.** The bullet said "state resets to
  scheduled" without condition while 8.6 sets state = skipped when a recompute
  lands in the past and never fires retroactively, and a PUT is a recompute
  trigger by 8.6's own list, so both sentences governed the same call and
  answered differently. Skipped wins and 7.9 takes the qualifier rather than
  8.6 being amended. The grounds, verified through 8.6's loop rather than
  reasoned from the two sentences: the poll selects state = 'scheduled' and
  fire_at <= now() and skips only beyond six hours stale, so a scheduled row
  with a past instant inside that window is delivered on the very next tick,
  which is exactly the retroactive fire the same section forbids. Reading the
  bullet literally does not merely disagree with 8.6, it makes 8.6's own rule
  unreachable, and that is what settles which of the two texts is wrong. The
  form is `d7c81eb`'s and not 7.5's, the distinction the P6 merge review
  recorded: appending beside a bullet governs one that is already true, and
  this one was not, so the changed span is exactly the untrue clause and
  everything before it, "computes fire_at (section 8.6)" included, is
  byte-identical. The DELETE bullet is untouched. One check the P6 precedent
  requires comes out differently here and is recorded rather than waved past:
  the old phrasing is quoted twice, in assertion messages in
  `ac-148-reminder-upsert-state.test.ts`, where 7.6's bullet phrasing had
  occurred exactly once. Both cases use future instants and stay correct, so
  nothing goes red, and the quotations ride the tester return.
- **AC-144 to AC-153 numbered, all ten taken whole and none declined, and
  AC-154 added from this change control's own ruling.** They change no existing
  number and so invalidate no criterion, which is what placed them with the
  Steward rather than the human owner; AC-125, AC-133 and AC-142 are the
  precedent for a batch authored on the branch and numbered additively.
  AC-144 and AC-145 close section 13 item 25 the way its expectation named,
  splitting AC-083 to AC-086's tzdb arithmetic from the two rules where the
  standard has no answer. AC-146 to AC-150 close five of the six floor
  surfaces the P7 row listed, the sixth being inside AC-089 where its own text
  puts it. AC-151 to AC-153 come from the sentence that made that list a floor.
  One wording change on transcription and only one: AC-148's instant is stated
  as future, because the same change control qualified frozen 7.9 and an
  unqualified "state returns to scheduled" would now be wrong for a past
  instant; its test already uses future instants in both cases, so no
  assertion moves and the two texts agree on arrival rather than meeting later.
- **A delivered reminder is not revived by a timezone change, ruled into 8.6
  and numbered AC-154.** The tester escalated the silence and asserted neither
  reading: frozen 7.1 scopes PATCH /me's recompute to "scheduled reminders on
  tasks assigned to V" and AC-086 says "scheduled fire_at values", while 8.6's
  reset clause names no state it resets from, so a delivered row read the
  second way returns to scheduled and the loop mails it again. The timezone
  trigger takes the narrow reading and no frozen text moves, 7.1 having said
  so all along where 8.6 merely did not restate it. The tester's recommended
  ground, that a sent reminder is history, is deliberately not the ruling's,
  because generalized to all five triggers it is wrong: the other four change
  the occasion the reminder is about, its deadline through due_date or
  due_time, its lead time through the reminder's own value or mode, or the
  person owed it through assignee_id, and a user who pushes a deadline out a
  week and then hears nothing has lost a reminder they can still see
  configured on the task, which is why the reset names no starting state and
  why frozen 7.7 scopes its due_date recompute to none either. A zone change
  alters neither the deadline nor the recipient; it re-expresses an unchanged
  occasion on a different wall clock, so reviving for it sends one person the
  same reminder about the same deadline twice, which 8.6's at-least-once
  tolerance covers as a crash artifact and never licenses as a design. Two
  consequences are recorded rather than left to be re-derived three times:
  skipped rows are outside the timezone trigger too, 7.1's scope taken at its
  word and a narrow loss since a skipped instant is already past and the row
  is recomputed by the next change to the task's own dates; and where one of
  the other four does return a sent row to scheduled, fired_at is cleared with
  the reset, so frozen 4.8's note that fired_at is set when state leaves
  scheduled stays true of every row rather than of most of them. AC-154 is the
  AC-124 and AC-141 shape, settled text quoted with only its test routed to
  the Adversarial Test role, and it is worth a number because the wrong
  implementation is the shorter one, is invisible in every other criterion,
  and fails by mailing a real person a duplicate about a deadline that did not
  move.
- **The scheduler's test seam is ratified into 11.7 rather than routed to the
  Platform session that has not yet run.** 11.7 makes the pass a plain
  callable and frozen section 7 offers no endpoint that runs one, so it is the
  acceptance suite's only way in and the delivery criteria could not otherwise
  be written at all. Three things decide it. Section 11's text is the
  Steward's change control and not Platform's, which that persona's own Owns
  section states. The precedent is exact: 11.10 ratified options.notifications
  when the same need appeared for observing sends. And routing it does not
  defer the decision, it defers it to a session with more sunk cost, since
  eighteen files already load the module and a different name makes every one
  of them fail on a module-load assertion. What is fixed is only what the
  suite must know in advance, the module path and deps of { dbClient,
  notifications } reusing 11.10's own option names, both already determined by
  that seam and by the scheduler directory Platform owns; the pass's
  internals, transaction shape and return value stay that session's. The name
  tolerance the tester wrote, `createReminderPass` or `runReminderPass`, is
  kept rather than narrowed, because the harness accepts both so no drift is
  possible in the suite and the choice is properly the implementer's. Recorded
  with it: the seam is not an HTTP endpoint, which would widen frozen section
  7 and which 11.7 contemplates only if hosting moves, and it is not a second
  production path.
- **11.9's closing DST sentence repaired, and item 25's coverage half closed.**
  It said AC-083 to AC-086 pin both DST rules of 8.6. Before the tester session
  that over-claimed, which item 25 recorded at the kickoff; after it, those
  four pin the zone arithmetic and AC-144 and AC-145 pin the two policy rules,
  one each and by name against the raw Luxon behaviors the same bullet
  describes. The sentence now says so and keeps the history rather than
  dropping it. Item 25 is marked closed on its coverage half alone: the
  anti-oracle unit tests, the fixture rule and the Luxon-upgrade revisit
  trigger are standing obligations, and the reason no oracle exists has not
  altered.
- **Package P7 of RFC 0001, reminders, kicked off on branch `p7-reminders` on
  2026-08-10.** The P7 row is traced into its session list in the form every
  package since P2 has carried, two kickoff questions are settled below, and
  the third is escalated to the human owner because any answer that closes it
  touches frozen 7.9. The row named two owners and the work needs six roles.
  Four of 8.6's five recompute triggers fire inside
  `03-collaboration-and-permissions.md`'s own endpoints, due_date, due_time and
  assignee_id through PATCH /tasks/:id and the reminder's own value and mode
  through the endpoint its Owns section already names, and the fifth, the
  assignee's users.timezone, fires inside `06-security-and-privacy.md`'s auth
  module at the login sync and at PATCH /me. That role's persona mentions
  reminders nowhere, and what makes the call site its own rather than a
  widening of its mandate is that frozen 7.1 already charges PATCH /me with the
  recompute in its own text; AC-086 asserts the trigger by number. The
  tiebreaker is the P6 generation hook's, so `02-scheduling-and-time.md` owns
  the recompute as one transaction-taking callable and every caller invokes it
  inside its own transaction rather than restating arithmetic, and the
  reminders seam of `docs/team/README.md` now names where each trigger fires,
  that having been the one seam of this package that no file named. Two things
  the row did not name ride it, both deferrals with their computation attached:
  the reminder arm of frozen 7.6's two write bodies, the last of the two arms
  `app/src/shared/tasks.ts` has carried a comment for since P3, and the
  reminder-copy arm of 8.5's generation that P6 left as a comment in its own
  module. No Data session is owed, migration 0000 carrying every table and
  4.8's partial index, and the one access path this package adds that is not
  the poll already leads with `tasks_assignee_status_due_idx`'s first column.
  No Query session is owed for Q11: it is one predicate with no ordering, cap
  or cursor, its home is Platform's scheduler pass, and 11.7 rather than
  section 6 specifies how it claims rows, which makes it the fourth internal
  query implemented by whoever owns the path it lives in, after Q9 and Q10 at
  P2 and Q12 at P5.
- **What checks the DST arithmetic, ruled at the P7 kickoff and recorded as
  section 13 item 25.** Item 4's P6 strategy does not carry over and no oracle
  should be sought, which is worth stating because the absence would otherwise
  read as an omission. An oracle adjudicates where two implementations of one
  standard should agree; 8.6's two rules are policy chosen where the standard
  is silent, a nonexistent local time having no correct answer and an ambiguous
  one having two, so no library implements them. Luxon is worse than absent,
  being an anti-oracle for exactly these two cases per 11.9, and 11.15
  forecloses the cheapest substitute, Intl.DateTimeFormat being Luxon's own
  engine rather than an independent one, so that comparison would be circular.
  A second date library was considered and rejected: it would agree with Luxon
  on the offsets, disagree with the module on the policy, and re-report what
  11.9 already records, at the cost of a dependency. Three things are owed
  instead. The fire-instant module's own unit tests assert raw Luxon and the
  module in the same test, so each override is proven necessary rather than
  assumed, on the shape of items 16 to 18 and with a Luxon upgrade as the
  revisit trigger; protocol section 8 puts them there rather than in the
  acceptance range, which is where P6's oracle suite sat for the same reason.
  The acceptance range must instantiate both rules, which today it does not
  require: 11.9 closes by saying AC-083 to AC-086 pin both, and none of the
  four names a gap or a fold, AC-083 running in Asia/Karachi which has observed
  no DST since 2009, AC-084 naming no zone, AC-085 moving a due date and AC-086
  changing one. Two of them can carry a DST fixture without straining their
  text, so the coverage is possible and optional at once and that sentence in
  11.9 over-claims until the tester closes it; whether the cases arrive as
  numbers of their own is that session's proposal at a change control, and the
  recorded expectation is that they should, because 11.9 points at numbers and
  a reader checking coverage by number finds nothing. And every fixture on both
  sides uses historical transition dates in zones stable for decades, never a
  future date and never a recently changed zone, because the Node runtime and
  the embedded engine of 11.10 carry tzdb copies that can move independently
  under a CI runner.
- **8.6 gains one paragraph: the creator's zone is a fallback for the
  computation and not a sixth recompute trigger.** An unassigned task's
  reminder is computed from its creator only because 4.8's NOT NULL fire_at
  admits no row without an instant; the delivery loop skips an unassigned task
  at fire time, and assignee_id is itself a trigger, so such a row either never
  fires or is recomputed in the new assignee's zone before it does. A creator
  who travels moves nothing any user can observe, and following them would add
  a write path with no reachable effect. Recorded because three sessions of
  this package read the computation's two arms against the trigger list's one
  and could reconcile them three ways.
- **The 7.9 response-body ruling, entered by the human owner on 2026-08-10.**
  He took the recommendation below in full and in its own terms, declining both
  alternatives on the grounds it carried: PUT /tasks/:id/reminder answers 200
  with the affected TaskDetail, it is 7.7's case rather than 7.4's, and a bare
  reminder object would either echo the request or widen to expose fire_at and
  state, which no frozen response carries anywhere in section 7. It is
  transcribed onto frozen 7.9 as one appended paragraph, both existing bullets
  byte-identical, the form 7.5, 7.6, 7.8 and 7.10 all carry. Nothing else in
  section 7 moved, and the DELETE is untouched and still answers no body. No
  acceptance criterion is invalidated: nothing in the repository calls this
  endpoint, and AC-090's PUT clause asserts a 422 that no answer to this
  question reaches. The conditional Steward session in the P7 trace is done,
  and the tester session it gated is now startable.
- **Escalated at the P7 kickoff on 2026-08-10, and ruled the same day by the
  entry above.** Frozen 7.9's PUT /tasks/:id/reminder
  names no response body: it says "200" and stops, while its DELETE says 204
  and carries none. This is the silence frozen 7.2 carried for PATCH
  /me/settings, escalated at P2S and ruled by the owner, and every comparable
  surface has since been settled the same way: 7.1's PATCH answers the /me
  object, 7.2's answers the settings object, 7.4's mutations answer Folder, and
  7.7 and 7.8 each answer the affected TaskDetail by the ruling at the P3 shape
  review. The Steward's recommendation is 7.7's answer rather than 7.4's: PUT
  answers 200 with the affected TaskDetail. 7.0 gives the reminder no object of
  its own, 7.9 offers no GET for one, and TaskDetail already carries a reminder
  field, so the parent task is the only object in the frozen catalogue that
  reports what the call did, and it reports the write's whole effect rather
  than a fragment of it. The two alternatives, stated fairly. A bare reminder
  object is the narrower answer and the one an implementer reaches for first,
  but the frozen catalogue holds no such object, so it would either echo the
  request, TaskDetail's reminder carrying exactly the two 4.8 mode columns the
  request sent and nothing else, or invent a wider shape carrying fire_at and
  state, two columns no frozen response exposes anywhere in section 7. The
  first is worthless and the second is a new object in a frozen catalogue,
  which is the per-endpoint variant the API role exists to prevent. Leaving the
  silence as it stands is not free: the route must return something, and an
  unstated something is chosen twice, once by the schema session and once by
  the routes session, which is the drift the freeze exists to stop, while the
  tester can assert no body at all. The one honest argument for it is that
  DELETE's 204 sits beside PUT's 200 in the same two-line section, so the
  asymmetry may be deliberate rather than an omission; against that, 7.2 read
  the same way at P2S and was ruled an omission, and a 200 that carries nothing
  is spelled 204 everywhere else in this contract. Whatever is ruled is
  transcribed onto frozen 7.9 as an appended paragraph leaving both existing
  bullets byte-identical, the form 7.5, 7.6, 7.8 and 7.10 all carry, and it
  lands before the tester writes for the P4 and P6 reason: an acceptance test
  citing a ruling the specification does not carry is a debt every later
  session inherits. No criterion is invalidated by any of the three answers;
  nothing in the repository calls this endpoint.
- **Package P6 of RFC 0001, recurrence, kicked off on branch `p6-recurrence`
  on 2026-08-10.** The P6 row is traced into its session list in the form every
  package since P2 has carried, three kickoff questions are settled below, and
  the fourth, the zone of generation's cutoff, was escalated to the human owner
  and is now ruled, any answer that closes it touching frozen 7.6: 8.5 computes
  cutoff = max(t.due_date, current_date(actor.tz)) and the four transition
  endpoints carry no parameter a zone could ride, which 8.1's first bullet
  calls an incomplete surface rather than an invitation to substitute the
  stored zone, and 8.1's second bullet reserves users.timezone for reminder
  computation alone. The Steward's recommendation, carried with the
  escalation: complete and abandon gain an optional tz query parameter, an
  IANA identifier through the shared validator, the shape frozen 7.8's pull
  took by the 2026-08-08 ruling; a present invalid value answers 422 naming tz
  always, per 7.0's parameter rule; an absent one answers 422, and the
  transaction changes nothing, exactly when the transition would run
  generation, the winning update on a pending row carrying a recurrence_rule.
  Uncomplete and restore gain nothing, the shape of 7.8's DELETE, because
  G-SERIES reads series shape and evaluates no calendar date. The
  required-always scope was not recommended because it refuses requests that
  evaluate nothing and turns every existing tz-less transition call red,
  including P3's passing files, buying no correctness on rule-less rows; the
  stored-zone reading was not recommended because 7.8's appended paragraphs
  record precisely that alternative rejected as blessing the defect, with the
  P4 CI failure as its measured cost. State-conditional 422s are already this
  contract's shape, a due_time sent alone being legal against a dated row and
  refused against an undated one.
- **The cutoff ruling, entered by the human owner on 2026-08-10.** He took the
  recommendation above in full and in its own terms, so the rule the
  specification now carries is exactly the one argued for above: the parameter
  on complete and abandon only, invalid always refused, absent refused exactly
  where generation would run, uncomplete and restore untouched. Frozen 7.6
  gains three appended paragraphs in the form 7.8 and 7.5 carry, every existing
  bullet byte-identical: what the two endpoints now take, then why it was
  missing and what it cost, then what does not move. The middle paragraph is
  deliberately not written as 7.8's was. The pull's cost was measured, an entry
  dated in the account's zone while My Day grouped it by the request's, with a
  CI failure at 22:00 UTC to date it; this one is prospective, because P3
  deferred the recurrence_rule arm of 7.6's write bodies, so no row this API can
  create carries a rule and no implementation has read a zone here yet. The same
  defect is being closed before it is built rather than after it broke a suite,
  and saying so is the point: a paragraph claiming a measured cost it does not
  have would be the drift this role exists to catch. Section 8.5 gains one
  sentence binding actor.tz to the request's zone, and the reason it is one
  sentence rather than none is recorded with it. No acceptance criterion is
  invalidated, verified rather than assumed: `seedRecurrence` has two callers in
  the whole repository, AC-028's fixture and one 03 unit test, and both only
  PATCH, so nothing that passes today transitions a row carrying a rule.
- **Package P6 of RFC 0001, recurrence: the 4.11 iterator and validator, 8.5's
  generation, 5.1's G-SERIES guard, and the calendar's ghost projection.** The
  grammar is one pure module in `app/src/shared/recurrence.ts`, parse and
  validate with no evaluation, so the write path's 422 and the iterator's
  evaluation read one definition of the subset; the iterator beside it in
  `app/src/server/time/` evaluates floating civil dates and touches no clock
  and no zone. Generation runs inside the winning transition's own
  transaction, which is what makes it exactly-once under a race, and the
  G-SERIES guard runs ahead of un-complete and restore. The calendar's virtual
  array, which has answered empty since P4, is filled from its own fetch
  rather than from the range-bounded real rows, because a series anchored
  before the requested range still projects into it. Frozen 7.6's two deferred
  write arms are wired, so a recurrence_rule now reaches the database
  validated, and the transition envelope's `generated_task` and
  `deleted_successor_id` answer non-null for the first time since P3 froze
  their keys. AC-071 to AC-082 and AC-142 and AC-143 pass by number beside
  every earlier range: 1240 tests across 160 files, the whole gate green in
  CI's order, on PGlite and on postgres:18.
- **Frozen 7.6's transition bullet carries the parameter, by owner ruling of
  2026-08-10 on the endpoint shape review.** It reads
  `POST /tasks/:id/complete?tz, /uncomplete, /abandon?tz, /restore`, and
  nothing else in the bullet or in the three paragraphs appended earlier that
  day moves. The shape is deliberately not this branch's other frozen edits:
  the convention of leaving bullets byte-identical governs appending a
  behavior paragraph beside a bullet that is already true, and a bullet that
  omits a parameter the endpoint now requires is not true. The precedent is
  exact, `d7c81eb`, where the same owner ruling on the same parameter changed
  7.8's pull bullet and appended its paragraphs beside it. Grounds: 7.8's
  bullet carries the parameter and 7.6's did not, every other query parameter
  in section 7 appears either in its bullet or in a sentence governing it, and
  the bullet's phrasing occurs exactly once across all of `app/` and `docs/`,
  the bullet itself, so no test or comment quotes it and no criterion moves.
- **Three accepted bets recorded in section 13, items 22 to 24.** A bare
  FREQ=MONTHLY anchored on the 29th to 31st skips the months too short to hold
  it rather than clamping, which is item 15's choice one frequency down and
  falls out of the same existence check; 4.11's exclusion of BYMONTHDAY 29 to
  31 never reaches it, because the anchor comes from due_date rather than from
  the rule. The calendar response is bounded by its 62 days and nothing else,
  and ghosts multiply that bound by the number of accessible rule-carrying
  series rather than adding to it, which was theoretical while the array
  answered empty and is real from this package; the owner ruled to record the
  bet rather than amend 7.10, since no shape can report a truncation the
  frozen body has no key for. And Q3C's second statement applies the
  recurrence rule as a filter over a predicate 4.12 names no index for, which
  is item 21's situation again and went through the same two doors, justified
  on the EXPLAIN record rather than routed to Data. Each carries its revisit
  trigger, and items 15 and 22 now point at each other so the one-sentence
  amendment to 4.11 they are both waiting for carries both.
- **Two disclosures ratified at the P6 merge review, both recorded in the code
  with their reasoning before they were routed.** `app/src/server/time/executor.ts`
  is a fourth private copy of the row and transaction adapters, and it is
  accepted on the argument it was disclosed with: importing `domain/db.ts`
  would point the engine module at the module that calls it, and structural
  typing makes the duplication cost nothing at the call site, since the
  executor a caller already holds satisfies the interface without an adapter.
  The fix is a shared home none of these roles owns, so it stays the P9
  consolidation the other three already carry, and the P9 row now names all
  four rather than leaving the count in a comment. And the acceptance
  harness's `countRows` now asserts its contract instead of returning NaN.
  That helper is shared with more than forty callers across four packages,
  which is a wide blast radius taken deliberately and the right trade: three
  P6 call sites had passed a query that could not answer it, and in one of
  them both sides of a before-and-after comparison were NaN, which `Object.is`
  makes equal, so an assertion that a refused create writes no task passed
  while reading no count at all. A test that cannot fail is the failure this
  suite exists to prevent, and the repair was verified by scanning all 46 call
  sites rather than by trusting the report.
- **P6's mid-package change control, 2026-08-10, after the tester session.**
  Three things settled, one of which the engine session was waiting on.
  **AC-142 and AC-143 are numbered** from the tester's proposals, taken whole
  the way AC-125 to AC-130 and AC-133 to AC-140 were, and the specification
  index now reads AC-001 to AC-143. AC-142 asserts the cutoff-zone ruling the
  owner entered earlier the same day, which no number touched: every criterion
  in the existing P6 range is satisfiable from the wrong zone for most of any
  day, because a due date dominates the max in AC-072 and AC-075 and a cutoff
  one day early still lands on the same instance in AC-073 and AC-074, so an
  engine reading users.timezone passes the whole range and fails inside it only
  when a run crosses the window where the two zones disagree. That is AC-132's
  hole one package on, and the P4 sessions that chased it before the pull's
  zone was ruled are what it costs. AC-143 asserts that a series anchored
  before the requested range still projects into it, the surface the kickoff
  routed to the tester to judge rather than pre-deciding; AC-082 cannot catch
  the violation because its own current occurrence sits inside its grid, the
  wrong implementation is one line shorter than the right one since the
  endpoint already fetches real rows bounded by the range, and the failure is
  silent, emptying every month-ahead view while nothing errors.
- **UNTIL is the RFC 5545 DATE form, YYYYMMDD, recorded in 11.9 as a reading
  of frozen 4.11.** 4.11 defines recurrence_rule as an RFC 5545 RRULE value
  string, and within an RRULE that value's DATE form carries no separators, so
  the extended spelling is not a valid value string of the RFC the frozen text
  names: admitting it would widen 4.11 rather than read it, which is why this
  did not need to reach the human owner. Two grounds beyond the tester's.
  4.11's own "only strings the preset builder can produce are valid"
  forecloses accepting both spellings independently, a builder emitting one,
  and two spellings of one rule would put two representations of one series in
  one column. And the index's conventions line governs the dates this
  specification writes and its wire fields carry, both of which stay extended
  and both of which are ISO 8601 either way; the interior of a value string
  another standard defines belongs to that standard. It is recorded in 11.9
  rather than section 12 because 11.9 is what the Scheduling persona is
  instructed to open before writing the iterator, and stating it in both places
  is how the two would eventually disagree.
- **A month zoom requests six whole weeks, recorded in 9.5 with a pointer from
  Q3C.** The range is the client's to request and Q3C answers whatever range it
  receives, so the query specification gains a pointer rather than a rule: a
  padding rule inside section 6 would be a viewport decision sitting in a
  section whose every other sentence the server enforces, and the server cannot
  distinguish a padded grid from any other 42-day range. What is genuinely owed
  is in section 9, where page structure lives. The count is fixed at six
  because AC-082's third clause is positively observable only on a grid
  reaching past the month end, and this was re-derived here rather than taken
  from the report: for July 2026 the next instance after the 27th is
  2026-08-03, which the Sunday and Monday five-week grids (ending 2026-08-01
  and 2026-08-02) both miss and the six-week grids (ending 2026-08-08 and
  2026-08-09) both reach. The week count decides assertability and the week
  start does not, correcting the reasoning the proposal carried while leaving
  its recommendation standing. The product wants the same grid the criterion
  does, since a month view stopping at the month end hides the next occurrence
  of every series whose successor falls in the first days of the next month,
  which is what a ghost exists to show. The week start is left to the designer
  and the 11.13 screens, because nothing in the specification turns on it.
- **Three P6 kickoff rulings, 2026-08-10, grounds recorded here.** The 4.11
  validator is one pure grammar module at `app/src/shared/recurrence.ts`,
  parse and validate only, authored and owned by the Scheduling role under a
  by-file ruling, the P2 routes-directory precedent applied to `src/shared`:
  the format semantics are that role's own by the three-owner 4.11 seam, one
  grammar must serve the write-path validator and the iterator's evaluation or
  the split re-creates the drift the shared-schema comment exists to prevent,
  and `src/shared` is the one directory the schema arm, the iterator, and the
  client's convenience validation all import; the API role wires it into its
  own `tasks.ts` in front of the recurrenceRule primitive, so the deep 422
  arises in the schema layer where every other 10.3 field error does. The
  reminder-copy arm of 8.5's generation defers to P7 with the 8.6 computation
  it requires, the P3 row's deferral precedent: no reminder row exists without
  a computed fire_at, both DST rules are P7's explicit obligations pinned by
  AC-083 to AC-086, no P6 surface can attach a reminder, and no criterion in
  AC-071 to AC-082 asserts the copy, so a provisional instant would half-build
  the next package's module in the same seat that delivers it properly one
  package later. And AC-072 to AC-075 are asserted by their content on the run
  date rather than at the July 2026 dates they quote, the P4 closest-faithful
  ruling on AC-046 and AC-050 applied again and recorded in section 12 beside
  the range, with AC-082 deliberately outside it, seeded history evaluating no
  today, plus the two fixture facts a padded month grid and the projection
  fetch scope depend on.
- Package P5 of RFC 0001, sharing: the whole of frozen 7.5 and 7.3, invites
  with their five transitions and two lists and the roster with its one
  removal, plus the account deletion transaction of 8.10 landing whole for the
  first time. The 10.3 member cap now binds every membership 8.7 grants,
  conversion and acceptance alike. A bare invite to an existing connection is
  refused rather than parked, by owner ruling, the folder being what separates
  a conversion from a refusal. The deletion transaction runs its eight steps in
  one transaction across the seam that puts steps 1 to 6 in a domain module and
  the scrub and session destruction in the auth module, so an account cannot be
  scrubbed while its folders are still owned or its sessions still authenticate.
  Merged at `11d83fe`. The full gate is green at 1051 tests across 137 files,
  AC-059 to AC-069, AC-124, and AC-133 to AC-141 passing by number beside every
  earlier range, on PGlite and on postgres:18, verified on the merge commit
  itself and not only on its parents.
- **How P5's last four sessions ran, recorded because it changes what the
  review is worth.** The call swap, the boot wiring, the shape review and the
  pre-merge pass ran as four personas inside one unattended chat rather than as
  four separate sessions. The file-write boundaries held: each phase wrote only
  what its Owns section claims, Phase 2 declined to annotate a ledger entry that
  was not its to annotate and handed it on, and Phase 1 left a prose defect in
  another role's file untouched and recorded it instead. What did not hold is
  the independence the Steward exists for. Protocol section 3's second
  structural rule says an integrator reviewing their own work is not an
  integrator, and a Steward pass over three phases produced in the same context
  is exactly that: when it confirmed the shape reasoning and the two test
  repairs, it was the same reasoning agreeing with itself. The independent
  check that did hold is the acceptance suite, authored by earlier sessions with
  no knowledge of how the implementation would work, which is what the 66 reds
  turning green actually measures. The four settled wire shapes are the weakest
  point for the same reason: the suite deliberately does not pin those inner
  objects, so the only things checking them are the schema and the contract test
  that agree by construction. That is why they were routed to the owner rather
  than ratified silently, and it is the argument for running the remaining
  packages' review passes in their own contexts.
- **The five P5 settlements are entered into the frozen text by owner ruling,
  2026-08-10**, closing the escalation the pre-merge pass routed to him hours
  earlier. He accepted the Steward's recommendation. The amendments ride the
  branch so the transcription merges with the package it describes, the P1 and
  P2 precedent. Frozen 7.5 gains a "Response shapes" block in the shape 7.4's
  took at P2, carrying all four: the 201's object and the GET /invites/sent
  element are one nine-field object; decline, cancel and resend answer that same
  object in that same `{ invite }` wrapper; the conversion answers
  `{ converted_to_share: true, membership }` with 7.4's member element; and the
  acceptance response's folder is 7.0's full Folder object, with the reason it
  is not the `{id, name, is_default}` stub of the 2026-08-07 ruling written out,
  namely that a group heading and a just-acquired folder are different
  questions and neither reading generalizes to the other surface. Frozen 7.3 and
  7.1 each gain one paragraph for the email nullability asymmetry, each stating
  its own side and naming the other, so a reader who finds one cannot mistake it
  for a contradiction: 7.3's element is total because that section's own bullet
  excludes soft-deleted users, and stating it in the shape is what makes a lost
  `deleted_at` filter a failure rather than a null; 7.1's is nullable because
  that section carries no equivalent exclusion and the response reports 4.1's
  column. Every existing bullet in all three sections stays byte-identical; the
  three additions are paragraphs. No acceptance criterion is invalidated and no
  code changes, these being the shapes the routes already answer and the
  contract tests already pin.
- **`CLAUDE.md` is assigned to the Platform engineer by owner ruling,
  2026-08-10.** One line in `docs/team/10-platform.md`, beside the repository
  root's other operational files, closing the gap the pre-merge pass found when
  the file was edited on this branch at `6ead08e` by a session with no claim to
  it. Same shape as the ownership gaps the P0 merge closed for the Vitest
  configuration and the root dotfiles.
- **CI is green on the merge candidate, both database legs.** Run 31348592657
  on `2f2b55e`: 137 files pass on PGlite and 137 pass again against the
  `postgres:18` service (PostgreSQL 18.4), which 11.10 makes the
  production-fidelity authority. Recorded because the pre-merge gate was run
  locally and therefore saw only the embedded leg. The earlier red CI runs on
  this branch are the designed red of tests-first and not damage: the first
  green run is `1c649e1`, the mount, which is exactly where the suite first went
  green locally too.
- **One correction to the pre-merge report.** It observed that `main` is an
  ancestor of the branch and described the merge as a fast-forward. The
  ancestry is right and the framing is not: P0, P1, P2 and P4 each merged with
  `--no-ff` under the message `merge <branch>: package <Pn> of RFC 0001`, and P5
  follows them. A fast-forward would erase the package boundary from the first
  parent's history, which is the thing that convention exists to keep.
- **P5's pre-merge pass, which prepared the package without merging it.** The
  merge followed hours later, once the owner had ruled on both routed items, and
  is recorded above; this entry is the state that verdict rested on. The gate
  is green, measured by the Steward from `app/` in CI's order on branch tip
  `a4eebed`: lint clean, typecheck clean across all three projects, 1051 tests
  across 137 files with 1051 passing and none failing, build clean. All 21
  criteria the branch claims exist as tests by their numbers and pass: AC-059
  to AC-069, AC-124's acceptance arm, and AC-133 to AC-141. The verdict is
  READY. The merge itself is deliberately left to the human owner rather than
  taken on the Steward's authority, because P5 carries frozen-interface
  questions that are his and are recorded below, and because a merge is the one
  step in this package that cannot be undone by a further commit.
  Three sessions closed the package on the branch. The 8.10 call swap
  (`7bc9339`), which retires the P1 deletion stub and turns AC-134 to AC-136
  and AC-138 green whole. The boot wiring (`1c649e1`), mounting the invites and
  connections routers, which turns the rest of the range green. And the
  endpoint shape review (`a4eebed`). No owned-path violation occurred in any of
  the three, no dependency was added by any of them, and `app/tests/` was
  untouched after `c76687b`.
- **The four P5 wire shapes are ratified from disclosure**, the way 7.4's four
  shape sentences were at the P2 merge. Frozen 7.5 named four objects without
  enumerating them and the schema session left all four as loose floors; the
  shape review settled each against the route that answers, with its grounds in
  `app/src/shared/invites.ts` and a contract test in
  `app/src/server/http/invites-contract.test.ts` that parses the real
  `createApp`'s bodies and then checks them key-exact on the raw response. The
  201's object and the GET /invites/sent element are one nine-field invite; the
  conversion answers `{ converted_to_share: true, membership }` with 7.4's
  member element; decline, cancel and resend answer that same `{ invite }`
  wrapper; and the acceptance response's folder is 7.0's full Folder object.
  The third is ratified with the most attention, because it takes the opposite
  reading to the owner's ruling of 2026-08-07 for 7.10's grouped views, which
  gave that surface the `{id, name, is_default}` stub. The two do not conflict
  and the review argued why rather than asserting it: 7.10's ruling reasoned
  that a group heading needs what a card's folder label needs, and that
  Folder's counts, `is_owner`, `member_count`, `my_label` and `my_color` are
  7.4's business where a client that wants them already goes. An acceptance is
  not a heading. It is the moment a client acquires a folder it did not have,
  and those five are exactly what it then needs and cannot reach from this
  response, so the stub would force a second request for a folder the client
  learned about one line earlier, which is the round trip the
  mutation-answers-a-fresh-GET convention exists to prevent.
- **The email nullability divergence is ratified as a deliberate asymmetry**,
  not flattened. `src/shared/connections.ts` types the roster email
  non-nullable and `src/shared/me.ts` types the same person's email nullable,
  both citing the same fact, that 4.1's column is nullable only because 8.10's
  scrub empties it. The difference is in the frozen text rather than in two
  authors' taste, which is what makes it a decision instead of drift: frozen
  7.3's own sentence carries "excluding soft-deleted users", so non-nullable
  there transcribes a promise and is what makes a contract test notice a roster
  query that lost its `deleted_at` filter, while frozen 7.1 carries no
  equivalent clause, so `me.ts` reports the column. Each schema states what its
  endpoint promises, which is the level a response shape works at. One
  correction to the framing the divergence arrived with, and the reason the
  ratification is firm: `me.ts`'s schema is not test-only. Its inferred
  `MeResponse` is the auth module's return type, so flattening it to
  non-nullable does not weaken a test, it fails the build at
  `app/src/server/auth/account.ts:67`. Measured by making the change and
  running typecheck, then reverting, rather than reasoned about.
- **Routed to the human owner, blocking nothing.** Whether the four shapes
  above and the nullability asymmetry get their sentences in frozen 7.5, 7.3
  and 7.1, as every prior shape review's results were entered by owner ruling
  (7.2's PATCH body, 7.4's four sentences, 7.10's nine bodies and its stub
  reading). The Steward recommends recording them, and the reason is narrower
  than precedent: a reader who finds the 2026-08-07 stub ruling in frozen 7.10
  and no counterpart in frozen 7.5 will read the acceptance response's full
  Folder object as a defect rather than as the settled reading it is. Nothing
  in the code changes either way, which is why this does not block the merge.
- **Section 8.7's V-INV list gains the already-a-member clause**, closing a
  documentation asymmetry the Adversarial Test role observed while repairing
  AC-060 and recorded rather than escalated. Frozen 7.5's bullet has always
  enumerated that 409 and 5.3's add row and AC-060 both fix the behavior, but
  8.7's expansion of the same rule omitted it, so the list read as though a
  folder invite to a current member fell through to the conversion arm. The
  clause is transcribed from the frozen text into the position 7.5 gives it,
  between the folder guards and the task guard, which was verified to be where
  `createInvite` already checks it. No behavior changes and no criterion is
  invalidated. It goes in 8.7 and not in 7.5 because 8.7 is not frozen.
- **Ledger annotation, ruled so it does not recur.** The wiring ledger at
  `app/src/server/routes/README.md` is annotated by the Platform engineer "as
  its executor" under the P2 ruling, which fits every entry that asks the boot
  file for something. The 8.10 call swap entry was not one: its executor was
  the Security engineer, whose owned paths do not reach that file, so the only
  role that could report the work was the only role that could not write it
  down, and the entry read as an open request after the work had landed. Ruled:
  for a ledger entry whose request is not the boot file's, the executing role
  reports completion in its commit message and the Steward annotates the entry
  at merge. Platform's right over boot-file entries is unchanged, and the P5
  entry it did execute carries its own annotation and measurement.
- **The AC-060 and AC-138 repairs of `c76687b` are confirmed to have weakened
  nothing**, checked at this merge against what each criterion discriminates
  rather than against the repair's own account of itself. AC-060's release case
  moved from expecting a parked 201 to expecting the instant-share conversion,
  and it now asserts strictly more: the premise that the leave removed the
  membership, the conversion firing, the membership actually granted, and zero
  invite rows parked. What the case exists to prove, that the guard reads
  current membership rather than history, is sharpened rather than preserved,
  because a 200 there is the membership clause releasing and the clause behind
  it in V-INV's order running. It also pins the converse of AC-069, that
  leaving a folder leaves the roster connection intact, which nothing else in
  the suite asserts. AC-138 gained a third member so that the departure leaves
  two behind and R-CLEAN's INV-5 sweep does not fire over the assignment its
  first clause just cleared, which is a fixture change rather than a reading
  change: section 12's "readable by remaining members with the assignee
  cleared" is now literally what happens, plural included, and the file's own
  invariant sweep covers two members instead of one. The drop-to-one
  interaction the two-member fixture would have exercised belongs to AC-136,
  whose sentence names that sweep outright and whose fixture holds a folder
  that drops to one for it. Section 12 words AC-060 as the 409 alone, so no
  numbered criterion moved for either repair.
- **The P1 deletion stub is gone from the code**, confirmed by sweep across
  `app/src/` and `docs/`. `app/src/server/auth/account.ts` carried the only
  prose describing DELETE /me as carrying steps 7 and 8 alone, and the swap
  rewrote it. Two stale statements remain and are recorded rather than fixed,
  both in `app/src/server/domain/accountDeletion.test.ts`, which is the
  Collaboration engineer's file and not the Steward's to edit: its header says
  the route "still runs the P1 stub's steps 7 and 8 alone" and that the
  function "is reachable from no acceptance test at all", both true when
  written at `b43d9ec` and both false since `7bc9339`. Recorded for that role's
  next touch of the file. Section 12's own stale present tense, that AC-138's
  surviving-references half "fails today", was the Steward's and is fixed here.
- **One prose overstatement recorded, in the same file's neighbour.** The
  header of `app/src/server/domain/accountDeletion.ts`, and one sentence of its
  test, explain the step ordering as keeping `folders.owner_id`'s RESTRICT from
  firing "on step 7's scrub". It cannot fire there: RESTRICT guards a DELETE of
  the referenced row and 8.10 never hard-deletes the user row, which is the
  whole reason `tasks.created_by` survives. The ordering within steps 2 to 4 is
  correct and load-bearing for the reason the spec gives, that a folder with
  other members must be handed on before the folder rows are taken; only the
  clause naming the scrub as the thing at risk overstates it. No behavior is
  affected and the code is right. Recorded for the Collaboration engineer,
  alongside the item above, since both live in that role's two files.
- **An ownership gap, recorded rather than closed.** The repository root
  `CLAUDE.md` was edited on this branch at `6ead08e` to record the suite
  timings and two Vitest 4 flag traps, and no persona's Owns section names that
  file. The change is plainly right and sits where the file itself says such
  facts belong, so nothing is reverted. The gap is the same kind the P0 merge
  closed for the Vitest configuration and the root `.gitignore` and `.nvmrc`,
  and the natural home is Platform, whose Owns already carries the tool
  configuration files and the repository root's other operational files.
  Assigning it is a persona edit, which no session on a package branch should
  make casually, so it is routed to the human owner as a one-line addition to
  `docs/team/10-platform.md`, blocking nothing.
- **Carried forward from the P2 merge and still open**, both confirmed at this
  merge as untouched by P5 and blocking nothing: `app/src/server/domain/db.ts`
  remains the third private copy of the row and transaction adapters, for the
  P9 consolidation sweep, and `sessions.user_id`'s index still waits at the
  Data engineer on P9 evidence. P5 added no fourth copy; the two shapes it
  needed across the account-deletion seam are structurally identical, which is
  what let the transaction pass between the auth and domain modules without a
  cast.
- Section 12 gains AC-141 with that ruling, the bare invite to an existing
  connection answering 409 and creating nothing, the folder attached or
  absent being what separates it from AC-061's conversion. The edge was
  asserted by no numbered criterion in either direction, which is a good
  part of why it stayed open long enough to need a ruling, and a rule the
  specification states and nothing asserts is the standard AC-125 to
  AC-131 were admitted under. Appended rather than folded into AC-061,
  whose text does not move: AC-130 was widened for what can look like the
  same reason, but its two inputs are one rule of 7.0 whose two failures
  the owner made one answer, while these two inputs take different
  answers, a conversion and a refusal. AC-061 is the folder arm and is
  silent on the bare input rather than wrong about it, its consequent of
  a membership and a share-grant email having only ever described a
  folder. The test is routed to the Adversarial Test role, as AC-124's
  was when the Steward appended a criterion from a ruling rather than
  from a proposal, and P5's merge gate holds for it.
- A ruling of the human owner, Hassan, on 2026-08-09, closing the
  escalation P5's mid-package change control routed to him the same day.
  **A bare invite to an already-connected email answers 409.** He took
  option (b), the Steward's recommendation, over the Adversarial Test
  role's recommended (a), 200 with nothing created; the 201 fallthrough
  was also before him and was not taken. Frozen 7.5 gains a paragraph
  rather than a rewritten bullet, the shape 7.2 and 7.4 took, so the
  bullet text that rulings and tests already quote stays byte-identical:
  POST /invites answers 409 "already connected" when the email belongs to
  a roster connection of V and no folder is attached, and creates
  nothing. The conversion clause is folder-conditional and 8.7's V-INV
  now says so in its own order, which is where the gap was: the arm
  named its connected-email condition without naming a folder, while the
  instant share it describes creates a membership and only a folder
  defines one. Section 9.8 gains the People screen's copy, "You're
  already connected to this person. They're in your People list.", beside
  the remove-connection sentence already in that register. Recorded with
  the ruling, because it is the reasoning a later reader will want and
  not merely the outcome: the refusal is symmetrical with the 409 that
  section enumerates one clause earlier for a folder invite to an
  existing member, each answering a request whose whole purpose already
  holds; a 200 with nothing created would have been a third outcome
  where 5.2's create row parks an invite or refuses, and the one answer
  the inviter cannot read, since nothing enters the pending list 8.7
  makes visible and the roster already held the person; and the
  principle separating this from the 10.3 cap ruled at the same
  package's kickoff, where an invite against a full folder still parks,
  is to refuse when the request can accomplish nothing and permit when
  it can accomplish something later.
- An escalation routed to the human owner at P5's mid-package change
  control, 2026-08-09, wanted before the Collaboration session writes POST
  /invites and blocking nothing meanwhile. **A bare invite to an
  already-connected email has no specified outcome.** Section 8.7's V-INV
  conversion arm fires when the invited email belongs to an active user
  already connected to the inviter, conditioning on no folder being
  present, and its consequent creates a membership, which only a folder can
  define. It is routed rather than ruled because frozen 7.5 is silent on
  the input and every candidate answer either spends a status that section
  enumerates for a different outcome or invents one it does not: 7.5 writes
  the conversion as "response 200 { converted_to_share: true, membership
  created }", so answering 200 with no membership honors the status and not
  the consequent. Ruling it on the Steward's own authority would also
  contradict the ground recorded at this package's kickoff eight days of
  commits earlier, where the cap ruling was taken precisely because frozen
  4 and 7 were untouched by it. Three options, the second recommended:
  - (a) 200 { converted_to_share: true }, nothing created and nothing sent,
    reading the membership clause as folder-conditional the way the
    acceptance transaction's own membership arm already is. The Adversarial
    Test role recommends this: it keeps V-INV's order literal, invents no
    refusal for frozen 7.5, and a roster already holding the pair leaves
    nothing to create or send.
  - (b) 409 naming the existing connection. The Steward recommends this,
    departing from the proposing session. It is symmetrical with the 409
    frozen 7.5 already enumerates, "already a member": each refuses when
    what the request exists to create already holds, membership for a
    folder invite and connection for a bare one. It keeps the endpoint's
    outcome vocabulary, where 5.2's create row either produces a pending
    invite with one email sent or is refused, while (a) introduces a third
    outcome, a create that succeeds and makes nothing, which neither 5.2
    nor 7.5 describes. And it is the answer 8.7's own design implies: that
    section makes invite state visible to the inviter so a stranded invite
    can be repaired from the pending list, and a 200 creating no visible
    artifact is the one answer that defeats it, since nothing enters the
    pending list, the roster already held the person, and the inviter
    cannot tell a sent invite from a no-op. The principle that separates
    this from the cap ruled at the kickoff, where refusing creation was
    rejected: refuse when the request can accomplish nothing, permit when
    it can accomplish something later. A parked invite at a full folder
    becomes acceptable when a member leaves; a bare invite to a connected
    person can never become anything, its acceptance being an idempotent
    no-op on a connection that already exists. Its cost, stated plainly:
    one sentence in frozen 7.5's enumeration, and normative copy in 9.8,
    which the People screen needs under (a) as well.
  - (c) The literal fallthrough, reading the conversion arm as inapplicable
    where there is no share, so the endpoint answers its ordinary 201 {
    invite }. Recorded because it is the only option needing no amendment
    to frozen 7.5, so that leaving the text alone is seen to have a cost
    rather than being free. Not recommended: it parks a row whose
    acceptance is a pure no-op under INV-9's idempotent upsert, mails
    "invited you to connect" to somebody already connected, and puts that
    row on their login surface through Q12.
- Section 12 gains AC-133 to AC-140 by P5's mid-package amendment on branch
  `p5-sharing`, the eight the Adversarial Test role authored with their tests
  and proposed by number in their file headers. Six close the account
  deletion transaction of 8.10, whose steps AC-009 and AC-112 leave
  uncovered, one step's observable outcome each with steps 5 and 6 taken
  together: sent invites invalidated, ownership transferred by 8.9's rule,
  the default and sole-member folders deleted with their 8.8 cascades,
  remaining memberships removed through R-CLEAN including the drop-to-one
  INV-5 sweep, connections and My Day entries gone, and the scrub with the
  surviving references that the whole ordering exists to protect. AC-139
  pins 7.0's pending_invite_email against invites.task_id, the derivation
  P3 could only assert the presence of and the suite README has carried as
  a tolerance since. AC-140 is the sequential half of the kickoff's cap
  ruling, the concurrent half riding AC-124's member arm. Numbering
  additively is the Steward's, the AC-116 to AC-118, AC-119 to AC-123,
  AC-124, AC-125 to AC-131, and AC-132 precedent: an appended number moves
  no existing number and so invalidates no criterion. Two things are
  recorded with them rather than left in test headers. AC-138 reaches step
  7, which the kickoff did not route, and is admitted because the scrub
  alone would arrive green against the P1 stub while the surviving-reference
  half fails and discriminates the two implementations that make deletion
  easy by breaking it, hard-deleting the user row or nulling the history
  columns 4.5 holds under RESTRICT. And AC-140 rests on one reading of the
  kickoff ruling: an invite created against a full folder is not refused,
  because creation grants no membership, and it is that parked invite whose
  acceptance the cap then refuses until the folder has room.
- A ruling of the Integration Steward at the P5 kickoff, 2026-08-09, closing
  the question the AC-124 amendment parked in the P5 row: **the 10.3 member
  cap binds every membership section 8.7 grants**. The acceptance transaction
  and the instant-share conversion each lock the folder, count, and refuse
  422 at 25, the corrected shape the P3 repairs gave POST /members; section
  5.3's acceptance row gains the guard words its direct-add row always
  carried, and 8.7 states the rule once with its reasoning. The exemption
  reading, an accepted person joining a full folder rather than being turned
  away at the door, lost on four grounds: 10.3 calls the number
  server-enforced and records no exemption, where this specification
  deviates it says so in place, 7.1's tz treatment being the model; AC-124's
  own text names the counted value, a 26th member, never an endpoint, so an
  exemption would have needed that criterion narrowed; the P3 merge review
  accepted the addMember repair partly on the recorded ground that P5's
  membership-granting path would read the corrected shape; and refusal is
  the only outcome that preserves both the number and the invite, since the
  all-or-nothing transaction leaves a refused invite pending and acceptable
  once the folder has room, while an exemption makes 25 advisory and a
  silent skip would consume the invite and grant nothing. Frozen sections 4
  and 7 are untouched: 7.0's uniform status table and 10.3's blanket
  sentence already carry the 422 on the wire, so the ruling is the
  Steward's, not the owner's. The sequential refusal criteria arrive
  tester-proposed at this package's change control; AC-124's member arm
  gains the acceptance-path call site in its existing file with no text
  change. Recorded with the same kickoff, in the RFC 0001 P5 row: the 8.10
  deletion transaction's steps 1 to 6, covered by no criterion in any
  package, get tester-proposed criteria at the same change control, the P4
  precedent; the pending_invite_email derivation the suite README routes to
  this package rides that proposal batch; and the co-lead's premise on
  V-INV's closing pointer to 10.4 is answered in place, that arm being
  P9's, where AC-101 already asserts the per-user limits by number behind
  11.3's third middleware link, this package's only 429-shaped surface
  being 5.2's resend guard, asserted as AC-068.
- Package P4 of RFC 0001, views and search: every endpoint of frozen 7.10 and
  the eight queries of section 6 this package owns, Q1 with Q1R, Q2, Q3 with
  Q3C, Q4, Q5, Q6, Q7 and Q8, each answering rows the server has already
  ordered, plus the 6.1 partition proof pinned as a property. The date
  predicates behind them live in `src/server/time` on Luxon 3, read only in
  the instant-to-local direction, where the math is total and none of 11.15's
  DST hazard applies; the local-day window Q1R and Q6 need is derived by
  binary search from that direction rather than by asking a library for a
  midnight that twice a year does not exist or exists twice. The calendar's
  virtual arm defers to P6 with the 4.11 iterator it needs. Search escapes
  the wildcards a user types. Cursors are opaque, one per order rather than
  one per endpoint, and a cursor nothing issued answers 422 rather than a
  silent first page. The full gate is green at 908 tests across 112 files,
  AC-045 to AC-058, AC-070 and AC-125 to AC-132 passing by number beside
  every earlier range, on PGlite and on postgres:18.
- The defect that held P4's merge, and the reason it is worth a changelog
  entry rather than a commit message: `POST /tasks/:id/my-day` dated its
  entry in the account's stored zone while My Day grouped by the request's,
  so for a large part of every day a task pulled now appeared under Carried
  rather than Today. Four sessions carried it as a non-deterministic test
  failure. It was never load-dependent and never backend-dependent, only
  clock-dependent, and it was found by holding a merge on a red postgres:18
  leg rather than by any test written to look for it. The owner ruled `tz`
  onto frozen 7.8; the pull now dates from it through the same `today()` the
  view reads, so the two are one computation over one input rather than two
  that had agreed by luck. AC-132 is the guard that would have named it on
  the first run.
- A ruling of the human owner, Hassan, on 2026-08-08, on the escalation that
  held P4's merge. **Frozen 7.8's pull now takes `tz`**: POST
  /tasks/:id/my-day carries the zone, so it is given what 8.1 already says
  every date-evaluating request carries, and an absent or invalid one
  answers 422 naming the field. DELETE gains nothing, evaluating no date.
  The endpoint had required `added_on = today(V)` while carrying nothing
  from which today(V) could be computed, so the only zone within reach was
  `users.timezone`, which 8.1 reserves for reminder fire instants. The cost
  was not theoretical: the pull dated the entry in the account's zone while
  My Day grouped it by the request's, so for a large part of every day a
  task pulled now appeared under Carried rather than Today. The rejected
  alternative, letting the pull keep the account's zone and saying so, does
  not fix that defect but blesses it, and would have required weakening
  AC-047 and AC-048 to stop asserting a behavior a user can see.
- Frozen 4.7 confirmed to need no amendment, checked rather than assumed,
  because it is frozen and amending it would be a second owner decision. Its
  column note reads "the adder's local date at pull time" and names neither
  a zone source nor a mechanism; once the request carries the zone, that
  phrase reads correctly and more accurately than a stored zone can, since
  8.1 has travel move today. INV-12's "the adder's timezone at insert time"
  reads the same way. So the tension spanned two frozen sections and only
  one of them was wrong, and the P3 implementer was following 4.7 rather
  than deviating from it. Section 8.1 gains one sentence, not a restatement
  of the rule but of its consequence: "every request that evaluates dates
  carries tz" binds section 7 as much as the code, so an endpoint that
  stores or filters by a date and takes no tz is an incomplete surface
  rather than an invitation to substitute the stored zone.
- A second P4 change control, 2026-08-07, after the three implementing
  sessions landed. Two acceptance tests are ruled wrong while the criteria
  they carry stand, both verified from the fixtures rather than taken from
  the sessions that reported them: AC-057's expected sequence has positions
  two and three transposed against its own timestamps, and AC-052's two tie
  rows never tie, because the helper that stamps them is called once per
  loop iteration, so the created_at key resolves the pair before the id
  tie-break the case exists to reach. The repairs are the Adversarial Test
  role's, which is why the session that had to pass them escalated rather
  than edited, and they move in opposite directions: AC-057's expected array
  is the derived value, AC-052's fixture is the thing at fault.
- AC-131, Q8's literal wildcards, numbered on the offer the Adversarial Test
  role recorded when it asserted the rule as three adversarial cases inside
  AC-057 instead. Its judgment was right when it was made and is superseded
  rather than contradicted: escaping was a silence when AC-125 to AC-130
  were authored and became a rule the specification states when the first
  change control ruled it, which is the standard those six were admitted
  under. Section 13 gains item 21, Q4's Important page having no index of
  its own and that being adequate for v1, an accepted bet of item 6's kind
  with a revisit trigger, recorded because an EXPLAIN record inside a
  package cannot outlive it.
- Ratified from the P4 sessions' disclosures: Luxon 3 at `^3.7.2` with its
  types, the branch's only dependency addition, pre-authorized by the RFC
  0001 P4 row and made normative for IANA timezone math by spec 11.9 (the
  package entry at merge will carry it in P4's stack sentence, where every
  package records its own); and the cursor's opaqueness left where the
  session put it, carried to the endpoint shape review, since frozen 7.10
  writes `?cursor` and `next_cursor` and says nothing about what a cursor
  is. Routed rather than ratified: `tsconfig.build.json` needs
  `src/server/views/explain.ts` excluded, because `npm run build` emits a
  diagnostic module into production output today, and that file is
  Platform's.
- A hazard of how this build measures itself, recorded because it produced a
  false signal inside the session that found it. Checking out another branch
  while a suite run is still going makes test files vanish from collection:
  six files under `src/` reported `Cannot find module` and 127 tests
  silently did not run, while the failure count stayed at exactly the number
  a reader checks. Coverage disappeared and the headline number did not
  move. Two counts taken across a git operation are not two measurements of
  one tree.
- Three rulings of the human owner, Hassan, on 2026-08-07, closing the frozen
  section 7 silences the P4 change control routed to him. He took all three
  of the Steward's recommendations. They are transcribed onto frozen 7.0 and
  7.10 on branch `p4-views`, so they merge with the package.
  - **An absent tz answers 422 naming the field**, where 7.0 had named only
    an invalid one. A view endpoint called without tz is missing a required
    parameter rather than accepting a default: 8.1 makes tz an input of every
    request that evaluates dates, and UTC, the only plausible default, would
    hand most of the world the wrong day with nothing on the wire to say it
    had been substituted. 7.1's opposite treatment of the same parameter,
    where an unparseable zone is read as absent rather than refused, stays a
    deviation scoped to sign-in and does not generalize.
  - **The `folder` inside `groups: [{folder, rows}]` is the
    `{id, name, is_default}` stub every TaskCard already carries**, not the
    7.0 Folder object, and the `tasks_groups` of GET /views/all answers the
    same shape. A group heading needs exactly what a card's folder label
    needs: Folder's counts are the per-folder computation of 8.11 that no
    grouped view asks for, and its `is_owner`, `member_count`, `my_label` and
    `my_color` are 7.4's business.
  - **`section` defaults to `open` on GET /folders/:id/tasks** when absent,
    rather than being required. Q7 renders its completed section collapsed,
    so open is the state the page opens in, and 7.10's own enumeration names
    it first.
- AC-130 widened with the first of those rulings rather than joined by a new
  number: one rule of 7.0, two failures, now one answer, and no number moves.
  The widening is not cosmetic. An implementation reading tz through a schema
  with a UTC default satisfies the invalid half exactly, a present wrong
  value reaching the validator where an absent one never does, so the defect
  the ruling exists to prevent was invisible to the criterion as first
  written. The test is the Adversarial Test role's and is routed to the
  session already scheduled next.
- P4 mid-package change control, 2026-08-07, the amendments on branch
  `p4-views` so they merge with the package. One ruling was the human
  owner's: frozen 7.10 named a response object for eight of its nine
  endpoints, and GET /folders/:id/tasks now carries `scheduled`,
  `unscheduled`, and `truncated` on section=open and `days` with
  `next_cursor` on section=completed, the keys the other eight bodies
  already use for the same things. Six acceptance criteria are appended as
  AC-125 to AC-130, each closing a number the specification states and
  nothing asserts: the calendar's 62-day refusal and its real rows, search's
  page size of 20 and its 2-to-100 character bound, the 1000-row cap with
  its flag, and 7.0's tz rule across every view endpoint. Four silences are
  closed in section 6, which is the Steward's: `status_rank` gains
  completed = 2 in the preamble rather than only inside Q8, which had left a
  completed row's position in a calendar cell undefined; the 1000-row cap is
  per response rather than per array, since section 6 enumerates pages and
  each body carries one flag, with the kept rows a prefix of the order 7.10
  enumerates that response's sections in; Q3C refuses an inverted range,
  which its own arithmetic admits by accident, rather than answering it with
  the bare grid an empty month gets; and Q8 escapes a backslash, percent, or
  underscore the user typed, so a search for "50%" stops matching everything
  containing "50". Three silences are frozen section 7's and are routed to
  the owner with a recommendation each, blocking nothing: the shape of
  `folder` inside `groups`, what an absent tz gets where 7.0 names only an
  invalid one, and the default `section` of the folder page. And the tester's
  report that one clause each of AC-046 and AC-050 cannot be tested as
  written is ruled the closest faithful test rather than reinterpretation,
  recorded beside both criteria: owning the clock would decide, for an
  implementer who has not yet written a line, that today(V) comes from the
  process clock rather than the database, which 8.1 admits either way.
- A provenance defect and its repair, recorded because the record is the
  point. `app/tests/ac-058-folder-sections.test.ts` asserts the 7.10 body
  above as settled and states that the owner ruled it at the P4 kickoff. The
  substance is right and the timing is not: the kickoff recommended, the
  owner ruled on 2026-08-07, and the tester session ran in between on a
  prompt the operator wrote with "the human owner has ruled" in it, expecting
  the answer. The ruling is now transcribed, so the test cites text that
  exists. The header itself is inside `app/tests/`, which the Adversarial
  Test role owns exclusively, so its correction is a routed return rather
  than a Steward edit, and the P4 row now carries that session.
- P4's session order, traced into its RFC row at the package's kickoff on
  2026-08-07, with the premise check that preceded it. Two premises were
  wrong. The row named `05-query-and-read-path.md` as the only owner, and
  that role's own hard boundaries forbid it date arithmetic while the first
  seam of the team README gives the date predicates inside Q1 and Q3C to
  Scheduling; so P4 owes a `02-scheduling-and-time.md` session ahead of its
  implementer, for the `app/src/server/time/**` helpers that role's Owns
  section already names and that do not exist, and that session carries
  Luxon 3, which 11.9 makes normative for all IANA timezone math and which
  the package manifest does not have. And "every endpoint of 7.10" holds for
  the endpoints while one arm of one of them defers: GET
  /views/planned/calendar answers Q3C's real rows at P4, and its virtual
  array is 8.5's rule projection over the 4.11 iterator that P6 delivers.
  The plan's own evidence for that split is AC-082, the criterion that draws
  ghosts on a month view, written into P6's range and not into P4's. Two
  premises held, one of them for a reason unlike the one P3's kickoff
  recorded: no Data session is owed, because this package writes no table at
  all and every index of 4.12 landed in migration 0000, the pg_trgm
  extension and the GIN trigram index included and the extension wired into
  the PGlite client so both test legs carry it. Recorded rather than
  smoothed over: 4.12 names an index for every query of section 6 except Q4,
  there being none on `tasks.important`, and routing that gap to the Data
  engineer with the query that justifies it is the only door by which this
  package acquires a Data session.
- The carried items placed against P4 at the same kickoff. Only one touches
  it. The recurrence arm of the standing P6 list is the calendar's virtual
  instances, deferred above with AC-082 as its criterion; TaskCard's
  `is_recurring` is not part of it, being a read of a column P3 already
  answers. The rest wait where they are, and why is recorded so the next
  kickoff does not re-derive it: 7.6's fire_at recompute and the reminder
  arm stay at P7 because 7.10 answers TaskCard and reminder is a TaskDetail
  field, so no view carries it; the real 8.10 transaction and the 8.7 cap
  question stay at P5 because this package writes nothing; and
  pending_invite_email's unpinned derivation stays at P5 for the reason
  already recorded there, that P4, like P3, carries the key and cannot
  create an invite to fill it, so P5 remains the first package that can
  cover it. The `domain/db.ts` consolidation stays at P9 and gains weight
  rather than urgency: P4 imports its `rowsOf` rather than restating it and
  becomes the third consumer. The sessions.user_id index is untouched by a
  package that reads no session table. Section 13 item 20 was checked
  against P4 specifically and asks nothing of it: it records GET /folders,
  a 7.4 endpoint merged at P2, as deliberately outside the 1000-row caps
  precisely because section 6 enumerates the capped lists and the folder
  list is not among them. P4 is where the enumerated ones become code, so
  what this package implements is item 6's accepted bet, not item 20's
  exception.
- Package P3 of RFC 0001, tasks core: the frozen 7.6, 7.7, and 7.8 surfaces,
  which is create with the 7.6 guards and the INV-5 forcing, PATCH with the
  move rules and 8.4's clear-date cascade in one transaction, delete with its
  5.1 cascades, steps under the 50 cap, the four 5.1 transitions written as
  8.3's guarded single-row updates so a lost race is detectable and a repeat
  is a 200 no-op, and the My Day pull endpoints with INV-12's idempotency.
  Every one of them answers 7.0's TaskCard and TaskDetail, declared once in
  the shared contract and bound to the wire by a contract test rather than
  restated per route. Access is resolved through the P2 module's own accessOf,
  widened to take an executor so a move decides inside the transaction it
  writes in. Two arms of frozen 7.6 are deliberately absent and recorded as
  such: recurrence_rule waits for P6's 4.11 validator and reminder for P7's
  8.6 fire instant. And the three 10.3 caps in the domain directory, steps,
  members, and custom folders, now count under a lock, two of them repairs to
  code that merged at P2. The full gate is green at 604 tests across 83 files,
  AC-025 to AC-044 and AC-124 passing by number beside the P0, P1, P2, and
  P2S ranges.
- Package P2S of RFC 0001, the settings surface: frozen 7.2's GET and PATCH
  /me/settings, mounted in the auth router beside the 7.1 account endpoints
  because they speak for one authenticated person and take no id at all, so
  every statement is keyed by the session's user id and nothing the request
  carries; the 7.2 object declared once in the shared contract and reused by
  the GET body, the ruled PATCH body, and the settings key of GET /me, which
  retires the inline copy the /me response schema carried since P1; a PATCH
  naming only the columns its body carried, which is what lets two concurrent
  disjoint subsets compose instead of one overwriting the other from a stale
  read, and which answers from RETURNING so the ruled fresh-GET body is the
  row the write produced; and account.ts's local MeBody interface converged
  on the shared response type, the one-line item carried since the P1 merge
  review. The full gate is green at 404 tests across 57 files, AC-119 to
  AC-123 passing by number beside the P0, P1, and P2 ranges.
- Package P2 of RFC 0001, folders and membership: the full 7.4 surface
  (folder CRUD, member add and remove under 5.3's guards and 5.4's matrix,
  the personal label and color membership PATCH, R-CLEAN on every removal
  and leave, 8.9 ownership transfer, 8.11 counts inside the Folder object)
  behind shared zod schemas for every body and response; the notify
  module's send-or-log transport behind the ratified options.notifications
  sink, observed by AC-021 and AC-024; the ruled 7.0 edge mapping in the
  boot file, an over-limit or non-object body answering 400 with no side
  effects; and the settled 7.4 response shapes pinned by shared response
  schemas and a key-exact contract test against the mounted application.
  The full gate is green at 353 tests across 50 files, AC-011 to AC-024
  and AC-116 to AC-118 passing by number beside the P0 and P1 ranges.
- Package P1 of RFC 0001, authentication: hand-rolled Google OIDC on
  openid-client 6 per 11.6, with state, nonce, and PKCE validated single-use,
  ID token signature verification forced on (section 13 item 17), and no
  Google token persisted; the 10.1 sessions table (migrations 0001 and 0002)
  storing only sha256 digests of CSPRNG identifiers, with the 30-day rolling
  expiry checked and extended in one statement; CSRF as a token derived from
  the session token by HMAC, so the 11.6 binding needs no stored column; the
  idempotent provisioning transaction; timezone sync per 7.1 and 8.1 with the
  tzdb-alias rule; the 9.2 unverified-email page; /me, PATCH /me, and DELETE
  /me with the 8.10 stub the P1 row places in the auth module; a development
  login excluded from production builds; the shared contract surface (zod
  schemas, error envelope, the one IANA validator) and the 7.0 envelope
  helpers; and boot wiring that mounts the surface, scrubs database wrapper
  messages from 5xx logs, and refuses to start when no sign-in path is
  configured. The full gate is green with every criterion from AC-001 to
  AC-010 and AC-105 to AC-115 passing by number.
- Package P0 of RFC 0001, the first code: the `app/` package and toolchain
  (Node 24, TypeScript strict, ESM, Vite 8, Vitest 4, ESLint 9), CI in the
  11.11 step order with the postgres:18 leg, a boot file that applies
  migrations before /api/health reports ready, one hand-authored migration
  realizing every constraint and index of spec section 4 by name, the seed
  dataset, the PGlite or Postgres database seam, and acceptance tests AC-001
  to AC-004.

### Changed

- The gate moves onto the owner's machine, 2026-08-11, and four rulings come with
  it. GitHub's hosted runners stopped starting at 18:46 UTC on an account billing
  failure: every run from `96e6e50` onward completes in three to four seconds with
  no runner assigned and zero steps, two of them on commits that touched only
  `SESSION-LOG.md`, and the last green run is 16:08 UTC at `e54038e`. The owner
  chose not to buy hosted minutes, so CI moves to a self-hosted runner here. This
  branch rules and records; the workflow file is Platform's and is deliberately
  untouched by it, so nothing here has yet been proven to execute, and until a
  runner is registered nothing can be.
  - **11.11 admits a self-hosted runner without moving a step.** "CI is GitHub
    Actions" survives intact, a self-hosted runner being GitHub Actions with a
    different executing machine and the same workflow, events, checks and run
    history. What did not survive as written is "test on postgres:18", which named
    a Docker image on a machine that has none and will not get one. That step is
    now "test on a real Postgres 18", and the two vehicles, a service container on
    a hosted runner and the host's own cluster on a self-hosted one, are named as
    job configuration, which is what the service block always was. The seven steps
    and their order are untouched, so the workflow header's rule that changing
    order or steps is an escalation is satisfied rather than waived. Three
    consequences ride with it, each recorded in 11.11: the arrangement is
    acceptable exactly while this repository is private, a self-hosted runner
    executing whatever any pushed branch's workflow says on a machine holding the
    owner's data; CI now exists only while that machine is on, and a job that finds
    no runner waits rather than failing, so a branch gets no verdict rather than a
    red one; and the Playwright step may drop `--with-deps` on Windows, a flag that
    installs Linux system packages and has nothing to do there.
  - **The test database is pinned to Postgres 18's builtin C.UTF-8 locale, and
    11.10 stops calling the second leg the production-fidelity authority.** The
    cluster installed here was initialised with a French locale, read off disk from
    `global/1262` because the superuser password is deliberately not available to a
    session: all three databases are UTF8 with the libc provider and
    French_France.1252 for both collate and ctype. The `postgres:18` image is
    Debian with `ENV LANG en_US.utf8`, so glibc en_US.utf8. Those two differ, which
    is why the question was routed, but the measurement that decided it was a third
    one: PGlite is LC_COLLATE C, and always has been. The suite has therefore been
    green on C and on glibc en_US.utf8 simultaneously since P0, which is proof that
    no acceptance criterion can distinguish them and that the container leg was
    never in fact exercising the production collation. The name was the over-claim,
    not the coverage. So the second leg is pinned to what Postgres itself
    guarantees identical on every platform and every version, the builtin
    provider's C.UTF-8, measured byte-identical to PGlite's default ordering over a
    probe carrying case, accents, punctuation and digits, and giving the same full
    Unicode case mapping so Q8's ILIKE and trigram search fold the same way on both
    legs. It also puts the database under the same ordering as the suite's own
    oracle, JavaScript's `<` being UTF-16 code unit order, which is what AC-069
    sorts with to assert 7.3's roster; under a linguistic collation that criterion
    agreed with the database only for as long as its fixture avoided case, accents
    and punctuation. Two rejected alternatives go to 11.14 rather than being left
    to rediscovery: matching the image's libc locale, which Windows cannot do,
    having no glibc and substituting the Windows NLS implementation under the same
    name, and the ICU provider, which is stable only within one ICU major version
    and would be a third ordering agreeing with nothing. What the ruling gives up
    is section 13 item 29: no leg now runs a linguistic collation, so the ordering
    a production Render Postgres serves is checked by nothing, and the one place
    that is visible is 7.3's unfolded display_name. Closing it is the owner's
    choice among three, and the cheapest two touch no frozen section.
  - **The connection string lives in the runner installation's own `.env`, not in a
    GitHub secret**, which inverts what 11.11 said about CI and so is now stated
    there positively: a credential for a resource GitHub cannot reach is never
    stored at GitHub. Every workflow on every branch can read a repository secret,
    workflow files are code the sessions of this build edit and push, and the
    string describes a database on the owner's own machine, so storing it at GitHub
    widens exposure and buys nothing. A machine-wide environment variable was
    rejected for the same plaintext at a wider blast radius and a service restart
    to rotate. The role is `dana_ci` with CREATEDB, never the superuser, which is
    enough because pg_trgm has been a trusted extension since Postgres 13 and the
    one `CREATE EXTENSION` in the migrations is therefore a database owner's to
    run.
  - **"Merges to main require green CI" is the protocol's rule and never was the
    platform's.** Checked on 2026-08-11: the branch protection and ruleset APIs
    both answer 403 on this repository, which is private on a plan offering
    neither. The sentence in 11.11 now says so. The practical reading is that
    nothing at GitHub will stop a merge, and what blocks a package landing without
    a green gate is the definition of done in protocol section 4, enforced by the
    Integration Steward, which is where it has always actually lived.
  - One boundary was crossed knowingly and is disclosed rather than buried.
    `CLAUDE.md` is Platform's owned file by persona, and this branch edits its
    "Commands and this machine" section, because that section is the recorded home
    of exactly these facts and leaving it saying there is no Docker and that
    `postgres:18` is the authority would have misled every session opened before
    Platform's next one. The Platform session that implements the workflow may
    rewrite any of that wording; what it must not do is drop the facts. Nothing
    else outside change control was touched, and `.github/workflows/ci.yml` was
    deliberately left alone.
  - **Two defects the branch raised against itself, fixed at the merge review**,
    2026-08-11, both in `.github/workflows/ci.yml`. The postgres leg could pass
    by running PGlite twice: the connection string now arrives from outside the
    workflow, and nothing checked that it arrived, so a missing runner `.env`, a
    misspelled name, or a service started before the file was written would leave
    the seam falling back to PGlite and the step reporting a second identical
    green having measured nothing. Step five now refuses to run in that state.
    The guard tests presence alone, reads no value into a command and names none,
    and treats unset and empty as one case because that is exactly the fallback
    condition of the seam at `app/db/client.ts`, so the two agree by construction
    rather than by being kept in step. And `timeout-minutes` moves from 20, which
    was sized for a hosted Linux job whose fifth leg had never run, to 40. That
    is decided on two measurements rather than on the 45 this run first
    estimated: five legs in 255 seconds on this machine with every cache warm and
    the postgres leg still to add, and p8-client's hosted measurement of 13.5 to
    14.5 minutes for the four legs ahead of the browser one, with three of its
    four runs killed by the clock mid-Playwright. 40 is p8-client's own number,
    taken so that two branches editing that line converge instead of colliding.
  - **The workflow stops depending on which PowerShell happens to be installed.**
    Ruled at the same review. `&&` is a PowerShell 7 pipeline chain operator and
    a parser error in Windows PowerShell 5.1, which is what a Windows runner falls
    back to when pwsh is absent, and that same shell assumption has now broken
    this project three times in one day. The shell is therefore declared on the
    two steps carrying more than a bare command and on those alone, the other five
    being single commands that parse identically everywhere. It is job
    configuration in the sense 11.11 already admits for `runs-on`, and it is
    form-neutral: pwsh ships on GitHub-hosted runners, so the text is identical on
    both forms 11.11 admits. What it changes on the self-hosted form is that
    PowerShell 7 becomes a stated prerequisite instead of a lucky accident, which
    is the point of the ruling. Installing it is the owner's step and is now owed
    before the runner's first job rather than merely recommended.
  - A third boundary was crossed, on the same terms as the one above and
    disclosed the same way. `.github/workflows/**` is Platform's owned path by
    persona, and the Integration Steward edited `ci.yml` at this merge on the
    owner's instruction, the two defects having been routed to the Steward for
    authorisation and authorising them being the whole of what remained. Platform
    may rewrite any of the wording; what it must not do is drop the guard, the
    ceiling, or the declared shells. Recorded beside the other two so the count
    reads three rather than two.
  - **11.10 gains a second normative statement, `ALTER DATABASE dana_test SET
    lc_messages = 'C'`, because the first execution of this leg turned up what
    the ruling had missed.** The locale a database is created with fixes how it
    sorts and folds text. It does not fix the language the server writes its
    error messages in, which is a separate GUC, inherited from the cluster and
    superuser-context so the owning role cannot set it. The cluster here is
    French, and the leg came back red on exactly one of 1476 tests: AC-001's
    adversarial NOT NULL case, which asserts that the rejection contains `null
    value in column "folder_id"`. That assertion reads the server's own prose on
    purpose, because the bare column name also appears in the statement it sent
    and a fragment satisfiable by the statement text would prove nothing. It was
    the only one of the suite's nine rejection assertions to fail; the other
    eight name constraints and indexes, which survive translation verbatim. The
    fix is one statement against the fixture rather than any change to the suite,
    and it is transcribed as normative rather than left as an operator step,
    because a test database pinned in one dimension of its locale and inheriting
    another is pinned in neither. A third verification check goes with it, `SHOW
    lc_messages`, which must answer C and never a language name. With it applied
    the two legs return identical counts for the first time: 188 files and 1476
    tests on PGlite in 234 seconds, and the same 188 and 1476 against the real
    Postgres 18 in 67.
- Merge rulings at the P3 merge, 2026-08-07. By the human owner, accepting all
  four recommendations of the endpoint shape review and transcribed onto
  frozen section 7: closing paragraphs on 7.7 and 7.8 settling that each of
  their mutations answers the affected TaskDetail, because neither a step nor
  a My Day entry is a resource this contract shapes or offers a GET for and
  each mutation moves more of the task than the row it touches, steps moving
  steps_done and steps_total and a pull moving pulled; two sentences on 7.0
  about shapes it already declares, that floating values ride the wire in
  their 4.11 formats, YYYY-MM-DD and HH:MM and never instants, and that
  TaskDetail's reminder carries both 4.8 columns with exactly one non-null
  because "{offset_minutes or time_of_day}" names a mode and not a key list;
  and 7.6's move refusal narrowed from "404 or 422" to 404, the recommendation
  the review ranked lowest and the owner took anyway, since a 422 for a folder
  the caller cannot see confirms the folder exists. Nothing went red on the
  narrowing: the surface already answered 404 from the same leak rule, and
  AC-029 admitted both, so the contract now says what the code did.
- Section 12 gains AC-124 by amendment on branch p3-tasks-core, 2026-08-07,
  riding P3's merge gate the way AC-116 to AC-118 rode P2's. The merge review
  found one defect in three places: the guards for 10.3's step, member, and
  custom-folder caps each counted outside the write the count admitted, so two
  callers arriving together at the limit both passed and the stored count went
  one past it. Two of the three were in code merged at P2, and the branch was
  held twice, once to repair them and once for this criterion. It exists
  because the repairs were otherwise proven only by a statement-order probe
  inside the implementing module, which is the implementer attesting to their
  own fix, the one arrangement this project calls its only source of
  independent truth. Routing it to P9's limits sweep was the close alternative
  and was declined: a sweep checks that limits exist, and what was missing is
  independent evidence for a fix already made. Recorded with it, the reading
  its test turns on: the criterion asserts the outcome rather than that a
  breach was attempted, because on the default backend the two transactions
  queue where on postgres:18 they overlap, and both satisfy it for the same
  reason, that the limit held and one caller was refused.
- 11.15's PGlite bullet is corrected against measurement, 2026-08-07. The
  bullet was true and incomplete in the way a hazard list cannot afford: it
  says PGlite is single-connection, which is a fact, and three sessions plus
  the Steward's own merge-review ruling read that as meaning concurrency races
  cannot be expressed locally, which is not. The Adversarial Test role
  measured it, reproducing the 51-step breach on the default backend at the
  domain level and through HTTP. One connection serializes statements, not
  handler logic, so interleaved handlers race normally; what genuinely needs a
  second connection is a second concurrent transaction. The Steward's ruling
  that this branch could repair a cap merged at P2 stands on its other three
  grounds, and the false one is withdrawn in the RFC row rather than left
  standing. Section 11 is normative and not frozen, so this was change control
  rather than an owner decision.
- Ratified at the P3 merge, the disclosed-extension shape. The Collaboration
  return fixed the two caps it was routed and found a third of the identical
  shape in createFolder by applying the recorded grounds to the rest of its
  own directory, disclosing it in a commit built to be dropped on its own. It
  is accepted, and with it the general rule: carrying a recorded ruling's own
  grounds to the identical defect inside your own paths is in scope when it
  arrives separately revertible. A different defect class, or another role's
  paths, is not, and the disclosure is what separates the two.
- Mid-P3 rulings, 2026-08-05, on branch p3-tasks-core so they merge with the
  package whose assertions they underwrite, the mid-P2 precedent. Three
  questions from the tester session's final block, none of them a frozen
  change and none of them changing a test.
  - **A second DELETE on a task answers 404**, as AC-042's adversarial case
    asserts. The apparent collision dissolves on reading: 7.0's idempotency
    sentence is about effect, not status, and a second DELETE that changes
    nothing is idempotent whatever it answers, while 8.3 speaks to the status
    directly and says operations on deleted rows return 404. Frozen section 7
    settles it twice over. It already contains a DELETE addressed by id that
    answers 404 on absence, 7.3's DELETE /connections/:userId, "204; 404 if no
    such connection", and where it wants a status on absence for a
    sub-resource toggle it says so outright, 7.8's my-day "200 even when
    absent" and 7.9's reminder "204, idempotent". The decisive ground is the
    leak rule: 204 for a task that existed and was deleted, beside 404 for an
    id that never existed, is an existence oracle, and 7.0 and AC-102 forbid
    exactly that. Avoiding the leak under a 204 policy would mean answering
    204 for every unknown id, including tasks in folders the caller cannot
    see, which contradicts "inaccessible always reads as 404".
  - **In a single-member folder the INV-5 forcing wins over the composite-FK
    422**, on POST /tasks. Frozen 7.6 lists both rules and the case where they
    meet is a caller naming a non-member assignee in a folder with one member.
    "Ignoring the input" is the plain reading, and section 3 settles it: INV-5
    names its enforcement as "create, move, unassign guard", so create and move
    are transactions that make the value right and only the unassign case is a
    guard that refuses. 7.6's own move rule shows the same pattern, an assignee
    who is not a member of the target being repaired rather than refused. The
    principle the contract draws is that repair applies where the right value
    is determined, which in a single-member folder it is, and refusal applies
    where it would be a guess, which is every folder with more than one member.
    Scope is POST only: PATCH keeps 422 for a non-member and 409 for a null in
    a single-member folder, which 7.6's PATCH bullet states and INV-5 calls the
    unassign guard. No criterion moves; AC-026 pins the null case to forcing
    already, and AC-033 stages a multi-member folder on purpose.
  - **Ratified, the reading inside AC-039**: abandoning a task does not delete
    the viewer's My Day entry. 5.1's abandon row lists its side effects and
    entry deletion is not among them, 8.2 selects pending rows so the task
    leaves the page by the status filter alone, and R-CLEAN deletes My Day
    entries explicitly wherever the contract means deletion, so the silence is
    a distinction the contract draws itself, the pattern the P2S merge used on
    user_settings.updated_at. It also has a consequence worth naming: AC-097
    has restore return an overdue assigned task to My Day immediately, and for
    a task that was pulled rather than automatic that works only if the entry
    survived, since 8.2 reads its added_on.
- The commit trailer names the model that ran the session, by owner ruling on
  the P3 tester session's note, 2026-08-05. Protocol section 7 fixed the
  trailer to one literal model string, accurate when written and false from
  the moment the model lineup changed, so a session could either misattribute
  itself or depart from the rule and had no third option. The sentence now
  points at the session rather than at a literal, the same open-reference fix
  made when section 12 outran the "AC-001 to AC-115" range that three team
  documents had written down. The address is unchanged and only the name is
  the session's own. History stays as written: the rule governs new commits,
  starting with the one that lands it.
- The pending_invite_email coverage gap is routed into the P5 row, 2026-08-05.
  Frozen 7.0 derives TaskCard.pending_invite_email from invites.task_id and no
  criterion in any range pins the derivation. P3's tester session found it and
  could go no further, that package creating no invite, so its files assert the
  key's presence and say so. P5 is the first package that can create one, so
  the gap is its tester session's, by an amendment appending to the P5 range if
  the existing numbers have no room. It is in the plan and not only in the
  suite README, because the session that should act on it opens against the
  plan.
- Kickoff rulings for package P3, 2026-08-05, landed on main ahead of the
  branch, the P2 precedent: a kickoff amends the plan, not the code, and
  `p3-tasks-core` is created by the package's first working session rather
  than by this one. The P3 row gains the traced session order that P1, P2,
  and P2S carry, five sessions each naming what it opens against, every
  named artifact verified present on main at 3306727. Three premises were
  checked before tracing and one was wrong: the package's frozen surfaces
  are 7.6, 7.7, and 7.8, not 7.5, which is the invite surface P5 delivers,
  and the only reach AC-025 to AC-044 make into invites is AC-042's
  task_id, a database cascade named in 5.1's delete row and present in
  migration 0000 since P0. The other two hold with one correction: the 7.0
  TaskCard and TaskDetail shapes are frozen and present, and
  `folderMemberUser` already carries the person shape TaskCard's assignee
  takes, but 11.3's middleware is a pair on main rather than a trio,
  session resolution and CSRF, with rate limiting at P9, which
  `auth/middleware.ts` and `routes/folders.ts` both already record. Two
  arms of frozen 7.6 are recorded as deferring with the computations they
  need rather than being half-built, the P1 row's stub precedent:
  recurrence_rule waits for P6's 4.11 validator, since 4.11 itself requires
  the subset revalidated server-side and a stored-but-unvalidated rule
  would be a wrong implementation rather than an absent one, and reminder
  waits for P7's 8.6 fire instant, which 4.8's NOT NULL fire_at column
  leaves no way around. At P3 both fall to 7.0's tolerated-unknown rule and
  become known when their owners' schemas declare them.
- The real 8.10 account deletion transaction is placed in P5, ruled at the
  P3 kickoff, 2026-08-05. The P1 row put the stub in the auth module until
  "the Collaboration packages" land the transaction and the P2 merge carried
  that forward without naming one; P3 and P5 are both Collaboration, so the
  placement was open, and an unplaced obligation lands twice or not at all.
  Steps 1 and 5, invalidating the user's pending sent invites and deleting
  their connection rows, are the invites and connections surfaces P5
  delivers and no earlier package owns. Every other step's machinery landed
  at P2: `transferOwnership` for step 2, `deleteFolder` for step 3, and
  `removeMembership` for step 4, whose R-CLEAN already unassigns tasks and
  deletes My Day entries. P3 puts rows into tables those sweeps already
  reach and adds no step to the transaction. No acceptance criterion covers
  steps 1 to 6 in any package, AC-009 and AC-112 pinning the confirm string
  and the session revocation the stub already satisfies, so an earlier
  landing would buy a revisit at P5 rather than coverage. What stays open
  until then is in the P5 row rather than in a session's memory: a deleted
  account's folders and memberships have survived since P2 and its tasks and
  My Day entries survive from P3. Section 8.10 is unchanged; this is a
  build-plan placement, not a specification change.
- Merge rulings at the P2S merge, 2026-08-05. By the human owner, pre-ruled on
  the shape review's routed finding: the malformed-body status turns on the
  content-type header rather than on whether the body parses, so identical
  unparseable bytes answer 400 under application/json and 422 under text/plain
  or under none at all. Verified at this merge against the running application
  on both /me and /me/settings, so it is uniform and it is pre-existing: it
  falls out of two P1 decisions, express.json parsing only matching content
  types, and the empty-path branch of the validation helper answering "A JSON
  object body is required", which that file's own comment anticipated. Option
  (a) accepted, no code change: frozen 7.0's 400 bullet gains the scoping
  sentence, that the bullet governs bodies presented as JSON, and that a
  request claiming no JSON content type presents nothing to parse whatever
  bytes it carries, so an endpoint needing a body answers 422 for the body it
  did not receive rather than 400 for one it could not read. Under the
  Steward's own change control, AC-118's sentence is clarified to match, "a
  body presented as JSON that does not parse" where it read "a body that does
  not parse as JSON". No test changes and the number keeps its meaning: every
  AC-118 raw-body probe sets application/json explicitly and always did, so the
  criterion tested the ruled reading already while its sentence, read
  literally, claimed a status the surface does not give. Ratified from
  disclosure, the token_hash-CHECK pattern: user_settings.updated_at moves on a
  writing PATCH and stays put on the empty subset. Frozen 4.10 gives the column
  its default and states no rule for when it moves, where the tasks table's own
  updated_at row states "touched on every mutation", so the silence is a
  distinction the frozen schema draws itself, and an empty subset that writes
  nothing is not a mutation. 4.10 is unchanged; no endpoint exposes the column,
  and the day one does, the rule becomes contract rather than staying a module
  decision. Carried forward, not merge-blocking: the suite README's coverage
  table still reads AC-119 to AC-123 as failing, written before the routes
  landed, the same lag the P2 rows carried until the next tester session
  refreshed them; and the 8.10 stub, the third private copy of the row and
  transaction adapters in domain/db.ts, and the sessions.user_id index all
  stand where the P2 merge left them.
- The acceptance-test ownership rule loses its fixed range, by owner ruling on
  branch p2s-settings, 2026-08-04. Protocol section 8, persona 11's Owns
  section, and the team roster all bounded acceptance tests at AC-001 to
  AC-115, a range the mid-P2 amendment had already outrun by three and the
  P2S amendment outran by eight. Read literally, the protocol sentence that
  stops an implementer editing a failing acceptance test covered none of
  AC-116 to AC-123, and persona 11's Owns section, by the team README the
  only statement of its ownership, claimed none of them either. All three now
  point at spec section 12's numbered criteria openly, every number it
  carries including those a later amendment appends, so an append-only
  section cannot outrun the rule that protects it a third time.
- Frozen 7.2 amended on branch p2s-settings, 2026-08-04, so it merges with
  its package: the human owner accepted option (a) of the opening session's
  escalation, and the subsection gains one appended sentence, PATCH
  /me/settings answers the GET /me/settings object. The silence was real and
  asymmetric. 7.2 named only 200 for its mutation, where 7.1 names PATCH
  /me's body by the P1 merge ruling and 7.4 names each of its mutations'
  bodies by the P2 shape review, so this was the one PATCH on the surface a
  client had to chase with a fetch, and an implementer filling the gap
  locally would have picked the shape by guess. The frozen bullets are
  unchanged and the sentence is appended as its own paragraph, the shape the
  P2 merge used for 7.4. No criterion is invalidated: the tester's files
  judged no PATCH body while the silence stood, and the assertion now lands
  in a scoped return to settings-harness.ts, which already holds one home
  for it.
- Section 12 gains AC-119 to AC-123 by amendment on branch p2s-settings,
  2026-08-04, so the criteria merge with the package that satisfies them:
  the Adversarial Test role's five proposed criteria for frozen 7.2,
  transcribed unchanged under their own Settings heading, appended from the
  next free number so no existing number moves. AC-119 pins GET /me/settings
  to exactly the three booleans at their 4.10 defaults, AC-120 pins any
  subset with absent fields unchanged and the new values readable from both
  7.2 and the /me settings key, AC-121 pins 422 naming the field on any
  non-boolean, AC-122 pins per-account isolation, and AC-123 pins frozen
  7.2's own no-data-changes sentence as row-for-row stillness outside
  user_settings. Recorded with them, two readings of the frozen text rather
  than changes to it, the my-membership pattern of the P2 merge: the empty
  subset is a subset, answering 200 and changing nothing, and null is a
  wrong-typed value rather than a clear, because 4.10's columns are NOT NULL
  booleans with defaults where 7.4's label and color are marked nullable by
  the frozen text itself. Housekeeping in the same pass: the section 12 row
  of the spec index, stale by three since the mid-P2 amendment, now reads
  AC-001 to AC-123.
- Merge rulings at the P2 merge, 2026-08-04. By the human owner: frozen
  7.4 gains the four response-shape sentences the shape review settled,
  transcribed at the merge: GET /folders answers the bare array, the
  detail's invite key is pending_invites carrying 7.4's five element
  fields, the members' user object is the TaskCard assignee person shape
  with no email, and each 7.4 mutation answers what a fresh GET would.
  Ratified from disclosure, the token_hash-CHECK pattern: the API
  engineer's any-subset reading of the my-membership PATCH (absent
  unchanged, null clears, a present value must be valid), grounded in
  section 7's own PATCH conventions elsewhere and the order AC-023
  requires, validate then delegate. Recorded by the Steward: section 13
  item 20, the folder list's deliberate absence from the capped lists,
  with its social bound and revisit trigger; and routes/README.md stays
  where it is, ruled the routes directory's shared wiring ledger, each
  role appending its own router's section and Platform annotating as
  executor. Carried forward, not merge-blocking: the 8.10 stub still
  holds only steps 7 and 8 until the Collaboration packages land the
  real transaction; domain/db.ts is the third private copy of the row
  and transaction adapters, consolidation flagged for P9; Security's
  account.ts type convergence waits at its P2S touch; the
  sessions.user_id index waits at Data on P9 evidence.
- Mid-P2 ruling, 2026-08-04, on branch p2-folders so it merges with its
  package: the notification observability seam. AC-024 counts a share-grant
  email that 11.8 keeps unsent under test and 10.5 keeps out of the logs, so
  11.10's construction seam gains options.notifications, an injected sink
  { send(message) } the notification module delivers to instead of logging
  when present; each message identifies its template and its recipient, the
  remaining keys the module's own; absent the sink, 11.8 is unchanged, and
  11.8 now points at the seam so the two sections cannot drift. Ratified
  over stdout capture (blocked by 10.5's whitelist on purpose) and an
  HTTP-level Resend double (contrary to 11.8's no-send rule). The harness
  assumed the seam in exactly one typed place, as options.dbClient once was
  before its P1 ratification.
- Section 12 gains AC-116 to AC-118 by mid-P2 amendment on the package
  branch, the Adversarial Test role's yes on the criteria-level pinning
  routed to its judgment at the P1 merge: AC-116 pins the GET and PATCH /me
  bodies to exactly the 7.1 object, AC-117 pins the 7.0 envelope with
  non-empty code and message on every 4xx of the mounted surface (presence,
  not exclusivity: a future structured error key beside message stays open),
  and AC-118 pins the amended 7.0 taxonomy, unparseable, non-object, and
  over-limit bodies answering 400 with no side effects, wrong-typed fields
  answering 422 naming the field, unknown fields ignored. Appended from the
  next free number, so the P2S settings criteria start at AC-119. AC-118
  rides the P2 merge gate that already holds the 400 mapping.
- The P2 row retraced for both mid-P2 rulings: the tester returns next for
  the AC-116 to AC-118 test files, and Platform's touch splits in two, an
  early session landing the notify module's send-or-log transport behind
  the ratified sink, the options.notifications parameter, and the ruled 7.0
  edge mapping, placed before the package because the Collaboration
  engineer's call sites invoke the module and cannot land before it exists,
  then the late boot wiring by request. The 04 shape review closes the
  branch carrying the tester's routed 7.4 observation (the GET /folders
  wrapper shape and the pending-invites key name). P2's acceptance now
  names AC-116 to AC-118 beside AC-011 to AC-024.
- Frozen 7.0 amended at the P2 kickoff, 2026-08-04: the human owner accepted
  verbatim the clarifying sentence offered at the P1 merge, so the 400 bullet
  now reads that a body not parsing as JSON, or parsing to something other
  than an object, is malformed, while on a parsed object unknown fields are
  tolerated and wrong types answer 422 naming the field. No criterion is
  invalidated: AC-009 already pins the 422 half, and the two code edges
  answering otherwise today remain the named deviation Platform lands at its
  next boot-file touch, which the P2 merge gate holds.
- RFC 0001's implementation plan gains row P2S, from the owner's 2026-08-04
  acceptance of the P1 merge escalation's recommendation on the unscheduled
  7.2 settings endpoints: tester-authored acceptance criteria arriving by
  section 12 amendment, then one small Security session implementing GET and
  PATCH /me/settings on branch p2s-settings, with the API and Contract role
  supplying the settings body schema and the pre-merge shape review. The row
  is slotted after P2's merge and before P8's integration window, which
  AC-095 ties to it, and places one routed P1 leftover where it lands:
  account.ts's local body type converges on the shared schema at Security's
  touch.
- The P2 row of RFC 0001's plan now carries its session order the way the P1
  row does: Adversarial Test first (AC-011 to AC-024, tests before
  implementation, plus the P1-routed judgment on criteria-level pinning of
  the /me shape, envelope, and status taxonomy), API and Contract's shared
  schemas for the 7.4 bodies, Collaboration and Permissions implementing the
  package, then Platform's boot wiring by request, the same boot-file touch
  landing the held 7.0 edge mapping, and API and Contract's endpoint shape
  review before the Steward merges. The row's Delivers now names that held
  mapping, so the merge gate that holds it is visible from the plan alone.
- Merge-review rulings at the P1 merge, 2026-08-03. By the human owner:
  frozen 7.1 now names PATCH /me's response body (the GET /me object,
  behavior unchanged), and the email collision across google_sub is parked
  as section 13 item 19 beside the dotted-variant question it mirrors.
  Ratified from session disclosures: Data's sessions_token_hash_format_check
  (transcription of 10.1's digest wording), Platform's 5xx log scrubbing and
  boot sign-in precondition (both 10.5 and operability wins inside its own
  file), and Security's HMAC-derived CSRF, which closes the 0003 migration
  question the 5e01e49 ruling left open. Recorded: section 13 items 17 and
  18 (openid-client and drizzle library defaults, each with an upgrade
  revisit trigger) and a fourth entry in 11.1's single-instance checklist
  (the in-memory pending-authorization store). Ruled on the shape review's
  findings: the 7.0 taxonomy reading extends to the two edges it found, a
  body over the parse limit is a body that did not parse (400, not 413) and
  a parsed body that is not a JSON object is malformed (400), while an
  object with bad fields stays 422; both edges answer otherwise today, a
  named deviation Platform lands at its next boot-file touch and the P2
  merge gate holds. Routed: the sessions.user_id index to the Data engineer
  pending P9's evidence; account.ts's local body type converging on the
  shared schema to Security's next touch; criteria-level pinning of the /me
  shape, envelope, and status taxonomy to the Adversarial Test role's
  judgment; and the unscheduled 7.2 settings endpoints to the human owner,
  since no RFC 0001 row claims them and P8's AC-095 will need them.
- Product design settled over four iterations, from a bullet list to a full
  technical specification: data model, invariants, state machines, query
  specifications, API surface, and 104 acceptance criteria.
- A 13-role agent team definition with a shared protocol, covering data,
  scheduling, collaboration, API, query, security, frontend, components, complex
  interaction, platform, adversarial testing, integration, and dispatch.
- Documentation architecture: a single living specification, numbered RFCs for
  changes, a human-facing runbook, and this changelog.
- Specification section 11 rewritten as normative architecture: one Node
  deployable (Vite React SPA plus Express API), Postgres 18, hand-rolled Google
  OIDC, an in-process reminder tick, Render hosting, with rejected alternatives
  recorded.
- Auth security acceptance criteria AC-105 to AC-115, raising the count from
  104 to 115; section 13 items 3, 4, and 11 resolved and item 15 added.
- The team definitions rebuilt against the chosen architecture; the RFC process
  and template, with RFC 0001 written in full; the design brief for the
  designer; the operator runbook written in full.
- Mid-P1 rulings of 2026-08-02, on branch `p1-auth`. The sessions identifier
  column, escalated by the Data session, is ruled as 10.1's fourth fixed
  fact: a token_hash text primary key holding the lowercase hex sha256
  digest of the cookie's CSPRNG token, landing as migration 0002 by the Data
  engineer before the Security session; the digest algorithm is the
  ruling's choice (the persona fixes only "stored hashed"), standard for
  high-entropy tokens and inside the persona's nothing-exotic rule. Any
  further columns (a stored CSRF binding, timestamps) stay the Security
  engineer's to request and Data's to transcribe. The Data session's NOT
  NULL disclosure is ratified into 10.1's text. The acceptance harness's
  timezone predicate was found weaker than the shared validator (Intl
  accepts ECMA-402 offset identifiers; verified on this Node), so the
  Adversarial Test role returns before the Security session: sign guard in
  the harness predicate, offset identifiers among AC-007's unparseable
  values, AC-113's contract case extended; 11.15 records the Intl oracle
  hazard. And the 7.0 status reading is settled as the suite already pins
  it (AC-009 answers 422 for wrong-typed fields): on a body that parses as
  JSON, field-level failures are 422 with the field named; 400 is reserved
  for bodies that do not parse. A clarifying sentence in frozen 7.0 is
  proposed to the human owner but not required, since the acceptance suite
  and the shared schemas already enforce the reading.
- Five P1 escalations from the Adversarial Test session ruled on 2026-07-31,
  amendments on branch `p1-auth` so they merge with the package. Two were the
  human owner's, both touching frozen section 7: GET /auth/google gains an
  optional tz query parameter (an IANA identifier carried to the callback;
  absent means UTC at provisioning and no sync on return; invalid is treated
  as absent, a recorded deviation from the 422 rule), and 7.1 now states that
  the auth endpoints mount under the /api/v1 base path. Three were the
  Steward's: 10.1 replaces the stale auth-library sentence with the sessions
  table's observable contract (named sessions, user_id ON DELETE CASCADE,
  expires_at reset to 30 days out by every authenticated request); 11.10
  records the createApp construction seam (synchronous, no I/O, injected
  DbClient and auth configuration, environment fallback); 9.2 gains the
  unverified-email page's normative copy. In support: 11.6 records the tz
  carrier, unconditional Secure, and the dev-login flag and build-exclusion
  semantics; 11.15 adds the tsc excluded-file emission hazard; 8.1 conditions
  the login sync on a carried tz and ignores tzdb aliases; the RFC 0001 P1
  row now names the P1 session order, adding the API and Contract role for
  the shared schemas its Owns section already covers. AC-007 and AC-113 are
  unblocked for the Adversarial Test role.
- At the P0 merge, spec 11.5 now records the sanctioned migrator's verified
  behavior, one transaction per run rather than per file, with the external
  fact and its revisit trigger as section 13 item 16; 11.1's second-instance
  checklist adds serializing the boot migration run; 11.10 scopes
  TEST_DATABASE_URL to test and database-script processes.
- Ownership gaps closed at the P0 merge: Vitest configuration and the
  repository root `.gitignore` and `.nvmrc` belong to Platform (10), and
  `app/index.html` belongs to the Frontend Architect (07). P0's placeholder
  client entry files stand as disclosed build anchors until P8 replaces them.
