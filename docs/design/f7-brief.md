# F7: Imran's fifteen, read as a system

Recorded 2026-08-23, at his instruction to "find bugs in our current logic and
give the most optimal solutions". This is the research half of that; nothing
here is built except the four items marked **done** at the foot, which were
concrete faults that needed no decision.

## What was asked

Fifteen items, in his order:

1. A folder can be opened as a tab.
2. A profile picture can be uploaded in Settings.
3. Only the pages listed in Settings are native; every other folder and group
   is a person's own and must be deletable.
4. Desk is missing the description the other native pages have.
5. An **image block** on a page, beside sections and paragraphs.
6. A dark-mode toggle — placement only.
7. Search reaches folders, groups, steps, sections, paragraphs, notes, messages.
8. Edit history: actor and time for creation, modification, completion,
   reopening and deletion — consistently, and with somewhere to read it.
9. Duplication of a task, a folder and a group, in overflows, everywhere.
10. Copy link in a folder's overflow, everywhere.
11. Desk's glyph does not animate; the share icon still changes on hover.
12. The page does not adjust when the conversation opens as a right panel.
13. A sidebar footer of three buttons in a row, plus three new destinations —
    New folder group, Help, Trash with 30-day restore — placed by role.
14. A folder or a group saved locally as a **workflow**, and imported.
15. A group of folders as a **page**, with a cover, an icon, a link, sharing
    that reaches its folders, and blocks of folders/sections/text/images.

## The finding: six of these are one missing mechanism

Items 1, 8, 9, 10, 13 (Trash) and 14 are not six features. They are six *acts*
on Dana's objects, and the reason they are missing in different places is that
**Dana has no object contract** — every overflow menu is written by hand,
surface by surface, so an act exists exactly where somebody remembered it.

The matrix as it stands:

| | task | folder | group |
| - | - | - | - |
| Rename | yes | yes | yes |
| Open as tab | yes | **no** | no |
| Copy link | **no** | **no** | **no** |
| Duplicate | bulk only | **no** | **no** |
| Delete | yes, undo only | yes, undo only | yes, undo only |
| Restore later | **no** | **no** | **no** |
| Save as workflow | — | **no** | **no** |
| History | drawn, not real | drawn, not real | **no** |
| Share | no | yes | **no** |

Nine gaps, and each one is a separate thing to remember in every menu that
draws it. This is [[DES-154]] at the largest scale the product has: *a
behaviour settled for an object belongs to that object's contract, not to each
menu's diligence.* The register has caught the same shape five times already —
tap-to-open reaching six screens of seven, the folder mark resolved in two
surfaces of thirteen, the row's chips as eight hand-written branches.

**So the first thing to build is not a feature.** It is one declaration of what
a Dana object is and which acts it supports, and one menu component that
renders it. After that, "Copy link everywhere" is one line rather than eleven,
"duplicate consistently" is a property of the contract rather than a promise,
and the audit can assert that no surface hand-rolls a menu again.

That single change carries items 1, 9, 10 and most of 14 with it, and gives 8
and 13 somewhere to live.

## Ruled, 2026-08-23: **Option A, and it is called a Shelf**

Imran took **A** — the group stays personal, gains a page, and has no link and
no members. **B is deferred, not rejected.** And he named it better than I did:
**Shelf**, not Area. Both rulings and their reasoning are DES-195; the cost
analysis he asked for alongside it is DES-196, whose finding is worth carrying
at the top of this file:

> **Nesting is affordable. Inherited permission is not — and inherited
> permission is the whole reason anybody wants nesting.**

So Option A is nesting for arrangement, at one level, with permissions left
flat: the cheap ninety per cent. The section below is kept as it was written,
because the argument for B is the argument that will be picked up whenever B is
taken.

## The decision as it was put: what a folder group *is*

Item 15 is the largest and it contradicts a ruling on the books.

Today a group is a **personal label**. The group dialog says so in its own
words — "Groups are personal labels… Other members are unaffected" — and
[[DES-180]] ruled its ordering per-person for the same reason. It has no id, no
members, and no existence apart from the folders wearing its name.

Item 15 gives it a page, a cover, an icon, a **link you can send**, and
**members whose access cascades to the folders inside**. That is not a label.
A thing with an identity, a permanent address and a membership list is an
**object**, and one that contains folders is a **second level of hierarchy** —
so "we don't have nested folders" stops being true the day this ships.

Two coherent answers:

**A — the group stays personal.** It may still have a page: a cover, an icon,
arranged blocks. But the page is *yours*, there is no link to send and no
membership, because a personal label cannot grant access to anything. Cheap,
consistent with every ruling on the books, and it delivers most of what item 15
describes except the sharing.

**B — the group becomes a real container.** Its own id, its own members, and
membership that grants access to the folders it holds. Everything item 15
describes works. It is also a specification change larger than the navigation
one: a new object, a new permission path (an *inherited* grant — a folder can
still have its own members who are not in the container, which is what Imran
described), a new page kind, and edits to spec sections 4 and 7, which are
**frozen**.

**My recommendation is B, with one condition: rename it.** If it has a page, a
link, an icon and members, "group of folders" is the wrong name for it —
that is the naming fault DES-152 spent three rounds correcting, arriving at the
rule that a name must describe what a thing *is*. Notion calls this a
teamspace, Linear a team, Things an area. **Area** is the plainest English of
the three and the one Dana can use without borrowing a coinage.

Until this is ruled, item 15 cannot be built and part of item 14 cannot be
shaped, because a workflow saved from a container is a different object from a
workflow saved from a label.

## Two smaller questions, which I will answer myself unless told otherwise

**Does a deleted task go to Trash, or only a page?** Imran said "deleted
pages". I would put tasks there too: a deleted task is *gone for ever* today
past the undo window, which is a worse loss than a deleted folder and the one a
person is likelier to cause by accident. Trash then has one rule — everything
deletable is restorable for thirty days — rather than a rule with an exception
nobody can predict.

**Does a workflow carry tasks, or only structure?** A workflow that carries
tasks carries assignees, dates, comments and other people's names, which is a
privacy problem the moment a file is shared. I would save **structure and task
titles** — sections, paragraphs, images, folder names, task names — and leave
people, dates, states and conversations behind. A template is a shape, not a
copy.

## Sequence

Ordered by dependency rather than by his numbering. Each stage is roughly a
session.

1. ~~**The object contract**~~ — **built 2026-08-23, DES-197.** Both folder
   menus now come from it and read identically; Copy link and Duplicate landed
   with it, and a twelfth audit rule stops the next menu being hand-rolled.
   The acts still to be supplied are Open as a tab, History and Save as
   workflow — declared, drawn nowhere, because nothing hands them over yet.
   Original wording: one declaration, one menu. Carries items 1, 9, 10,
   and the small ones that need no machinery: item 3 (native versus a person's
   own), item 4 (Desk's description), item 11 (the icons — **done**).
2. **The event log** — item 8. Actor, time and verb for every act, written by
   the acts themselves rather than by each screen. The window bar's "Edited
   just now" becomes the real thing; a task's history gets a place in its
   footer. Trash needs this, so it comes before Trash.
3. **Trash and the sidebar footer** — items 13 and the deletion half of 8.
   Deleting stops being an act and becomes a state, with restore and permanent
   delete. The footer is restructured at the same time because Trash needs a
   destination and the three new items need placing by role.
4. **Page blocks** — item 5, the image block. This is also the answer to
   "giving the first user an idea": a page that can hold a picture can hold a
   worked example.
5. **Expanded search** — item 7. Known Lane 2 work: [[DES-073]] has owed
   mixed-result shapes, ordering and permissions since v1.
6. **Profile picture and the dark-mode toggle** — items 2 and 6, both small and
   independent of everything above. Item 6 is two jobs wearing one name, and he
   already split them: **placement only** is the toggle, which is a settings
   question and genuinely small. The *colourway* is not, and it is the reason
   this stage sits here rather than early. A dark theme is not a palette swap —
   elevation inverts, since a raised surface in light is whiter with a shadow
   and in dark is a lighter grey with almost no shadow at all; the cobalt accent
   needs a lighter step to clear contrast on a dark plate; and each of
   [[DES-018]]'s ten folder swatches needs a dark-safe variant, every one
   re-checked against a dark ground because [[DES-018]] requires the swatch to
   travel with a visible folder name. That is a dozen judgements that need
   Imran, arriving on top of the rulings still waiting for his eye. It is
   cheapest after the light theme is frozen: one dark ramp approved once, then
   the surfaces that must stay dark in *both* themes given their override
   explicitly. What decides whether that session is an evening or a week is a
   habit, not a decision — **colour named by role, not by value**, now a
   standing ground rule in `v2-refresh-plan.md`. At the count taken 2026-08-23
   the prototype was 813 ramp references to 195 role references outside
   `components/ui/`; every stage above this one either holds that ratio or
   worsens it.
7. **Workflows** — item 14, once the contract exists and the group question is
   settled.
8. **The group page** — item 15, pending the decision above.

## Done in this session

- **Item 11, the share icon.** It was a real fault *and* it exposed a blind
  rule. `Anim.ShareIcon` is named for the concept, not for lucide's current
  name for it, and it draws `Share2` — so the rule that compared *names* asked
  whether `Share` matched `Share` and passed, while the glyph changed object
  under the pointer. The rule renders both drawings and compares them now, and
  proves which lucide icon an animation actually is before reporting. It found
  a second fault on its first run: **Gamepad animated as Gamepad2.** Both
  fixed. This is DES-157's fault inside DES-157's own file — a green check used
  as evidence about something it never looked at.
- **Item 12, the conversation panel.** It covered the page, which is the fault
  [[DES-186]] fixed for the task surface and forgot for this one. Both use one
  component now, so a third panel on that edge cannot repeat it.
- **Item 11, Desk's glyph — a choice rather than a fix.** The animated family
  has no desk lamp. It can stay still, or Desk can take an animated
  **lightbulb**, or the lamp can be given a hand-written animation. Left still,
  and flagged.
