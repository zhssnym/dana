# RFC 0002: Replace the client user interface with the designer's prototype

- **Status:** Accepted
- **Created:** 2026-08-13
- **Accepted:** 2026-08-13 by the human owner; numbers finalised and both open
  questions closed by the Integration Steward on the same date
- **Returned to Draft:** 2026-08-13 at the P8R mid-package change control. Three
  amendments change the specification delta, which the preamble says returns an
  Accepted RFC to Draft for re-acceptance. They are listed under **Amendments
  after acceptance** below. Nothing else about the RFC moves, no number changes,
  and the implementation plan is unaffected, so a session already building
  against this delta needs only the three
- **Re-accepted:** 2026-08-13 by the human owner, on those three amendments
  alone rather than on the RFC again; numbering re-checked and unchanged by the
  Integration Steward on the same date
- **Target release:** v1, in place of the remainder of package P8D
- **Spec sections touched:** 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.8, 11.4, 11.13, 12, 13
- **Frozen interfaces touched:** none

## Summary

Dana's client user interface is replaced by the designer's committed prototype at
`docs/design/prototype/`, connected to the data layer the application already
has. His markup, his components and his visual composition become the client;
our server, database, shared schemas and every module under
`app/src/client/api/` are untouched. Four structural divergences between his
design and section 9 are resolved in his favour by the owner's rulings of
2026-08-13 and are transcribed here, his hand-rolled calendar replaces
FullCalendar 7, and the dependency set his prototype imports is approved.

## Motivation

Package P8D was chartered to carry the designer's values onto the markup package
P8 built, under a ruling of restyle rather than replacement. The owner opened
both applications side by side on 2026-08-13 and rejected the result. This RFC
exists because that rejection is not a defect in any session's work: six
sessions did what the row told them, and the row was wrong.

**Where the instruction went wrong, verified rather than accepted.** RFC 0001's
P8D row says his pages "are read and never copied", and gives its reason in the
same sentence: "His thirteen screens run on `fixtures.ts` where ours run on the
query layer against a real API with the 10.2 chokepoint behind it, so his pages
are read and never copied, and swapping our tested markup for his untested
markup would trade a proven application for a mock." Read against what it
actually establishes, the first clause argues against copying his data wiring
and against nothing else. A component that renders a task row does not become
untrustworthy because the object it renders arrived from a fixture; what is
untrustworthy is the fixture. The row generalised a narrow and correct ruling
about component provenance, his twenty `components/ui/` files against our seven,
into a rule covering the whole package, and the visual composition that the
owner was actually rejecting sat inside the part that was generalised away.

**The other half of the failure was procedural and is worth one sentence,
because this RFC was written under a correction of it.** `SESSION-LOG.md`
records that nobody ran the prototype: not the kickoff, not the audit, not one
of the six implementing sessions, in a package whose entire subject was
appearance. This RFC was authored with both applications running. That is not
ceremony. Three claims in the research handed to this session were false, and
every one of them was false in a way that only running the application exposes.
They are corrected in **What the prototype actually carries** below, and two of
them change what the implementation must do.

**Why now, and why as a replacement rather than a second restyle.** The port
that was attempted is the expensive way to reach a worse result. Our client
writes named component classes into `tokens.css` and his composes Tailwind
utility strings in the `.tsx` files, so a restyle must re-derive every
composition decision from his files into a different idiom, by hand, with no
check that the derivation was faithful, in a package that adds no acceptance
criterion and therefore cannot be measured. Taking his files removes the
derivation step entirely. What that costs is enumerated in the delta and in
section 13: his markup does not carry the acceptance suite's contract, and the
corrections that make it carry it are specified rather than left to be
discovered.

## What the prototype actually carries

This section carries no authority; it is the evidence the delta was written
from, measured on 2026-08-13 against the running prototype at
`docs/design/prototype` and the running client at `app/`, both started as
`.claude/launch.json` describes them.

**The acceptance suite's role choices are not carried, and this is the finding
that most changes the work.** The research handed to this session states that
"under ruling 4, his markup carries all of this once relabelled". Measured, it
does not:

| What the suite binds | What his prototype renders |
| - | - |
| The sidebar is a navigation landmark (`getByRole('navigation')`, AC-155, AC-173) | No `nav` element and no `role="navigation"` anywhere in the sidebar. Measured: zero of each |
| The six page entries are links (`getByRole('link', { name, exact })`, AC-091, AC-160, AC-171, and `harness.ts`'s `sidebarLink`) | Six `button` elements carrying `aria-current="page"`. The only anchor in the sidebar is the brand |
| Calendar days are grid cells (AC-093, AC-098 in four places, AC-158) | No `role="grid"`, no `gridcell`, no `row`, no `columnheader`, no `table`. His month grid is composed of plain elements |
| The regions "Folder header" and "Sharing panel" (`regionOf`, 9.1's sections table) | Neither exists. His folder page names one section, "All open tasks"; his sharing surface is a dialog named "Share Wedding" holding four named sections |
| Eight `getByLabel` form-field names (`formField`) | Six carry: due date, folder, assignee, due time, reminder, repeat. Two do not: title is labelled "Task name", and important is a button labelled "Mark important" rather than a control named "Important" |

The link choice is not incidental and the suite says so in its own comment: "A
link rather than a button: 9.1's routes are URLs and a page you can reach at a
URL is navigated to, which is also what makes AC-095's second half meaningful."
The task rows, the switch on My Day, the task form's `dialog` role and the
Completed section's `aria-expanded` do carry, and were measured carrying.

**Normative copy is missing, split or reworded in ten places, not four.** The
research names four. Checked string by string against every `.tsx` and `.css`
file in his prototype, with JSX entities decoded and whitespace collapsed the
way JSX collapses it:

| Section 9 string | State in his prototype |
| - | - |
| 9.1's inline failed-read line | Absent. His `InlineError` shows the global toast string, which his own states page annotates as an open copy decision |
| 9.1's 404 line | Absent |
| 9.1's truncation notice | Absent |
| 9.8's already-connected refusal | Absent |
| 9.3's steps cap notice, "Limit 50 steps" | Absent |
| 9.4's abandon confirm | Split across a dialog title and its description, so the sentence never renders as one text run |
| 9.8's remove-connection confirm | Split the same way |
| 9.6's leave confirm | Reworded: "You'll lose access. Tasks assigned to you in this folder will become unassigned." |
| 9.6's remove-member confirm | Reworded: "They'll lose access to {folder}. Tasks assigned to them in this folder will become unassigned." |
| 9.6's delete-folder confirm | First clause is the dialog title; the second sentence matches |

Section 5.1's conflict copy is produced by our `queryClient.ts` and is correctly
absent from his prototype, which needs nothing. Everything the research reports
as present is present and was verified: all ten of section 6's empty states, the
offline banner, both toasts, 9.7's three sentences, the G-SERIES un-complete
confirm, the ghost banner, the date-dependent helper, the clear-date warning,
the empty-title message, the delete-task confirm, the resend tooltip and the
search footer, each character exact.

**Two of the research's cautions are wrong in the prototype's favour, and both
were corrected by opening it.** His task form does carry an assignee field,
labelled "Assignee" and rendered on `members.length >= 2`, which is 9.3's own
visibility rule; it is invisible in the default fixture because Inbox holds one
member. And his task history block already renders `"Deleted user"` for a null
author and a null completer, which is the rendering section 13 item 27 says v1
ships no surface for.

**Provenance.** His `components.json` declares `$schema:
https://ui.shadcn.com/schema.json` with style `base-mira`. His twenty
`components/ui/` files are shadcn components in shadcn's Base UI distribution,
copied in as that project distributes them. Adopting them is what 11.4's own
sentence has asked for since it was written, so section 13 item 30 closes here
rather than widening.

## Amendments after acceptance

Three, all made at the P8R mid-package change control on 2026-08-13, all inside
section 9 and none touching a frozen section. Each changes the specification
delta, so the RFC returns to Draft for re-acceptance under the preamble's own
rule, and the owner's decision is on these three alone rather than on the RFC
again. Two of them block the sessions after R4 and the third is already costing
one, which is why they arrive mid-package rather than at a merge review.

1. **Ten unnamed controls get normative names**, added as eleven rows to 9.1's
   names table with their reasons beside it. The Adversarial Test Engineer
   escalated them after writing criteria it could not fully express: a control
   this specification does not name is reachable only by position, which 9.1's
   addressing sentence exists to forbid, so a criterion written against one would
   assert the implementation rather than the contract. R3 has already shipped
   four of them, and what it shipped was checked before these names were ruled
   rather than after. Three agree and stand: the quick-add's two states are
   already "Add a task", the task row's completion checkbox is already "Complete
   task" and "Mark as not done", and its overflow menu is already "More actions".
   Four disagree and are corrections owed to role 08, listed in the changelog
   entry and in this session's final block.
2. **9.8 loses the People screen's invite list, and AC-172 loses its third
   clause.** The gate renders at every /app path while Q12 is non-empty and
   /app/people is an /app path, so the sentence described a surface no person
   could reach. The reasoning and the rejected alternative are in the 9.8 unit.
3. **9.4 gains the rule that a task row opens its form**, on every page and
   whatever the task's status. It was stated once, in 9.5's Planned bullet, where
   it read as a property of the calendar, and the status half was never stated at
   all, which left AC-178 and AC-179 asserting a form they had no specified way
   to open.

**Re-accepted on 2026-08-13 by the human owner, on all three.** The status line
above reads Accepted from that date, and the decision was on these three items
rather than on the RFC again, which is the whole of what returning it to Draft
put in front of him.

The preamble has the Steward assign final numbers at acceptance, a Draft's
numbering being provisional, so the check was run again rather than inherited
from the first acceptance. Verified on 2026-08-13 against the specification and
against every other RFC in the repository: section 12 still ends at AC-173,
section 13 still ends at item 34, AC-174 to AC-183 and items 35 to 37 are still
claimed by nothing outside this file, and RFC 0001 is still the only other RFC
and still adds no criterion of its own. The three amendments assign no number
between them. The first is eleven rows inside a table the 9.1 unit already
carried. The second strikes a sentence from the 9.8 unit and a clause from the
text of AC-172, a criterion this RFC was already rewriting under its own number.
The third is a new delta unit whose rule AC-178 and AC-179 already assert, which
is why it was missing rather than new. Everything from the section 12 unit to
the end of this file, the ten new criteria and the three section 13 items
included, is unchanged, and so is the implementation plan.

Two figures did move and neither is a number anything cites: the delta is
sixteen units rather than fifteen, and the touched-sections line carries 9.4.
One thing the plan does not carry is worth naming here rather than leaving to be
found, because the plan is untouched by design and this is the reason somebody
might think it should not have been. R3 has landed, and amendment 1 rules four
names against what it shipped, so corrections are owed inside R3's own paths
with no row scheduling them; they are enumerated in the changelog entry for the
change control, and the sessions from R5 on build against the ruled names either
way.

## Specification delta

Sixteen units. Three of them replace something smaller than a numbered section:
one table row in 11.13, three acceptance criteria by number, and two items of
section 13. The criterion form is the preamble's own, which says an invalidated
criterion is never deleted and a Replace unit names it and rewrites it, and the
other two are that principle applied one level out. Each names its target
uniquely, by the row's first cell and by the item's number, so the merge stays
mechanical, which is the property the preamble's three operations exist to
protect. Reproducing all of 11.13 to change one cell, or all of section 13 to
change two items, would carry more transcription risk than it removes.

### Replace section 9.1

```markdown
### 9.1 Global chrome

- Sidebar: the application's only chrome. Header carrying the app name (links to My Day) and the global search control (keyboard shortcut Ctrl+K or /); pages in fixed order My Day, Tasks, Planned, Important, All, Done, each present only if permanent or toggled visible; divider; folder list; "New folder" action; People and Settings; footer carrying the avatar menu (Settings, Sign out).
- Folder list: Inbox pinned first with pending-count badge; then per-member label groups (collapsible, labels ascending), each folder showing color dot, name, pending count; unlabeled folders after the labeled groups, name ascending. Inbox shows a colour dot like every other folder row, ruled at the P8 merge on 2026-08-12 because the sentence is readable either way: Inbox has its own clause naming only the badge, and "each folder" is universal over the list. It is universal. The design brief this sentence was written from states it as its own final sentence over the whole list, after Inbox, the label groups and the unlabeled folders have each been placed, so the three adornments are a property of a folder row rather than of a group; Inbox's clause fixes where it sits rather than enumerating what it carries. And frozen 4.4 gives folder_members.color a free-form #RRGGBB check with no exclusion for the default folder, which 7.4's my-membership accepts on any membership, so a reading that withheld the dot from Inbox would let a person set a colour the product then never shows them. AC-173's "each folder row" already reaches this row and no criterion text moves.
- Folder groups: a group is created by naming it, renamed, and deleted; a folder is moved between groups from its own menu. A group is the label of 7.4's my-membership and nothing else, so creating one is naming it on a folder, and deleting one clears that label from every folder carrying it. Deleting a group deletes no folder and no task: confirm "Delete folder group? {N} folders keep their tasks and move to the ungrouped list."
- Floating add button: bottom right on every page except Done; opens the task form with the entry-point defaults of 9.3.
- Inline quick-add: at the bottom of Tasks groups, Planned list, and the folder page's open list. Collapsed by default to a single control; activating it reveals a title input, focused, with an escalation control opening the full task form at the same entry point; enter saves immediately with all other fields at that entry point's defaults; escape clears and returns it to collapsed.
- Sidebar view preferences: the sidebar's width and whether it is collapsed to an icon rail are the viewer's, persisted client-side, and change nothing about what the sidebar holds. This section fixes the contents and their order; it fixes no width, and a persisted width is a preference rather than a layout.
- Offline banner (global, persistent while offline): "You're offline. Dana needs a connection; changes can't be saved right now." Writes attempted offline fail with the toast "Couldn't save. You're offline."
- Global error toast for failed requests: "Something went wrong. Nothing was saved. Try again." 409 conflicts show the state machine copy of 5.1 verbatim.

The top bar is removed, transcribed here from the owner's ruling of 2026-08-13. Until that date this section opened with a top bar carrying the app name, the global search control and the avatar menu, and the designer's prototype has no top bar at all, putting the first two in the sidebar header and the third in the sidebar footer. The P8D kickoff read that as a relocation of three named controls rather than a skin of them and refused it, correctly under the rule it had: 11.13 makes section 9 win over an artifact on structure. The owner ruled the other way on the merits, and this section is what changes so that the rule does not have to. What this section has ever required of those three controls is that they exist, that the app name links to My Day, and that each is reachable by its role and its name; where they sit was structure this section happened to fix and had no reason to. All three obligations are unchanged above.

Routes, added to this section at the P8 kickoff on 2026-08-10 because AC-095 asserts one and this section named none. That criterion requires a page hidden from the sidebar to still render at its URL, which no acceptance test can address and no client can be measured against while the paths exist only inside the router P8 writes. Recording them here rather than there is what keeps the suite reading a specification instead of an implementation, the standing reason the tester session precedes the implementer. The paths are derived rather than invented: 11.1 gives the server the landing page and the built client and nothing else, 10.6 fixes the installed app's start_url at /app, and the page set and its order are this section's own.

| Surface | Path |
| - | - |
| Landing (9.2) | / |
| My Day | /app |
| Tasks | /app/tasks |
| Planned | /app/planned |
| Important | /app/important |
| All | /app/all |
| Done | /app/done |
| Folder page (9.6) | /app/folders/:id |
| Settings (9.7) | /app/settings |
| People (9.8) | /app/people |

My Day is /app rather than /app/my-day because 10.6 fixes start_url there and 9.2 lands first-run on My Day, so a separate path would leave the installed app opening on a redirect. Four surfaces deliberately have no path. The search overlay of 9.9 opens over whatever page is beneath it. Planned's list and calendar modes are a choice 9.5 persists client-side, not two pages. The unverified-email page of 9.2 is rendered by the callback in place of establishing a session, so it is the server's response to one request rather than a client route. And the invite gate of 9.8 renders in place of the application at whichever /app path was asked for, being a condition on the account rather than a place in it. Every /app path falls back to the cached shell per 10.6; / does not.

Addressing. Every control this section names is reachable by its accessible role and by its normative name, so the copy above is what a screen reader announces and what a test addresses rather than only what is painted. This states what the section already implied, its copy being normative and its icon-only controls already owing a screen reader label. It is stated because the alternative, addressing a control by a class or a test identifier, would make an acceptance criterion depend on markup this section deliberately leaves free, and would put the tester in the business of specifying the implementer's internals.

Roles, added at the RFC 0002 change control on 2026-08-13. The addressing sentence above fixes that a control is reached by its role and never says which role any control has, so the roles the acceptance suite reads have been the tester's inference from this section's other sentences, defended in comments in `harness.ts` rather than in this document. That was tolerable while one client was being written against the suite and stopped being tolerable when a second body of markup arrived: the designer's prototype satisfies every name in the table below and diverges on four of the six rows here, which is a divergence no reader of this section could have been expected to anticipate because this section did not say. The roles are recorded rather than relaxed, and the ground for each is a sentence this section already carries.

| Element | Role | Why this role |
| - | - | - |
| The sidebar | A navigation landmark | It is this section's only chrome and holds the page set; a landmark is what lets a person skip to it |
| The six page entries, and each folder row | Links | The routes table above makes every page a URL, and a page reachable at a URL is navigated to. AC-095's second half, that a hidden page still renders at its path, is meaningful only if the client agrees |
| A task row | A list item, or a row | 9.4 enumerates what one holds, so a row is a real thing here; whether a page builds its list as a list or as a grid is left free, and both accessible shapes are admitted |
| The task form | A dialog | 9.3 makes it one artifact over a page rather than a page |
| A toggle switch | A switch | 9.4 and 9.7 call them switches |
| A calendar day | A grid cell within a grid | 9.5's month zoom is a fixed six-week grid of days, which is a grid |

The search input is a search box or a text box, either being true of it. Nothing else in this section has its role fixed here, and a control not in this table is reached by its role in the ordinary sense of the word.

Names, added at the P8 change control on 2026-08-11. The addressing sentence above reaches only the controls this section names, and it named eight of them by description alone, so the suite matched a description and escalated each gap rather than inventing a string. The names are assigned here because that reaches further for less than anything else available: a description matched loosely is a locator that finds the wrong control on the day a second one resembles it, and every name below is either lifted from this specification's own words or is the shortest thing the control does.

| Control | Name |
| - | - |
| Global search control (9.1) | "Search" |
| Floating add button (9.1) | "Add task" |
| Inline quick-add, collapsed and expanded alike (9.1) | "Add a task" |
| The task form's save control (9.3) | "Save" |
| The steps editor's append control (9.3) | "Add step" |
| The task form's overflow menu (9.3) | "More actions" |
| A task row's overflow menu (9.4) | "More actions" |
| The two controls of every confirmation (9.3 to 9.9) | "Continue" and "Cancel" |
| The inline retry control (9.4) | "Try again" |
| The quick-add's escalation control (9.1) | "Open full form" |
| A task row's completion checkbox, and the task form's completion control (9.3, 9.4) | "Complete task" when open, "Mark as not done" when complete |
| A sidebar folder row's menu, and a folder group's menu (9.1) | "More actions" |
| The folder page's open-list filter (9.6) | "Filter open tasks", offering "All open tasks", "With a due date" and "Without a due date" |
| The folder-group actions (9.1) | "New folder group", "Rename group", "Delete group", "Move to group" |
| The "New folder" dialog's field (9.1) | "Folder name" |
| A folder-group dialog's field (9.1) | "Group name" |
| The "Label and color" dialog's two fields (9.6) | "Label" and "Color" |
| The sidebar's rail control (9.1) | "Collapse sidebar" when expanded, "Expand sidebar" when collapsed |
| The two resize handles (9.1, 9.3) | "Resize sidebar" and "Resize task form" |
| The avatar menu (9.1) | "Account" |

The last row arrived later, at the second change control of 2026-08-11 that wrote the inline state copy below; the eight above it are the first pass and the four sentences that follow are about them.

Four of those eight are worth their reason. The floating add button is called "the + button" by Q5's empty state, which is a glyph rather than a name, and "Add task" separates it from the quick-add beneath it on the same page. That quick-add takes "Add a task", the words the design brief already uses for it. The overflow menus take "More actions" rather than "More options" because 9.3 spends the second on the form's expander, and a page carrying both would otherwise have two different controls answering to one name. And every confirmation offers "Continue" and "Cancel" uniformly, "Continue" being this section's own word in 9.5's un-complete confirm: the destructive verb is already in the normative message the person is reading, so spelling it again on the button buys nothing and costs four more strings to keep in step with four messages.

The quick-add's row carries one name across two states, amended at the RFC 0002 change control on 2026-08-13 when the row became a disclosure. Collapsed it is a control and expanded it is a text box, they are never on the page at the same time, and they are one affordance to the person using them, so one name is what is true. The distinction the name has to survive is against the floating add button on the same page, which is what "Add task" against "Add a task" was chosen for and which is unaffected by the state.

The last eleven rows were added at the P8R mid-package change control on 2026-08-13, on the Adversarial Test Engineer's escalation after it wrote criteria it could not fully express. RFC 0002 admits ten controls this section had never named, and a control with no name is reachable only by position, which the addressing sentence above exists to forbid; a criterion written against one would be asserting the implementation. Six of them apply the rules this table already states rather than adding anything, and five are worth their reason.

The quick-add's escalation control takes a name of its own rather than "More options", which is 9.3's word for the form's expander. The two are not alternatives on the same page, they are alternatives at the same instant: the escalation control opens the form, and while the form is open its expander is on the page behind the dialog's scrim, so a page can hold both. "Open full form" is the shortest thing the control does, and it is not interpolated with the folder it sits beside, because a name in this table is a fixed string and the region rule below is what tells two instances apart.

The completion control of 9.3 and the completion checkbox of 9.4 share both of their names, being one control pointed at one object from two places. They carry two names rather than one for 9.5's reason at the star: the control is a toggle and icon-only, so each state owes a screen reader something true, and "Mark as not done" is the name 9.5 already fixes for the same transition on Done. The rail control takes two names for the same reason.

A sidebar folder row's menu and a folder group's menu take "More actions", making four controls that share it. That is this section's own argument at the folder header, applied again rather than reconsidered: they are the same control pointed at different objects, a fourth name would assert a difference in kind that is not there, and each is reached the way a task row's menu is reached, inside the row or the region that names its object.

The avatar menu takes "Account" rather than a name interpolating the person's own name. What the control opens is the viewer's account, there is exactly one of it, and a name carrying the display name would make the one control in this table whose string a test cannot know before it reads the fixture.

The three dialogs name their fields and not themselves. A dialog is announced by its own title, which this specification writes elsewhere; what a test and a screen reader need is the field inside it, which is what 9.3's ten form fields already establish for the form and what these three follow.

Sections, added at the same change control on 2026-08-11 and routed back by the tester return that took the names above. A name identifies a control that appears once on a page, and three of these appear more than once: the quick-add sits at the bottom of every Tasks group, the Planned list and the folder page's open list, "More actions" opens on every task row, and a task row repeats down every page. That was tolerable while every instance behaved identically and stopped being tolerable the moment 9.3 gave two quick-adds on one page different due dates, since two are one control with one name in two sections and no property of either input tells them apart.

The container is named rather than the control, and the reason is that qualifying the control does not scale. Tasks carries one quick-add per folder group, so its instances number as many folders as hold undated tasks, and a table of names cannot enumerate a set the data decides. Naming containers costs almost nothing extra, because this section already names most of them.

Every section a page's structure names is a named region, and a control inside one is addressed as that control within that region. The region's name is the heading this section gives it where it gives one, and the datum the section is generated from where it does not:

| Page | Regions and their names |
| - | - |
| Sidebar (9.1) | one per personal label group, named by that label |
| My Day (9.4) | "Carried over", "Today", and "Done today (N)", exactly as the headings there read, the count included |
| Tasks (9.5) | "Inbox", then one per folder group named by that folder |
| All (9.5) | "Planned" and "Tasks", the second carrying the Tasks page's own regions inside it |
| Done (9.5) | one per day group, named by the day it groups |
| Folder page (9.6) | "Folder header", then "All open tasks" and "Completed", and "Sharing panel" while it is open |
| Settings (9.7) | "Pages", "Account", "Danger zone" |
| Search overlay (9.9) | "Pending", "Abandoned", "Completed" |

Planned's list and Important carry one section each and need none. Four consequences are worth stating.

A collapsible section is a named region together with a control carrying that same name, and the control's expanded state is what open and collapsed mean. That covers the Completed section of 9.6, the recap of 9.4 and the label groups of 9.1, and it is what makes "collapsed" something a reader and a test observe rather than infer from a visual impression. AC-058's clause reads on that state.

Tasks' Inbox block is a named region with no visible heading, which does not contradict 9.5 calling it ungrouped. A region's name is announced and addressed, not rendered, exactly as a control's is, so the block still reads as a plain list on top with no label above it, and naming it is what separates its rows and its quick-add from the folder groups beneath.

Where a region's name comes from data rather than from this section, a test addresses it by the text the page rendered rather than by a string fixed here. Done's day groups are the case: the format of a date is the design's and this section has never spelled one.

And one adjacent silence is closed with them, because it sits inside the same table and would otherwise be raised against it: the Inbox block carries a quick-add like every folder group on that page. This section places the quick-add at the bottom of Tasks groups and 9.5 calls the Inbox block ungrouped, which left the one folder every account has as the only one on that page that could not be quick-added into, on a page whose whole purpose is capture without a date.

The folder page's header and its sharing panel are regions by that same rule, added to the table above at the second P8 change control on 2026-08-11, on the tester session's escalation. 9.6 puts an overflow menu in the folder header, which is a third control answering to "More actions" after the task form's and a task row's, and the table was written against Q7's three body sections so it reached neither the header nor the panel. Giving the folder's menu a name of its own was declined: the two named menus share "More actions" deliberately, being the same control pointed at different objects, and a third name would assert a difference in kind that is not there, while the sections ruling's own argument applies unchanged, that naming containers scales where qualifying controls does not. Naming the header also reaches further for less, because AC-058's 8.11 ratio is rendered in it, the Share button and the inline rename sit beside the menu, and all four would otherwise be addressed by looking anywhere on the page. Both names are 9.6's own words, and the sharing panel keeps its region name whether it is rendered beside the list or over it, that being presentation and the name being addressing.

The folder page's body rows changed at the RFC 0002 change control on 2026-08-13, from "Scheduled", "Unscheduled" and "Completed" to "All open tasks" and "Completed", following 9.6's own restructuring there. Nothing about the rule moves.

Inline state copy, added at the change control of 2026-08-11, because three of the states this section gives every page had no words at all. 9.4 writes the error state as "global toast plus inline retry" and this section spells only the toast; section 6 ends its cap rule with "the UI shows a notice" and writes no notice; and 10.2's rule that an inaccessible resource reads as nonexistent reaches a page that then has nothing to say. The copy sits here rather than beside each of those rules because these are page states and page states are this section's, and none of the rules that produce them moves. Normative like the rest of this section's copy:

| State | Copy |
| - | - |
| A read that failed, beside the thing that failed | "Couldn't load this. Nothing was changed.", with the "Try again" control of the table above |
| A resource that answers 404 (10.2) | "Not found. This may have been deleted, or it may never have been yours to see." |
| A response carrying truncated (section 6's cap rule) | "This list is long, so only the first part is shown. Narrow it down to see the rest." |

All three strings are the client's first passes, adopted rather than rewritten, and each is adopted for a reason. The failed read says what was not changed, which is the question a failure raises and which this section's own toasts already answer that way. The 404 line states both of 10.2's cases in one sentence without telling a reader which of them they met, which is what that chokepoint exists for. The notice interpolates no number, the flag reporting that rows were dropped and never how many, so a client spelling "1000" would be transcribing a limit of 10.3 the response does not carry and a later release may move. Two of the three are asserted by AC-171; the notice is asserted by nothing, deliberately, because producing it takes a thousand and one rows through section 7 and section 13 item 6 records that the cap is unreachable at v1 scale. It is written down so that it is one string chosen once rather than one per page.

The inline failed-read line is the page's own words and never the global toast's, restated at the RFC 0002 change control on 2026-08-13 because the designer's prototype renders the toast string inline and annotates the substitution as an open decision on its own states page. It is not open. The two strings answer different questions: the toast reports that a write did not land, and this line reports that a read did not arrive, so a page showing "Nothing was saved" where nothing was being saved tells a person something false about their own data.
```

### Replace section 9.2

```markdown
### 9.2 Landing and login

Public page: one screen describing the shipping product, collaborative to-do lists in shareable folders; no AI claim anywhere in v1 copy; a single "Continue with Google" control; privacy and terms links. Beside the copy, a product preview panel showing a shared folder as the product renders one. After callback, first-run lands on My Day; pending invites, when any exist, gate the application first as 9.8 describes.

Copy, normative like the rest of this section and the designer's, adopted by the owner's ruling of 2026-08-13:

| Element | Copy |
| - | - |
| Eyebrow | "PERSONAL FOCUS. SHARED PLANS." |
| Heading | "Your tasks, kept clear. Your plans, shared." |
| Subheading | "Dana brings personal tasks and collaborative to-do lists together in clear, shareable folders, so everyone knows what comes next." |
| Under the sign-in control | "Dana requests only your Google profile and email for sign-in, sharing, and invitations." |
| Preview panel heading | "BUILT AROUND SHAREABLE FOLDERS" |
| Preview panel body | "One folder keeps every person, task, and decision in context." |
| Closing block | "Plan privately. Coordinate clearly." with "Keep personal work focused, then share only the folders that need other people." |

The copy that shipped at P8 was the human owner's own, written on 2026-08-11 and recorded as closing section 13 item 14. It is replaced by the designer's on the owner's ruling of 2026-08-13, and item 14 reopens and closes again on the same date against this text: the constraint that item ever recorded was 9.2's no-AI-claim rule rather than who held the pen, and this copy carries it. AC-159 asserts the page including that rule, so nothing about the protection depends on anyone remembering it.

The sign-in control is a link and not a button, which is behaviour rather than presentation and is stated because the prototype renders a button. It carries the viewer's detected timezone to the authorisation endpoint of section 7, which is how a first session gets a timezone before any row exists to hold one; a button with a click handler could carry it too, and a link is what makes the destination visible, bookmarkable and reachable with scripting unavailable. AC-159 admits either role deliberately and does not settle this.

Unverified-email rejection page (10.1; AC-008): rendered by the callback in place of establishing a session when Google reports the email unverified; no rows are created. Copy, normative like all copy in this section: heading "We can't sign you in yet"; body "Your Google email address isn't verified. Dana uses your email for sharing and invites, so it needs Google to confirm it first. Verify your email with Google, then try again."; one action, a link labeled "Back to Dana", returning to the landing page.
```

### Replace section 9.3

Only the paragraphs that change are reproduced with the section; the dependency
graph, the entry-point defaults and the four rulings the section already carries
are unchanged and are repeated so the unit merges as one replacement.

```markdown
### 9.3 Task form (create and edit are the same artifact)

Always visible: title (required), inline quick-set for due date, inline toggle for important. Behind one "More options" expander: notes, folder, assignee, due time, reminder, repeat, steps. The form is a dialog over the page it was opened from.

Dependency graph (disabled means visible but inoperable with helper text; hidden means absent):

| Field | Visible when | Enabled when | On disable, helper |
| - | - | - | - |
| title | always | always | none |
| due date | always | always | none |
| important | always | always | none |
| notes | expanded | always | none |
| folder | expanded | always | none |
| assignee | expanded and target folder has 2 or more members | always when visible | hidden in single-member folders (INV-5) |
| due time | expanded | due date set | "Set a due date first" |
| reminder | expanded | due date set | "Set a due date first" |
| repeat | expanded | due date set | "Set a due date first" |
| steps | expanded | always | none |

Each field is announced by its own name, which is the name in the first column and not a synonym for it. This is the addressing sentence of 9.1 applied to the ten fields, stated here at the RFC 0002 change control on 2026-08-13 because a form is where the rule bites hardest and where it was found broken: a field labelled "Task name" is the title field wearing a different word, and the difference is invisible to everyone except a screen reader and a test.

Moment of enablement: the instant due date receives a value, in the same render; clearing it disables and clears the three dependents after the 8.4 warning: "Clearing the date also ends the repeat and removes the reminder."

Behavior rules: folder selection re-filters the assignee dropdown to that folder's members plus "Invite by email", which opens the sharing flow with this folder attached and, on send, shows the pending chip; assignee defaults to the viewer; reminder control switches mode with due time (offset picker with due time, time-of-day picker without); repeat control is preset-driven (daily, weekdays, weekly on chosen days, every N days or weeks, monthly on day 1 to 28, yearly) with an optional "Ends on" date, never a raw RRULE box; steps editor: text row, enter appends the next row, per-row check, delete, and up or down reorder controls, cap notice at 50.

In edit mode the form additionally carries a completion control and a read-only history block, both added at the RFC 0002 change control on 2026-08-13 from the designer's prototype. The completion control completes and un-completes the open task, is the same transition 9.4's row checkbox and 9.5's "Mark as not done" make, and takes 9.5's confirmation unchanged on the G-SERIES successor branch. The history block renders the task's creation and, when it has one, its completion: who and when, from the created_by, created_at, completed_by and completed_at of frozen 7.2's TaskDetail, which has carried all four since the API was written. It is read-only and offers no action. An author or completer whose account has been deleted renders "Deleted user", which is 4.1's own note and 8.10's, and this is the first surface in Dana that reads either column; section 13 item 27 records that until this change no surface did.

The form's width is the viewer's, persisted client-side, on the sidebar's rule in 9.1: this section fixes what the form holds and in what order, and fixes no width.

Entry-point defaults:

| Opened from | due date | important | folder | other |
| - | - | - | - | - |
| Tasks, All, or bare button | empty | off | Inbox | none |
| My Day | today | off | Inbox | none |
| Planned list | today | off | Inbox | none |
| Planned calendar cell | that cell's date | off | Inbox | none |
| Important | empty | on | Inbox | none |
| Folder page | empty | off | that folder | none |

The folder page's row, restated at the RFC 0002 change control on 2026-08-13 following 9.6's restructuring. It read "per that folder's section context" and was closed at the P8 change control by giving the Scheduled section's quick-add today and the Unscheduled section's empty; 9.6 now carries one open list and no such sections, so there is no context left to read and the cell states its value directly. The value is the one the earlier ruling gave the page's own floating button and gave for a reason that survives the restructuring intact: a folder is not a dated page. My Day, the Planned list and a calendar cell each default to a date because the page the person is standing on is about that date, while Tasks and All default to none because they are not, and a folder holds both kinds of task at once. Defaulting to today would file a task under a date nobody aimed at, and clearing a date that was added for you costs more than adding one that was not. AC-093 asserts this row and is rewritten by that RFC rather than left to fail.

Validation copy: empty title, "Give it a title"; over-limit fields show "Too long: limit N characters"; the steps editor's cap notice reads "Limit 50 steps"; reminder mode mismatch is impossible in the UI and returns 422 server-side regardless.

Edit mode differences: fields pre-filled; folder change shows, when the assignee would not survive the move, "Moving will unassign Sara; she isn't a member of Home." Delete lives in the form's overflow menu with confirm "Delete this task? This can't be undone."

The assignee dropdown offers no unassignment, ruled at the second P8 change control on 2026-08-11. Section 4 makes assignee_id nullable and this section listed the dropdown's contents without saying whether that null is reachable from it, so the question was asked from the implementation rather than answered by the text. It is not reachable: the dropdown is the target folder's members plus "Invite by email" and nothing else. Three reasons, and one cost stated with them. AC-094 asserts exactly that list, so a "Nobody" option would falsify a criterion that passes, and closing a silence by invalidating a criterion trades the wrong way round. The field is hidden in single-member folders, which is where unassigning is refused by INV-5 with the 409 of AC-032, so nothing is lost at the only place the refusal bites. And this section defaults the assignee to the viewer, so a task written through this form always has someone to answer for it, while the null INV-5 permits in a larger folder arrives from events rather than choices: a move to a folder the assignee is not a member of (7.6), and the R-CLEAN of 5.3 when a member is removed or leaves. The cost is that a task in a multi-member folder can be reassigned from the interface and not unassigned, which is recorded as section 13 item 28 with what changes if evidence arrives.

The reminder is saved like every other field of this form, ruled at the same change control after the co-lead found that it was not. The control implements the two modes above and its dependency on the date; what the two write paths differ over is where it goes. A reminder set while creating rides the reminder arm of frozen 7.6's create body, and a reminder set or changed while editing is frozen 7.9's PUT, whose removal arm is DELETE /tasks/:id/reminder because no task body expresses a removal; 8.6 names all three of those writes. This is stated because it is the one field of the ten above whose write reaches an endpoint the rest of the form does not, which is how it came to be held in the form and dropped at save with every test green: AC-092 reads the form's state and says so itself, AC-146 to AC-150 read the endpoints, and nothing read the two together until AC-169 and AC-170.
```

### Replace section 9.4

```markdown
### 9.4 My Day

Structure: header with the date; important-only toggle switch; Carried group (heading "Carried over"); Today group (heading "Today"); recap collapsed at bottom (heading "Done today (N)").
Row elements: complete checkbox, title, folder label, due badge (overdue styled when due_date < today), assignee chip when not the viewer, star, pulled marker with un-pull control when inclusion came from an entry ("Remove from My Day"; absent when the row also qualifies automatically), overflow (edit, abandon, delete).
Abandon from here uses copy: "Abandon this task? It stops appearing in My Day but stays everywhere else." Empty state: per Q1. Error state: global toast plus inline retry.

A task row opens that task's form, on every page that draws one and whatever the task's status, added at the P8R mid-package change control on 2026-08-13. This is written here because the row is defined here and the rule is the row's rather than any page's; it was previously stated once, in 9.5's Planned bullet, where it read as a property of the calendar. Three things need it stated generally. 9.3's form is one artifact for create and edit and this is how a person reaches the edit half, so a page whose rows did not open would have tasks that can be made and never changed. The status clause is the part that was actually missing: a completed row opens too, which is what 9.3's completion control and its history block are reached through, and what AC-178 and AC-179 assert; an abandoned row opens for the same reason, its "Restore" control being one way back and its form the other. And the rule is what makes the row's own accessible name meaningful, a row being a thing that is opened rather than only read.
```

### Replace section 9.5

```markdown
### 9.5 Tasks, Planned, Important, All, Done

- Tasks: ungrouped Inbox block, then folder-headed groups; inline quick-add per group and on the Inbox block, adding into that folder, undated. Each is a named region per 9.1, the Inbox block's name carrying no visible heading.
- Planned: mode toggle list/calendar (persisted per user client-side); list per Q3; calendar per Q3C with day, week, month zooms, previous/next/today controls, all-day banner lane, timed lane when due_time set, ghost styling for virtual instances, click on empty cell opens the form with that date, click on any row opens the task, click on a ghost opens the current occurrence with the banner "Upcoming occurrence of a repeating task"; the month zoom requests the whole weeks overlapping the month, six of them, so one request covers 42 days and the grid keeps its height as the months change; weeks begin on Monday. A day cell showing fewer rows than the day holds carries a control reading "+N more" for the remainder, which reveals them; the grid's constant height is what makes the control necessary, a cell that grew to fit its contents being the thing that height forbids.
- Important: single list per Q4; star on each row un-stars it with immediate removal from view; star tooltip points outward as Q4 defines. On every other page the star's name is its own state, "Important" when filled and "Mark as important" when not, which is both its tooltip and its accessible name. That inward copy was a silence closed at the P8 change control on 2026-08-11: AC-099 requires the tooltip to confirm importance off Important and this section spelled no string for it, so the criterion could assert only that the tooltip did not point outward. Two names rather than one because the star is a toggle and icon-only, so each state owes a screen reader something true, and because AC-055's un-star needs a control it can ask for by name.
- All: two labeled sections, "Planned" then "Tasks", each rendered by its home page's rules; section headers are static labels, not links.
- Done: day-grouped infinite scroll per Q6; each row has "Mark as not done", which runs uncomplete and, on the G-SERIES successor branch, first confirms "This removes the next scheduled occurrence (including any edits to it). Continue?"; no add affordance anywhere on this page.
- Abandoned rows on Tasks, Planned, Important, All, and folder pages render faded and struck with an "Abandoned" chip and a "Restore" control.

Completing a task is immediate and is not offered an undo window, restated at the RFC 0002 change control on 2026-08-13 because the designer's prototype offers one and it does not port. The undo this product specifies is Done's "Mark as not done" above, together with the row checkbox of 9.4, both of which are ordinary transitions of 5.1 that a person can make at any later time. A five-second window in which a completed task is not yet really completed has no representation on the wire: section 5's transitions are immediate, 8.3 refetches after each own mutation, and a client holding the write back for five seconds would have to answer what its own list shows meanwhile and what happens when the tab closes inside the window. What the prototype's treatment contributes and what does port is the confirmation of completion itself, as a toast without the undo control.

The month zoom's six weeks, ruled at the P6 mid-package change control on 2026-08-10, the range being the client's to request and Q3C answering whatever range it receives. The count is fixed rather than the four or five weeks a month strictly needs, and the reason is not a test's convenience although it was a test that surfaced it. AC-082's third clause, that ghosts appear only after the current occurrence, is positively observable only on a grid reaching past the month end: for July 2026 the current occurrence is due the 27th and the next instance falls on 2026-08-03, which neither five-week grid reaches and both six-week grids do, on either week start, measured rather than reasoned. A month view stopping at the month end hides the next occurrence of every series whose successor lands in the first days of the following month, which is the case the ghost exists to show, so the criterion and the product want the same grid. Six weeks is 42 days and never approaches Q3C's 62-day refusal. The week the grid starts on was left to the designer there and he has answered it, Monday, which is now in the bullet above rather than in a prototype file.
```

### Replace section 9.6

```markdown
### 9.6 Folder page

Header: name (inline rename for owner), completion ratio, member avatar stack, Share button, overflow menu (Rename owner-only, Label and color personal, Leave non-owner, Delete owner-only with confirm listing counts: "Delete Work? This permanently deletes 28 open, 12 completed, and 3 abandoned tasks for every member."). "Label and color" opens a dialog taking the folder's personal label and its colour together, both being the two fields of 7.4's my-membership and neither meaning anything without the other.
Body: one open list holding every open task in the folder, dated and undated together, ordered per Q7; above it a filter, "Filter open tasks", offering "All open tasks", "With a due date" and "Without a due date"; then a collapsed Completed section, per Q7. Inline quick-add at the foot of the open list; FAB present.
Sharing panel: member list with joined dates and remove controls per the 5.4 matrix; roster picker ("Share with someone you're connected to"); email field ("Invite by email"); pending invites list with exact email, sent time, Cancel, Resend (disabled within 24 hours, tooltip "Resent recently").

One open list rather than two, transcribed here from the owner's ruling of 2026-08-13 and recording the designer's DES-062, which `design-contract.md` carries as superseding DES-060. This section fixed a Scheduled section and an Unscheduled section from the day it was written, and the P8D kickoff refused the prototype's single list on the ground that 9.6 is normative and an artifact does not amend it, which was the correct reading of the rule and is why the change arrives here as text rather than as a port. What the owner ruled on is the merits: a folder is the one page in Dana that holds both kinds of task, section 6's Q7 already returns them as one ordered result, and splitting that result into two headed lists asks a person to know which half a task is in before they can find it. The filter is what the two sections were doing that the single list would otherwise lose, and it does it as a question the person asks rather than as a shape the page imposes.

Three consequences, stated so no reader has to work them out. The named regions of 9.1 for this page become "Folder header", "All open tasks", "Completed" and "Sharing panel"; the two names that go are section names and no other rule moves. There is one quick-add on this page and not two, so 9.3's folder row of the entry-point table no longer reads a section context and states its value outright, which is the same value the page's floating button already had. And AC-093 and AC-166 both turn on which of the two sections a quick-add sits in; they are rewritten by RFC 0002 rather than left to fail, and AC-058, which asserts Q7's own scheduled and unscheduled arrays on the wire, is untouched because section 6 and section 7 do not move.

Two confirmations this section named and did not write, added at the second P8 change control on 2026-08-11. Leave and the sharing panel's remove control each carry exactly the invisible consequence the four confirmations section 9 does write exist to state, 5.3's R-CLEAN clearing that person's assignments in this folder and deleting their My Day entries for its tasks, and neither had a word of copy while four others were spelled letter by letter. Copy, normative like the rest:

- Leave: "Leave Work? You lose access to it, and anything in it assigned to you becomes unassigned."
- Remove a member: "Remove Sara from Work? They lose access, and anything in this folder assigned to them becomes unassigned."

The folder's name and the member's name come from the row, the way the delete confirm above takes the folder's name and its three counts, and "Work" and "Sara" are this section's usual examples rather than literal strings. Both offer 9.1's "Continue" and "Cancel". Both fall inside AC-162 as it is already written, its text being every destructive action this section puts a confirm on rather than a list of four, so no criterion is widened and no number is added.

Each of the three confirmations above renders as one sentence, restated at the RFC 0002 change control on 2026-08-13. The designer's prototype rewords two of them and splits the third across a dialog's title and its description, which reads correctly and is not this copy. This section's first sentence has always said design may restyle and not reword, and a sentence delivered in two pieces is reworded by the reader rather than by the writer: what the person is owed is the consequence in the words this section chose, and where the dialog puts them is presentation.
```

### Replace section 9.8

```markdown
### 9.8 People and invites

People screen (reachable from the sidebar footer or Settings): roster list with remove control ("Remove connection? You can still see shared folders; you'll just need a fresh invite to share new ones."); bare invite by email, refused when the address is already a connection ("You're already connected to this person. They're in your People list.", the 409 of 7.5 entered by owner ruling on 2026-08-09).
Invite gate: when Q12 is non-empty, the pending invites render in place of the application rather than inside it. It is one screen, headed "Invitations", carrying each invite as a row reading "Hassan invited you to Wedding" (or "Hassan invited you to connect") with Accept and Decline; the sidebar, the page beneath and the rest of the chrome are not rendered. Answering the last invite ends the gate, and accepting a folder invite lands inside that folder. The gate is the only surface that lists pending invites, and no page inside the application carries them.
Assignment chip: rows and the form show "Invite pending: sara@example.com" while an assignment-invite is outstanding.

Where that list lives was ruled at the second P8 change control on 2026-08-11 and is changed here by the owner's ruling of 2026-08-13, recording the designer's DES-081. The earlier ruling made it a section of My Day above everything else on that page, choosing that over two rejected readings: a band above every page, which would have been global chrome 9.1 did not name, and a surface appearing once after callback, which would have left anyone reloading before answering with no invite in front of them. The gate answers the second objection the same way, being a standing condition on the account rather than a moment after a callback, and it answers the first by not being chrome at all. What changed is the weighing of the first: this section says the invites render before anything else, and a section at the top of one page is before anything else only for a person who happens to be looking at that page, while a gate is what that phrase plainly says. The cost, stated because it is real, is that a person holding an unanswered invite cannot reach the rest of Dana without answering or declining it, which is the thing a gate is and the thing a section is not.

The gate is a region with no name, which is a decision and not an omission, and it is the earlier ruling's reasoning unchanged. 9.1's sections rule takes a region's name from the heading this section gives it or from the datum it is generated from, and this list has neither: it is one list rather than one per folder. Its rows are addressed the way a task row's controls are addressed, from the row's own sentence, which is what that sentence is for: "Hassan invited you to Wedding" tells a reader and a test which Accept belongs to which invite. AC-172 asserts the gate and is rewritten by RFC 0002, its present text asserting the section this ruling replaces.

The People screen carries no invite list, corrected at the P8R mid-package change control on 2026-08-13 on the Adversarial Test Engineer's escalation, which found that it could not be asserted because it could not be reached. When the gate arrived at acceptance, the sentence giving the People screen the same list was carried over from the ruling the gate replaced, and the two do not fit: the gate renders at every /app path while Q12 is non-empty, /app/people is an /app path, so the one page that was to hold the list is the one page unreachable exactly while the list would have anything in it. The sentence described a surface no person could ever see. Two repairs were available and the other is recorded so it is not reintroduced: exempting /app/people from the gate would have kept the list at the cost of a hole in a gate whose entire point is that invites come first, and it would have given a person two places to answer an invite where the ruling's argument was that they should have one that finds them. The list goes instead, which costs nothing, because what it was for was "where a person returns to an invite they have not answered" and the gate is now that place by construction: a person who reloads, or who navigates anywhere in the application, arrives at it.
```

### Replace section 11.4

Only the two bullets that change are reproduced with the section; the rest is
unchanged and repeated so the unit merges as one replacement.

```markdown
### 11.4 Client

- Vite 8, React, React Router 7 in library mode only: no loaders, no actions, no framework mode. Data fetching belongs to the query layer alone.
- TanStack Query 5 implements the 8.3 policy: refetch on window focus and after each own mutation; no other invalidation strategy exists.
- Forms with react-hook-form 7 plus the shared zod schemas via @hookform/resolvers. The client departs from this and the departure is recorded as section 13 item 31 with what it costs; the sentence does not move, because a rule is not rewritten to match what was built.
- Styling with Tailwind CSS 4 (CSS-first configuration through @tailwindcss/vite; there is no tailwind.config.js) and shadcn/ui components copied into `app/src/client/components/ui/`, composed with class-variance-authority, clsx and tailwind-merge, which are the three packages that distribution composes its class strings with, and animated with tw-animate-css. The behaviour under those components is @base-ui/react, pinned, which is the primitive library the shadcn distribution in use is built on; the `shadcn` package itself is a copy-in generator and is never a runtime dependency. Icons are lucide-react, imported per icon. The sans family is Inter, self-hosted through @fontsource-variable/inter, a third-party font link being an origin the service worker of 10.6 cannot precache. Design tokens live in exactly one file, `app/src/client/styles/tokens.css`, as Tailwind @theme variables; it is the only place raw color, type, spacing, and radius values may appear, and it has one owner (the Component and Design System role). What that rule governs is the values the design fixes, ruled at the P8 merge on 2026-08-12 and recorded because the sidebar's folder dot reads like an exception and is not one. A folder's colour is a person's runtime choice carried on 7.4's my_color, per member and free-form under 4.4's #RRGGBB check, so it is data on the wire rather than a design value; the sidebar writes no colour at all, taking the fill from the response, while the dot's size and shape stay in tokens.css where the rule puts them. Reading the rule to cover this value would require mapping a free-form hex onto the ten swatches that file carries, which would paint a folder a colour its owner did not pick, and the hazard the rule exists to prevent, a design that cannot be changed in one place, is untouched: changing tokens.css must never change what colour somebody's own folder is.
- Calendar: the grid is Dana's own, a fixed six-week month of day cells with week and day zooms, built from the designer's prototype. Virtual instances from /views/planned/calendar render as ghost-classed rows and the Q3C cell order, banners then timed then ghosts, is the order the cell renders them in. A day cell shows what fits and reveals the rest through 9.5's "+N more" control.
- PWA: vite-plugin-pwa with the prompt-for-update registration flow (virtual:pwa-register with onNeedRefresh), satisfying 10.6's non-forcing update rule. Fallback if the plugin fights the 10.6 contract: a hand-written service worker under a hundred lines implementing precache, network-only API, and navigation fallback.

FullCalendar 7 is removed, amended at the RFC 0002 change control on 2026-08-13 by the owner's ruling. This bullet named FullCalendar 7's standard plugins through the @fullcalendar/react entrypoints, with a custom eventOrder comparator for the Q3C order and a per-cell overlay as the fallback if the comparator could not express it. The designer's prototype builds the grid itself, so the choice is between two working implementations rather than between a library and nothing, and three things decide it. The visible order is the contract and the mechanism never was, which this bullet said in as many words; a grid whose cells we render orders them by rendering them in order, and the comparator and its fallback both disappear. 9.5 fixes a constant six-week height and a "+N more" overflow, which is a layout the library has opinions about and ours has none. And the dependency leaves with it, which matters more here than its size: 11.15 lists this library's v7 plugin entrypoints as a hazard precisely because recall of them is wrong, and a hazard that no longer has a subject is one fewer thing every future session must read before its first line of code. What is given up is the library's own accessibility and keyboard handling in the grid, which is now ours to hold and is why 9.1's roles table fixes the grid cell.

The virtual:pwa-register parenthesis names the flow rather than the import, read that way at the second P8 change control on 2026-08-11, on the Frontend Architect session's escalation, and recorded here so that a client not importing that module is not read later as a deviation. What the bullet obliges is 10.6's non-forcing update: a worker that installs while another controls the page is announced and never applied without a click. The parenthesis identifies which of the plugin's registration flows satisfies that, prompt-for-update rather than autoUpdate, and a module specifier is how the plugin's own documentation names that flow rather than a requirement to import it. The plugin still builds the worker and the manifest; the client registers the generated worker directly and implements the same flow against it. Nothing here forbids the import to a later session, and the swap is one file. This is a reading of 11.4 rather than a change to it, the shape 11.9 took for UNTIL's spelling at P6.
```

### Replace the `prototype/` row of the table in section 11.13

```markdown
| `prototype/` | Seventy files: a running React 19, Vite 8 and Tailwind 4 application with twenty shadcn components under `src/components/ui/`, thirteen screens including `states-page.tsx` and `shell-page.tsx`, `fixtures.ts`, and `src/styles/tokens.css` with `src/styles/app.css` | The client's markup, components and appearance. Under RFC 0002 it is the source the client is built from rather than a reference it is compared against, so a difference between it and `app/src/client` is a defect in the port unless a numbered section says otherwise. What it is not authoritative for is data: its screens run on `fixtures.ts` and Dana's run on the query layer of 11.4 against section 7, so nothing about how it obtains, caches or invalidates what it renders reaches the application. It remains the review artifact, and its `states-page.tsx` stacks every task-row state on one surface |
```

### Replace AC-093

```markdown
- AC-093 Given the task form opened from each of My Day, the Planned list, a Planned calendar cell, Important, a folder page and the bare add button, then its due date, important and folder fields hold exactly the values 9.3's entry-point table gives that row, the calendar cell contributing its own date and the folder page contributing that folder with an empty due date whether the form was opened from its quick-add or from the floating button.
```

### Replace AC-166

```markdown
- AC-166 Given a page carrying 9.1's inline quick-add, then it renders collapsed as a single control named "Add a task"; activating it reveals a focused text box of that same name; a title entered and committed there saves immediately with every other field at that page's entry-point defaults per 9.3; and escape clears the box and returns the control to collapsed.
```

### Replace AC-172

```markdown
- AC-172 Given an account holding a pending invite, then a request for any /app path renders the invite gate of 9.8 in place of the application, with no sidebar and no page beneath it, and each invite's row carries Accept and Decline; given the last invite answered, then the same path renders the application, and no page inside it lists pending invites.
```

### Append to section 12

```markdown
- AC-174 Given the application shell, then the sidebar is a navigation landmark carrying the app name, the global search control and the avatar menu, the app name links to My Day, and no chrome exists above or outside it.
- AC-175 Given the six page entries and each folder row in the sidebar, then each is a link whose destination is that surface's path in 9.1's routes table, and the entry for the current page is marked as current.
- AC-176 Given a folder page, then its open tasks render in one region named "All open tasks" holding the folder's dated and undated open tasks together in Q7's order, a filter offers all open tasks, only those with a due date and only those without, and the Completed region stays collapsed with its control reporting that state.
- AC-177 Given the Planned calendar's month zoom, then its days are grid cells within a grid, the grid holds six weeks beginning on Monday, and a day holding more rows than its cell renders shows a "+N more" control that reveals the remainder.
- AC-178 Given a saved task opened for edit, then the form renders who created it and when, and who completed it and when where it is complete, read-only and offering no action; given either of those users deleted, then that name renders as "Deleted user".
- AC-179 Given an open task opened for edit, then the form's completion control completes it and a completed task's control un-completes it, each producing the same stored state as the equivalent control on a task row; and given the un-complete would take a G-SERIES successor, then it first confirms with 9.5's copy and does nothing if declined.
- AC-180 Given the sidebar's folder list, then a folder group can be created by naming it, renamed, and deleted, and a folder can be moved from one group to another or out of every group; and given a group deleted, then every folder that carried it and every task in those folders still exists, in the ungrouped list.
- AC-181 Given the "New folder" action of 9.1, then it opens a dialog taking a name and creating the folder; and given 9.6's "Label and color", then it opens a dialog taking the personal label and the colour together and writing both.
- AC-182 Given the sidebar collapsed to its rail or resized, and given the task form resized, then each state survives a reload of the page, and the sidebar collapsed to its rail still reaches every page and every folder 9.1 puts in it.
- AC-183 Given each of section 9's normative strings that the designer's prototype omitted, split or reworded, then the built client renders each as one text run, character for character as its section writes it: 9.1's failed-read line and 404 line, 9.3's steps cap notice, 9.4's abandon confirm, 9.6's leave, remove-member and delete-folder confirms, and 9.8's already-connected refusal and remove-connection confirm.
```

*AC-183 is a regression criterion rather than a behavioural one, and that is
deliberate. Its nine strings are exactly the places a port from this prototype
is known to lose copy, they were found by measurement rather than by review, and
a criterion is the only thing in this build that survives the session that
learned them.*

### Append to section 13

```markdown
35. **@base-ui/react is pinned, and its behaviour is the accessibility contract the browser leg measures.** Recorded 2026-08-13 at the RFC 0002 change control. The client's components are the shadcn distribution's, whose primitives are @base-ui/react rather than Radix, and what those primitives supply is focus management, escape handling, menu typeahead and the expanded state of every disclosure, which is precisely what 9.1's addressing sentence and the browser leg assert from the outside. Item 30 recorded the same behaviours as hand-maintained under the P8 client and closes on this change; what replaces it is the ordinary cost of depending on a library for them. The version is pinned exactly rather than by range, because a minor release that moves focus or changes a rendered role is invisible to every check this build has except the 97 browser cases, and those run against whatever is installed. Revisit trigger: any upgrade of @base-ui/react or of the shadcn components copied in beside it re-runs the browser leg before it merges, and a rendered role or an accessible name that moved is the finding rather than the failure.
36. **The replacement retires the P8 client's markup wholesale, so no reviewer reads its diff and the browser leg is the only net.** Recorded 2026-08-13 at the RFC 0002 change control. Every package before this one changed code a person could read against the section it claimed; this one replaces the client's markup with a body of code written outside this repository against fixtures, and the diff is too large for the review that has caught defects at every merge so far. What stands in for it is narrow and is stated so nobody mistakes it for equivalent: 97 browser cases plus whatever RFC 0002 adds, which assert roles, names, regions and copy and are silent on everything else by construction, and the human visual review of item 33, which reports appearance and not behaviour. The two together cover what this change is for and leave one gap, which is a behaviour that no criterion asserts and no reviewer looks at, carried in from the prototype. Recorded rather than mitigated because the mitigations available are worse than the risk: a line-by-line review of a wholesale replacement is a re-implementation, and criteria written to cover the gap would be criteria written from the implementation. Revisit trigger: any defect found after this merge in client behaviour that neither the browser leg nor the visual review could have seen, which is the shape that would mean this bet was priced wrong rather than merely taken.
37. **Section 9's structure was amended to match a design artifact four times, and the rule that artifacts never do that is unchanged and load-bearing.** Recorded 2026-08-13 at the RFC 0002 change control. 11.13 says section 9 always wins over any design artifact on structure and copy, and an artifact implying otherwise is an escalation and never an edit. On 2026-08-13 the owner ruled for the artifact four times: the top bar, the folder page's single list, the invite gate and the quick-add disclosure. Nothing about the rule bent, and the distinction is worth recording because the next session to find a divergence will reach for this precedent. Each of the four went to the owner as an escalation, was decided on the merits, and arrived in section 9 as text, which is the route 11.13 prescribes working exactly as written; what the rule forbids is an implementer resolving a divergence by building the artifact, and no divergence was resolved that way. The reason this needs recording at all is that four escalations decided the same way looks from a distance like a rule that no longer binds. It binds. Revisit trigger: the first divergence after this RFC that reaches an implementing session rather than the owner, which is the failure this item exists to make recognisable.
```

### Replace section 13 item 27

```markdown
27. **8.10's surviving references render as "Deleted user", and the first surface that renders them arrives with RFC 0002. Recorded 2026-08-11 at the P8 change control; closed 2026-08-13 at the RFC 0002 change control.** 4.1 gives `display_name` the note "null after deletion, rendered 'Deleted user'" and 8.10 says the surviving references, `tasks.created_by`, `tasks.completed_by` and `invites.accepted_by`, keep pointing at the scrubbed row and render that way. This item recorded that section 9 named no page displaying any of the three, and that this was correct rather than an omission: 8.10's step 4 clears the deleted account's assignments and removes its memberships, so the assignee chip and the member avatar stack cannot hold it, and 7.3 excludes soft-deleted users from the roster. The sentence was therefore correct and dormant. It is dormant no longer. 9.3's task form now carries a read-only history block rendering the task's creator and completer from frozen 7.2's TaskDetail, which has carried `created_by` and `completed_by` since the API was written, and AC-178 asserts both the block and the "Deleted user" rendering. `invites.accepted_by` is still read by nothing, deliberately: 7.5's invite object excludes it, being a bare user id with no person shape to render, so that third column stays dormant and this item's revisit trigger stays live for it alone. Revisit trigger: any surface that displays an invite's acceptor.
```

### Replace section 13 item 30

```markdown
30. **The client's components were hand-rolled where 11.4 names shadcn/ui; the deviation is closed by RFC 0002. Recorded 2026-08-12 at the P8 merge review; closed 2026-08-13 at the RFC 0002 change control.** 11.4 says "shadcn/ui components copied into `app/src/client/components/ui/`" and the P8 client wrote its own: Button, Chip, ConfirmDialog, OverflowMenu, QuickAddRow, StarButton and TaskRow, in exactly that directory, under exactly that owner, with no primitive library dependency anywhere in `app/package.json`. It was recorded rather than routed, on the reading that shadcn/ui is a copy-in source distribution rather than a dependency, and its stated cost was that Radix's focus management, escape handling and menu typeahead were hand-maintained rather than inherited. The P8D kickoff added that the item would not close in that package, the owner having ruled restyle over replacement there. RFC 0002 reverses that ruling and the item closes with it. The designer's twenty components under `docs/design/prototype/src/components/ui/` are the shadcn distribution as that project ships it, verified rather than assumed: his `components.json` declares shadcn's own schema and the `base-mira` style, and the components import @base-ui/react, which is the primitive library that distribution is now built on. Copying them into `app/src/client/components/ui/` is what this sentence has asked for since it was written, so what closes here is a deviation and not a rule. Two things do not close with it. The behaviours the item was worried about are now a library's, which is item 35, and its revisit trigger moves there. And the same paragraph's second reading stands unchanged for any future component: adopting a primitive is a component-level change on a stated accessibility need, never a sweep.
```

## Compatibility and migration

The delta touches no part of section 4 and stores nothing, so the
expand-and-contract rules of 11.5 do not apply and no backfill exists. What is
owed is the criterion accounting.

**Rewritten by number**, each with the reason its present text stops being true:

| Criterion | Why it changes |
| - | - |
| AC-093 | Asserts all six rows of 9.3's entry-point table, one of which reads the folder page's section context. 9.6 now has one open section, so the cell states a value instead |
| AC-166 | Asserts the quick-add as a row that is always present. It is now a disclosure, and the criterion asserts both of its states |
| AC-172 | Asserts the invite list as a section above My Day's first heading. It is now a gate rendered in place of the application |

**Untouched and worth saying so**, because each looks reachable from this change
and is not. AC-058 asserts Q7's scheduled and unscheduled arrays on the wire,
which section 6 and section 7 still return unchanged; only the page's
presentation of them moves. AC-095's hidden-page rule is unaffected, the routes
table not moving. AC-159 admits either a button or a link for the sign-in
control, so 9.2's new copy changes nothing about it. AC-162's text is every
destructive action section 9 confirms, so the confirmations whose copy is
restored owe cases in that file and no new number. And no criterion reads
FullCalendar: three browser cases read the rendered calendar, AC-093's cell row,
AC-098 and AC-158, and all three address grid cells, while every other criterion
naming a calendar reads /views/planned/calendar through section 7 and never
reaches the client at all. That is why removing the library invalidates none of
them, and 9.1's new roles table is what keeps the three true.

**The numbers are final and none moved.** AC-174 to AC-183 and section 13 items
35 to 37 were numbered from the next free number while this RFC was a Draft,
when the specification carried AC-001 to AC-173 and items 1 to 34. The preamble
makes a Draft's numbering provisional and has the Steward renumber at acceptance
if another RFC claimed any of them first. Checked at acceptance on 2026-08-13
against the specification and against every other RFC: section 12 still ends at
AC-173, section 13 still ends at item 34, AC-174 to AC-183 appear nowhere in
this repository outside this file, and items 35 to 37 are unclaimed. RFC 0001 is
the only other RFC and adds no criterion of its own. So every number above is
assigned as authored, and nothing downstream that cites one has to be revisited.

## Alternatives considered

**Continue the restyle, taking his values onto our markup.** This is what P8D
was doing and what the owner rejected on 2026-08-13 after looking at the result.
It loses on the merits and not only on that verdict: the restyle re-derives
every composition decision from his files into a different styling idiom by
hand, with nothing checking the derivation, in a package that adds no acceptance
criterion and therefore cannot measure whether it succeeded. Six sessions ran it
and the gate was green after every one.

**Replace the markup but keep FullCalendar 7.** Rejected, and it was close
enough to be worth the sentence. Keeping the library preserves its keyboard and
accessibility handling in the one place this change gives up the most, and
losing that is the real cost of the owner's second ruling. It loses because 9.5
fixes a constant six-week height and a "+N more" overflow, which is a layout the
library has its own opinions about, so keeping it means fighting it on exactly
the surface the design is most specific about, and because the Q3C cell order
then stays a comparator with a documented fallback for the case where the
comparator cannot express the order. The mitigation is in the delta rather than
in this paragraph: 9.1's roles table fixes the grid cell so that what the
library was giving for free is now asserted by number.

**Take his markup as it stands and move the acceptance suite to it.** Rejected
outright. Six criteria and one harness helper would have to be rewritten to
assert buttons where they assert links, no landmark where they assert one, and
plain elements where they assert grid cells, which is changing the contract to
match the implementation. Protocol section 8 forbids exactly this, and the
Steward's own boundary is that the spec never changes by drift. The corrections
are enumerated in the delta and in the implementation plan instead.

**Admit his prototype's affordances silently, since they arrive with his code.**
Rejected, and it is the most likely failure of this package rather than a
hypothetical: ten controls in his prototype have no name in any numbered
section, and the path of least resistance for every implementing session is to
port the component and say nothing. Protocol section 1 makes an unrecorded
deviation a defect even where the code works. Each of the ten is ruled below
instead, and the one that is refused is refused in the specification's text so
that removing it is an instruction rather than an omission.

**Defer the sidebar's rail and both resize handles rather than specify them.**
Rejected on the same ground as the last, one step further in. They are built
into the components being adopted, so deferring them means either removing
working code or shipping behaviour no section names. Specifying them costs two
sentences and one criterion, and 9.1 was already fixing what the sidebar holds
rather than how wide it is, so the sentences say what was true anyway.

## Open questions

None. Both closed on 2026-08-13 by the human owner, which the preamble requires
before acceptance, and neither survives into the delta. They are recorded here
as answered rather than deleted, because the delta above carries the answers and
not the reasoning that reached them.

1. **The em dash in the landing subheading. Closed: use the comma.** His
   approved copy read "in clear, shareable folders" followed by an em dash and
   "so everyone knows what comes next", and the delta transcribes it with a
   comma. The owner confirmed the substitution on the ground that protocol
   section 7's convention holds across the whole corpus, including copy adopted
   from outside it, and that the sentence's meaning is unchanged. The alternative
   he declined was ruling the designer's punctuation part of the approved copy
   and letting the convention yield to it here. Nothing in the delta moves: 9.2
   already carried the comma, and what this closes is whether it was allowed to.
2. **Whether item 33's human visual review survives as this package's merge
   precondition. Closed: it stands, unchanged and unwaived.** It was ruled for
   P8D, a package that added no criterion, and this RFC adds ten, so the
   argument that made the review the only real control is weaker. The owner
   affirmed the requirement in writing on 2026-08-13, which is the form that item
   itself demands of a decision either way. The ground is the one the
   recommendation gave: ten criteria about landmarks, links, grid cells and copy
   still cannot see whether the product looks right, which is the whole reason
   that item exists, and this package's subject is still appearance. So R12's
   review is a precondition of the merge exactly as item 33 writes it, the
   Steward closing this package refuses on its absence as it would refuse on a
   red leg, and the evidence it takes is unchanged: one recorded line naming who
   looked, on what date, at which built pages against which prototype screens,
   and what verdict they gave. Item 33 says a waiver would be written in the same
   place for the same reason. This is the opposite of a waiver and is written in
   the same place for that same reason, so that a reader of item 33 finds the
   affirmation rather than a silence they must interpret.

## Implementation plan

Never merges. One branch, `p8d-design`, continuing from f4228d7; the sessions
run in order and each is sized for one agent. Owners are the persona files,
which are the authority on ownership; this table repeats their claims for
scheduling. The `docs/design/` artifacts named by 11.13 are already committed
and need no update before the UI work starts, which is what the template asks
for when a delta touches section 9.

**Every session in this plan runs the prototype before it writes anything.**
That instruction is in the table's own acceptance column rather than in this
paragraph, because the reason it is here is that six sessions did not.

| ID | Delivers | Depends on | Blocks | Owner | Acceptance |
| - | - | - | - | - | - |
| R1 | The three rewritten criteria (AC-093, AC-166, AC-172) and the ten new ones (AC-174 to AC-183), against the amended sections, all red | RFC accepted | R2 to R10 | `11-adversarial-test-engineer.md` | Thirteen criteria exist by number and fail for the right reason |
| R2 | The dependency set of 11.4 installed and pinned; his `tokens.css` and `app.css` without the 1180px floor; his twenty `components/ui/` primitives copied in | R1 | R3 to R10 | `08-component-and-design-system.md` | Gate green; `min-width` absent from the tree; the commit names each dependency and its reason per protocol section 3 |
| R3 | His presentational components, relabelled to section 9's names and corrected to 9.1's roles table | R2 | R5 to R10 | `08-component-and-design-system.md` | The eight `getByLabel` field names and every name in 9.1's table resolve; no role in 9.1's table is wrong |
| R4 | `parts/presenters.ts`: the layer mapping our API shapes onto his display props, with its own unit tests | R2 | R5, R6, R7, R8, R9 | `07-frontend-architect.md` | Unit tests cover every shape; nothing under `app/src/client/api/` changes |
| R5 | His shell and sidebar on our router: the navigation landmark, the six page links, the folder rows as links, the three relocated controls, 9.7's visibility gates, the rail and the resize | R3, R4 | R6, R10 | `07-frontend-architect.md` | AC-174, AC-175, AC-182; AC-091, AC-155, AC-160, AC-171, AC-173 still green |
| R6 | The six list screens on our view hooks through the presenters, plus the shared page states | R5 | R12 | `07-frontend-architect.md` | AC-166 and the list-page criteria green; 9.1's inline state copy renders its own words |
| R7 | His task form: the sheet, the date picker, the dependency graph, steps, the invite row, the history block, the completion control | R3, R4 | R12 | `09-complex-interaction.md` | AC-093, AC-178, AC-179; AC-092, AC-094, AC-161, AC-169, AC-170 still green |
| R8 | His search overlay, and the folder page with its single open list, its filter and the sharing panel | R3, R4 | R12 | `09-complex-interaction.md` | AC-176; AC-058's browser half, AC-156, AC-162 still green |
| R9 | His calendar grid replacing FullCalendar, with the grid roles and "+N more"; the dependency removed | R3, R4 | R12 | `09-complex-interaction.md` | AC-177; AC-098, AC-158's calendar case still green; @fullcalendar absent from `package.json` |
| R10 | Landing with his copy and preview panel, the unverified-email page, the invite gate, the folder-group and folder dialogs | R5 | R12 | `07-frontend-architect.md` | AC-159, AC-172, AC-180, AC-181 |
| R11 | The copy sweep: the nine strings of AC-183 restored at every site that renders one | R6, R7, R8, R10 | R12 | `08-component-and-design-system.md` | AC-183 |
| R12 | The human visual review, then the findings returns, then the merge review | R6 to R11 | none | the owner, then each surface's persona, then `12-integration-steward.md` | Full gate in CI's order on both database legs plus the browser leg; item 33's recorded line; every finding applied or declined with its reason |

**Critical path** is R1, R2, R3, then the longest of the three implementation
arms, then R11 and R12. R4 runs in parallel with R3 once R2 has landed, and it
is the one session with no visual output at all, which is why it is separated:
the mapping from our API shapes to his display props is the entire seam between
the two halves of this change, and a session doing it beside a page is a session
doing it as a side effect. R6, R7, R8 and R9 are parallel by file once R3 and R4
are in, and R5 blocks R6 and R10 only because they render inside its shell.

**File boundaries where two sessions could collide.** R3 owns
`app/src/client/components/ui/**` and `app/src/client/styles/**` and no page. R4
owns `app/src/client/parts/**` and nothing else. R5 owns the shell and the
router table; R6 owns `app/src/client/pages/` for the six list pages and
`app/src/client/states/**`; R10 owns the public pages and the dialogs; R7, R8
and R9 own the form, the overlay and the folder page, and the calendar,
respectively, at role 09's directories. Nothing in this plan touches
`app/src/server/**`, `app/db/**`, `app/src/shared/**` or
`app/src/client/api/**`, and a session that finds it needs to has found an
escalation rather than a task.

**What is not replaced, stated here because it is the sentence an implementing
session is most likely to get wrong.** The whole server, the database,
`app/src/shared`, and every module under `app/src/client/api/` survive this
change untouched: eighteen read hooks, twenty-four write hooks, the single
invalidation strategy of 8.3, the CSRF header, the tz parameter on every view
request, the PWA layer and the route table. This RFC replaces what renders the
data and nothing that fetches it. His screens run on `fixtures.ts` and none of
that file, nor any pattern from it, arrives with them.
