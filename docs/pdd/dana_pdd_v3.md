# dana pdd v3

# 1. General Stuff

## Concept

Dana is a webapp, built as a PWA. This means it can be installed and used like real software, but without needing separate OS-level compilations, builds, or signatures for iOS/Android/desktop. The goal is to keep the technical side simple so we can get an MVP out as fast as possible.

## Landing Page

A simple website that explains what Dana is: a collaborative to-do list with an AI that helps you plan. From there, the user has the option to log in.

## Login

No separate authentication system. The only login method is Google Auth. This covers almost all users and removes the need to build and maintain our own auth system, password resets, etc.

# 2. Core Architecture

## Workspace

Upon login, a “workspace” is created directly. Every account has exactly one workspace, created automatically the moment you sign in with Google. There is no setup step for it, you land straight in an empty My Day with your workspace already sitting there behind the scenes, holding nothing yet.

A workspace is made of exactly two things:

**People.** The roster of everyone you're connected to. A connection is created the first time an invite between two accounts is accepted (see Sharing), and it runs both ways in the same action, if Hassan invites Imran, Imran gains Hassan in his own roster too, not just the reverse. Once connected, either person can share any folder with the other without inviting again, for as long as the connection exists.

**Folders.** Every folder you can currently see: the ones you created yourself, plus any folder someone else created and shared with you. A folder is not possessed by a workspace the way a file is possessed by a specific disk. A folder has exactly one owner, whoever created it, and it shows up inside the workspace view of every person who has access to it, owner and members alike. The same folder can sit inside Hassan's workspace and Imran's workspace at the same time, each seeing it independently.

The workspace itself grants no access to anything. It's a roster and a view, not a permission. Being connected to someone lets you share folders with them without re-inviting, nothing more. All actual access control lives at the folder level, described below.

## People

To have people (like friends in Facebook) you need to share something or send them an invite (like Friend request in facebook). Sharing always means granting access to a folder, never a single task on its own and never an entire workspace at once. A folder is the only shareable unit in Dana.

**Starting an invite:**
You enter a person's email, either directly (adding them to your workspace with no folder attached) or from inside a specific folder (sharing that folder with them). Dana creates a pending invite tied to that exact email. If a folder was attached, the invite carries it. One notification email goes out. There is no approval step and no confirmation queue on your side, entering the email is the final action.

**Accepting an invite:**
The recipient signs in with Google, the only login method in Dana. If their Google account's email matches the invited address exactly, the pending invite is waiting for them, one tap to accept. A different Google account sees nothing, the invite was never tied to it. There's no separate step where they re-enter an email, matching happens automatically through the sign-in they already have to do.

Accepting a folder-attached invite does two things at once: it connects both people in each other's workspace roster, and it grants access to that folder. A bare invite (no folder attached) only creates the roster connection.

**The roster connection is symmetric:**
Both people are added to each other's roster in a single accept, not just one direction. If Hassan invites Imran, Imran gains Hassan in his own roster too. Either of them can now share a new folder with the other without inviting again, for as long as they're connected.

**Sharing with someone already in your roster:**
If the person is already connected (from any past invite, regardless of which folder it was originally for), sharing a new folder with them skips the invite and accept cycle entirely. Pick their name from a list, access is granted immediately, they get a lightweight notification instead of an invite. One real invite per relationship, ever, no matter how many folders get shared afterward.

**What folder access actually grants:**
A member sees everything inside the folder, every task, not just the ones assigned to them. They can open, edit, complete, or be assigned any task in it. All members currently have equal access, no roles or tiers in this version, though the member record should still carry a role field for future use. Access is scoped strictly to that one folder, membership in one grants no visibility into any other, even folders that sit right next to it for the owner, and even between two people already connected in each other's roster.

**Revoking access:**
Removing someone from a folder removes their visibility into it immediately. Any task assigned to them inside it stays, it just becomes unassigned, nothing gets deleted. This does not remove them from your workspace roster, that's a separate action, and it only affects future sharing, not anything already granted elsewhere.

**Sharing triggered indirectly:**
Assigning a task to someone outside that task's folder membership is itself a sharing action, not just an assignment. If they're already in your roster, it resolves instantly through the same pick-from-a-list path above. If they're not, it starts the same invite flow, with the relevant folder attached automatically.

## Folders

Dana's whole organizing layer reduces to one primitive: the folder. There's no separate concept for a project, a list, a goal, or a shared team space, a folder plays all of those roles depending only on whether it's private or shared and what you name it. This is the same move Notion made with the block, one primitive, reused everywhere, instead of a different named object for every use case.

The analogy has a real limit, and it's intentional. In Notion, a block can contain other blocks, recursively, without end, because Notion's whole product is about letting you structure content however you want. Dana deliberately does not extend that recursion to folders. A folder cannot contain another folder. It can only contain tasks. Everything about sharing, visibility, and completion tracking in Dana stays simple specifically because a folder is always exactly one level, never a tree. If you need to group folders for your own sake, that's a label or color on the folder, not a folder inside a folder, covered below.

**Two kinds of folder, same underlying object:**

*Default Folder.* Exactly one per account, created automatically at signup alongside the workspace itself. Holds every task that isn't explicitly placed in a custom folder. It cannot be shared and cannot be deleted, those two actions are simply hidden for this one folder. Every other folder behavior applies to it normally: it has a name, it holds tasks, it has a completion count.

*Custom Folder.* Created by the user, named by the user. Private by default, visible only to its owner. Can be shared with anyone in the owner's workspace roster, or shared directly by email, which creates the roster connection at the same time (see Sharing). Can carry an optional label or color, used purely for the owner's own sidebar sorting when they have a lot of folders. This label is personal to each member, not shared, Imran can group a folder under his own label without changing anything about how Hassan sees it. The folder's actual name is shared and global, every member sees the same one.

**What a task's folder membership means:**

Every task lives in exactly one folder, always, there is no task without one. If you don't put it somewhere, it's in your Default Folder. This field is never empty in the data model, moving a task between folders, including into or out of the Default Folder, is always the same operation.

A task's assignee must be a member of the folder that task lives in. This is the only rule governing who can be assigned what, there's no separate rule bolted on for unshared folders, a private folder simply has one member, its owner, so its tasks can only ever be assigned to that one person.

**What folder sharing grants, concretely:**

Every member of a shared folder sees everything inside it, every task, not only the ones assigned to them. Any member can open, complete, or edit any task in the folder. All members currently have equal standing, no admin or owner-only actions exist yet in this version, though the underlying member record should carry a role field now so a real permission tier can be added later without a schema change.

Access is scoped to exactly that one folder. Membership grants nothing about any other folder, including ones the owner also shares with the same person, and including the Default Folder, which can never be shared at all.

Removing a member from a folder removes their visibility into it immediately. Any task assigned to them inside it stays exactly where it is, only unassigned. Nothing is ever deleted as a side effect of removing a member.

**Completion tracking:**

A folder shows a direct count of its own tasks, done versus total. Since a folder never contains another folder, this number never needs to roll up across a tree, it's always a single, flat count over that folder's own tasks.

*Still to decide: what happens to a folder if its owner, the one person who created it, removes themselves or deletes their account, while other members still have access to it. This hasn't come up yet and needs an explicit answer before this ships.*

**Most optimal Hierarchy (at least for the first mvp, to keep things from getting spaghettified)**

```
Workspace (one per account, auto-created at signup)
 ├─ People: roster of connected accounts, grants nothing by itself
 └─ Folders: every folder you own or have been given access to
       ├─ Default Folder (one per account, cannot be shared or deleted)
       └─ Custom Folder (owner-created, private by default, shareable, "groupable")
             └─ Task (own section, fields covered separately), belongs to a folder
                   └─ Steps: Subtasks inside a Task 
```

## Task Creation

**Where the button lives**

One persistent floating button, bottom-right, on every page except Done, which already has no add-task affordance by design, established last message. Bottom-right isn't arbitrary, it's the near-universal convention for exactly this control, reachable by thumb on mobile, never sitting over the main content people are trying to read. One button, one mechanic, everywhere it appears. What changes page to page isn't the button, it's what the form defaults to when it opens, covered below.

Worth also allowing a lighter path for the common case: an inline "add a task" row at the bottom of any list-style view, Tasks, Planned in list mode, a folder's task list, that takes just a title and saves immediately, full form skipped entirely. This isn't a second creation system, it's the same save operation with everything past the title left at its defaults. Genuinely optional for V1 if you want the absolute leanest build, but it's cheap, and it directly serves the "wannabe task" philosophy this whole page structure has been built around, capturing a stray thought should never require more than typing it and hitting enter.

**What the form defaults to, by entry point**

The form itself is one single, consistent artifact regardless of where it's opened from, same fields, same dependencies, same validation. Only the pre-filled defaults change:

- **Tasks, All, or the floating button with no other context:** no due date, folder defaults to your Default Folder.
- **My Day:** due date defaults to today. This one was never actually specified before now, and it's the obvious gap to close, since the entire reason to add a task from inside My Day is that you want it today.
- **Planned:** due date defaults to today in list mode, or to whichever cell you clicked in calendar mode. Folder still defaults to Default Folder, since you're not inside a specific one here either.
- **Important:** important defaults to on. Folder and date behave exactly as they would from Tasks, since this view has no home of its own to anchor either.
- **Inside a specific folder:** folder is pre-set to that folder, not Default. Date behaves according to whichever sub-view of that folder you're looking at, same logic as Tasks or Planned, just scoped.

**Form structure: title is the only required field, everything else is deferred by default**

Given how much of this conversation has been about minimum friction to capture a thought, the form should open showing only title, plus a couple of small inline shortcuts for the most common quick-sets, due date and important. Everything else, folder, assignee, reminder, recurrence, duration, steps, notes, sits behind a single "more options" expand. Nobody should have to scroll past eleven fields to jot down read this book. This is the direct, practical consequence of a principle we already locked, not a new one being introduced here.

**Fields, grouped by what they actually depend on**

*What it is:*

- **Title.** Required. Nothing saves without it.
- **Notes.** Optional free text, this is the same field your very first draft called description, same thing, kept your later word for it.

*Where it lives, and who it's for:*

- **Folder.** Defaults per entry point above. Selecting this first matters, because it determines what Assignee is allowed to show, not the other way around, folder membership governs who's a legal assignee, established back when we locked the Task schema.
- **Assignee.** Defaults to you, the creator. Dropdown is limited to the target folder's current members, plus an option to invite someone who isn't one yet, which hands off directly into the sharing flow already established, pick from your roster if you're already connected to them, a fresh email invite if not, with this folder attached automatically. If the folder is your Default Folder specifically, this only ever has one legal answer, you, so the field can just stay hidden rather than showing a dropdown with one option in it.

*When it happens, all of this only exists once a due date does:*

- **Due date.** Optional. Empty means the task lives in Tasks, set means it lives in Planned, exactly the mechanism already established, nothing new here.
- **Due time.** Hidden until due date is set, since a time with no day to attach to means nothing.
- **Reminder.** Hidden until due date is set, same reasoning. If due time is also set, reminder is an offset before that exact moment. If only the date is set, reminder needs its own specific time that day, since there's no hour to count backward from.
- **Recurrence.** Hidden until due date is set too, worth stating explicitly even though it follows necessarily from everything already said about recurrence, a rule needs a date to recur from in the first place.

*Independent of all of the above:*

- **Duration.** Available regardless of whether a date exists. Paired with due time, it gives Planned's calendar an actual block to draw. On its own, it's just an effort estimate for you, no visual block anywhere, same field either way, its role just shifts with context. (not needed imo, debatable!)
- **Important.** A simple toggle, off unless launched from the Important page. Fully independent of scheduling.
- **Steps.** Add one, press enter, get a blank row for the next, freely reorderable.

**What's deliberately not in this form, and why each one isn't just an oversight**

- No attachments. Flagged as deferred a few messages back, staying deferred here, consistent.
- No Dana entry point. Earlier drafts, including the mockup built in this conversation, had an "ask Dana instead" link. That's gone now, on purpose, following the decision to defer all AI functionality past V1, a stray link into a feature that doesn't exist yet would be worse than no link at all.
- No natural-language parsing in the title field, typing call dentist tomorrow at 3pm auto-filling a date. This is genuinely tempting to add since it looks like a small convenience rather than AI, but it's the same category of thing being deferred, and quietly slipping it into the "manual" form would blur the exact line you asked to keep clean between the manual version and everything AI comes later.

**This form is reused, not creation-only**

Opening an existing task later uses this same set of fields, same dependencies, same validation, just pre-filled with what's already there instead of defaults. No separate editing interface to design or maintain, one form does both jobs.

*Implementation note: title is the only NOT NULL field on creation besides the system-assigned folder_id, everything else can be null or default. Client-side, due_time, reminder, and recurrence should be disabled inputs, not merely hidden, until due_date has a value, to avoid a state where one gets set slightly before the other during fast typing.*

# 3. Sidebar Pages

📌 Means the page cannot be hidden. Although the app may eventually include six or seven pages, not every user wants that many pages or the added complexity. To keep the interface flexible, users can choose which optional pages are visible in Settings. For example, many people may not need pages like Important, Done Tasks, or All Tasks, especially if they prefer a more minimal workflow. Personally, the first thing I would do after installing the app is disable a few of these pages because I wouldn't use them. Pages marked with a 📌 are core pages and cannot be hidden, while pages without a 👁️ can be shown or hidden at any time based on the user's preference. By default, the app ships with all available pages visible, allowing users to customize the interface by hiding any optional pages they don't want to see.

## My Day 📌

My Day holds no data of its own, it's a live view over tasks that already live somewhere else, in Tasks or in Planned. Nothing changes ownership by showing up here, a task's real home, its folder, and whether it's a Tasks or Planned item, stays exactly what it was.

**What lands here automatically:**
Any task assigned to you, due today or earlier. This runs on its own, every day, no manual step involved. A task due three days ago that's still open keeps showing up here for free, every single day, since the check is on or before today, not exactly today. Today's items and carried-over overdue ones should sit in two visibly distinct groups on the same list, so it's clear what's freshly due versus what's snowballed, though underneath it's one query, not two.

**What you add manually:**
Anything you want to focus on today that isn't actually due today, pulled in from Tasks, Planned, Important, or any folder, wherever it currently sits. This never changes the task's real due date, you're choosing to work on it, not rescheduling it. Once pulled in, it behaves exactly like an automatically-due task from that point forward, if it's not finished today, it's still here tomorrow, and the day after, until completed or abandoned. Pulling it in is a one-time decision, not something that needs repeating every morning to stay visible.

**Nothing here is ever silently removed:**
An open task snowballs forward on its own, every day, forever, until one of exactly two things happens, you complete it, or you explicitly mark it abandoned. Abandoned means it stops resurfacing here going forward, its due date stays exactly as it was for the record, and it remains fully visible in its actual home and in All. Abandoning something never deletes it or hides it from the rest of the app, it only stops nagging you specifically here.

**Completed tasks:**
A task finished today doesn't vanish from the page, it drops into a collapsed, faded section at the bottom, still there, still searchable, just out of the way of what's still open. That gives you an actual end-of-day view of what got done, instead of a list that just quietly shrinks with nothing to show for it.

**The important toggle:**
A switch that narrows today's list down to the starred ones. This is a different question from the standalone Important page. That page asks what matters most across everything, any date. This toggle asks a narrower one, of what I'm actually dealing with today, which of these matters most. So it doesn’t jumble mumble today stuff with stuff that’s already snowballed from the past days. It’s more of UI thing than an architectural thing, but we can just by default seperate today stuff with a seperator or some color or something, from stuff that’s snowballed, but i’m not saying anything about the aesthic things, it’s way later thing.

**Cross-listing:**
A task that's due today and also flagged important carries a small star or the specific “important” design here, same as anywhere else it shows up. Hovering it confirms the task is flagged important. Nothing special about My Day here, the flag just follows the task wherever it appears.

**Recurring tasks need no special handling here:**
Only the current occurrence is ever a real row with a real due date. My Day sees a normal task with a date, nothing more, it has no awareness that the task recurs at all. Completing or just passing the due time/date of a recurring task generates a new task, it never generates stuff up to infinity from the get go, it generates the next occurrence with its own future date, which won't qualify for today's list until its own day comes.

**Settings:**
Cannot be hidden. One of the three permanent pages, alongside Tasks and Planned.

*Implementation note: two things drive inclusion, due_date and a separate marker for manual pull-ins, both checked the same way, on or before today, not equal to it. Status needs exactly three values, pending, completed, abandoned, a plain done or not-done boolean can't represent this page at all.* ⚠️ This is might be wrong.

## Tasks 📌

Tasks holds every task that has no due date. That's the entire definition, one condition, nothing else. It's not a folder, it's not a filter someone applies, it's simply where a task sits the moment due_date is empty. The instant someone gives that task a date, it stops belonging here and starts belonging to Planned instead, automatically, with no separate move action, since a task's home was never manually chosen to begin with, it was always just a read of one field.

**Scope, and why it has to match All exactly:**
This page is not limited to your own tasks or your own folders. It shows every undated task across every folder you have access to, yours and anything shared with you, regardless of who it's assigned to. This has to be true for a reason beyond convenience: Tasks and Planned are supposed to add up to exactly All, every task is in exactly one of the two, nothing missing, nothing double-counted. That only holds if both use the same scope All does. If Tasks were narrowed to just your own assignments, the math breaks, and All stops being a clean union of the other two.

**What actually lives here:**
The stuff you don't know when you'll get to. Reading a book, a video you saw that made you want to try something, a road trip you want to look into eventually. Nothing wrong with these tasks, they're just not time-bound yet, and forcing a date onto them to make them "real" would just be a made-up date that means nothing.

**How it's laid out, since this page will hold the most tasks by far:**
A flat, unsorted wall of everything undated across every folder would be unusable the moment you have more than a handful. So it's grouped, not flat: tasks sitting in your Default Folder float at the top with no heading, since they were never filed anywhere on purpose, and everything else is grouped underneath its actual folder name. A folder with nothing undated in it just doesn't show up here at all, no empty headers cluttering the page. This isn't a new pattern, it's exactly how Things 3 organizes its version of this same page, loose to-dos without a parent float at the top, and the rest group under their folder. Worth copying, not reinventing.

**Sort order inside a group:**
No due date to sort by, so it defaults to creation order, newest first, and can be manually reordered by drag if someone wants a specific order within a folder's undated pile. Small detail, not architecture, either default is fine, this is just the one I'd start with.

**Assignee is visible, not filtered:**
Since this page isn't scoped to you specifically, a shared folder's undated tasks assigned to different people all show up together here. Each row needs to show who it's assigned to so it's clear whose is whose. A task sitting in your own Default Folder has no one else it could be assigned to, remember, that folder only ever has one member, so those rows just read as yours without needing to say so.

**Recurring tasks need nothing special:**
A recurring task always has a real due date for its current occurrence, that's what makes it recurring, so it structurally can never qualify for a page defined entirely by having no date. It always belongs to Planned. Nothing extra to build here.

**Important still cross-lists exactly the same way:**
A task here can also be starred. It shows the same star, same tooltip, same behavior as everywhere else, and it also shows up in the Important view. This page doesn't treat that flag any differently than My Day or Planned do.

**Completed tasks:**
Once marked done, a task drops out of the default view here, same as it would anywhere else that isn't My Day specifically. It isn't deleted, it's still reachable by search, it just isn't cluttering the pending list. My Day's fade-and-collapse treatment for completed items was a deliberate, specific feature for that one page, an end-of-day recap, not the default behavior everywhere, so it doesn't carry over here.

**Adding a task directly from this page:**
Defaults to no due date and to your Default Folder, since you're not inside any specific folder when you hit add from here. Either can be changed in the creation form itself, this is just what happens if you don't touch those fields.

**Fields that don't apply here:**
Reminder needs a due date to be relative to, already established, so it's simply not available on a task while it's sitting in Tasks. The moment it gains a date and becomes a Planned task, reminder becomes available. Duration stays available regardless, since how long something takes has nothing to do with when it happens.

**Settings:**
Cannot be hidden. One of the three permanent pages, same as My Day and Planned.

*Implementation note: the query is folder_id in (every folder you have access to) AND due_date IS NULL AND status = pending, grouped by folder_id, Default Folder's tasks rendered ungrouped at the top.* ⚠️ This is might be wrong.

## Planned 📌

Planned holds every task that has a due date. Same logic as Tasks, just the other side of the same coin, one condition, due_date is set instead of empty. The moment someone clears a task's date, it leaves Planned and lands back in Tasks automatically, same as the reverse direction already works.

**Scope matches All, same reasoning as Tasks:**
Every dated task across every folder you have access to, not narrowed to your own assignments. Tasks and Planned have to add up to exactly All between them, so both need the same scope All has, or the math stops working.

**A due date isn't always just a day**

Appointments need an exact time, not just a date. "Submit the report" due Friday is a full-day thing, no specific hour attached. "Dentist" due Friday at 15:00 is a specific moment. Those need to render differently on a calendar, an all-day banner versus a slot sitting at a specific hour, the same way Google Calendar or any calendar app draws that distinction.

So due_date needs a companion field, due_time, optional. No due_time means it's a day-level task, shows as a banner across that whole day on the calendar. A due_time set means it renders as an actual time-slot. This doesn't touch the Tasks and Planned split at all, that's still governed entirely by due_date alone, due_time is just extra detail on a task that's already dated.

**On the UI Side, there must be two render modes**

*List mode:* every dated task, sorted chronologically, nearest date first, cross-folder. Not grouped by folder the way Tasks is. Tasks had nothing else to sort by, so folder was the natural fallback. Planned has an obvious sort axis already, time, so it uses that instead, folder name just shows as a small label on each row, not the organizing structure.

*Calendar mode:* the same tasks laid out on an actual grid, day, week, month, or year zoom. A calendar physically can't place something with no due_date on it, so this mode is naturally, automatically restricted to exactly what belongs on Planned anyway, nothing extra to enforce.

**Recurring tasks**

Only ever one real row in the database for a recurring task, its current occurrence, exactly as already established. The calendar grid needs to show that task on every day it recurs within whatever's currently on screen, a month view of a "every Monday" task needs to show it on all four or five Mondays visible, without four or five real rows existing anywhere. So the calendar draws virtual instances, computed fresh from the recurrence rule, purely for whatever date range is currently visible, and throws that computation away the moment you scroll elsewhere. Nothing virtual ever gets written to the database. Scroll to next month, it computes a new batch for that range. Also recurring tasks must have a start and end date also so it’s not recurring up to hell.

List mode does not do this. It shows only the one real row, the actual next occurrence. A flat list projecting a daily task out for a full year would be absurd and useless, there's no natural cutoff the way a calendar's visible range gives you one for free. Calendar mode projects because it has a bounded frame to project into, list mode doesn't, so it doesn't.

**Assignee is visible:**
Since this isn't scoped to you specifically, each row shows who it's assigned to. Same exception as before, a task sitting in your own Default Folder only ever has one possible assignee, so it just reads as yours.

**Important still cross-lists exactly the same way:**
Same star, same tooltip, same behavior as My Day and Tasks. This page doesn't treat the flag any differently. BUT STILL, this is a UI choice, so it’s aesthetic choice (star, color, whatever) can change.

**Completed tasks, with one real exception this page needs and the others don't:**
Going forward, a completed task drops out of the default pending view, same as Tasks. But calendar mode also functions as a look-back, browsing last month should still show what was actually on your plate that day, completed items included, faded or checked off rather than erased from history (again an aesthetic choice that could change). A calendar's job includes being a record, not just a forward-looking list, so this is the one page where a completed task should stay visible once you're looking at a date that's already passed.

**Adding a task directly from this page:**
Defaults to a date already filled in, today if added from list mode, or whichever day you clicked if you're adding it directly onto a calendar cell. Folder still defaults to your Default Folder, same as Tasks, since you're not inside a specific folder's context here either. Both are just defaults, changeable in the form itself.

**Reminder becomes available here, the mirror of what “Tasks” page couldn't do:**
Tasks couldn't offer reminder since there was no date for it to be relative to. Every task on this page has one, so reminder is fully available. If due_time is set, a reminder is naturally an offset before that exact moment, remind me 30 minutes before or whatever time (still debatable) via email or sms or anything. If only due_date is set with no time, a reminder just needs its own specific time on that day, since there's no hour to count backward from.

**Settings:**
Cannot be hidden. One of the three permanent pages, alongside “My Day” and “Tasks”.

*Implementation note: query is folder_id in (every folder you have access to) AND due_date IS NOT NULL AND status = pending, sorted by due_date then due_time ascending for list mode. Calendar mode additionally expands any recurrence_rule into virtual instances scoped strictly to the visible date range, computed on read, never persisted.* ⚠️ This is might be wrong.

## Important 👁️

Important holds every task flagged as important, full stop, regardless of whether it has a due date, which folder it's in, or who it's assigned to. It's not a home, nothing actually lives here the way tasks live in Tasks or Planned. It's a lens across both of them at once, pulling in whatever matches one condition, the flag is set.

**Scope, and this is where it needs to diverge from My Day specifically:**
Same universal scope as Tasks, Planned, and All, every important task across every folder you have access to, not narrowed to what's assigned to you. This is worth being precise about because it's the opposite rule from My Day. My Day exists specifically to answer what do I have to do today, so it filters by assignee on purpose. Important exists to answer what matters most across everything I can see, which is a different question entirely, so it stays unfiltered by assignee, same as Tasks and Planned already do, showing who each task belongs to on the row rather than hiding anyone else's.

**What actually shows up here, since it mixes both homes at once:**
A task pulled in here might have a due date or might not, there was never a rule that important things need one. So this page is the one place in the whole app where Tasks-origin and Planned-origin items sit in the same list together. Dated ones sort to the top, soonest first, same ordering Planned already uses, since something with a ticking clock deserves to surface above something that doesn't have one, even within the important pile. Undated ones follow underneath, sorted the same way Tasks defaults them, newest first.

**Each row needs to show where it actually lives, since this page doesn't organize by either home:**
A dated row shows its due date, and due time if it has one, exactly like a Planned row would. An undated row shows its folder instead, exactly like a Tasks row would. Nothing new is being tracked here, this is just surfacing information that already exists on the task, presented per row instead of assumed from which section it's sitting in, since there are no sections.

**The star flips meaning here, and this is the actual answer to what you asked about the tooltip:**
On Tasks, Planned, or My Day, the star confirms this is also flagged important. Here, every row is already important by definition, so a redundant star saying so would tell you nothing you don't already know. Instead, the star here points the other direction, hovering confirms which other page this task is actually sitting on, also in Planned, due Friday, or also in Tasks, filed under Work. Same mechanic you described, same interaction, just mirrored to answer the more useful question on this specific page.

**Completed tasks:**
Drops out of the pending view immediately, same as Tasks and Planned, not the fade-and-collapse treatment My Day uses. That treatment was specifically an end-of-day recap tied to a single day's session, and Important has no concept of a day resetting, so it doesn't carry over here. Still fully searchable, never deleted, just no longer cluttering an already-curated list.

**Un-starring a task while looking at this page:**
It disappears from the view immediately, since it no longer matches the one condition that put it here. Nothing about the task itself changes beyond that, still sitting exactly where it always was in Tasks or Planned, just no longer flagged.

**Adding a task directly from this page:**
Defaults to important set to true, since that's the context you added it from, otherwise behaves exactly like adding from Tasks, no folder specified so it lands in your Default Folder, no date so it's undated. Give it a date afterward and it becomes a Planned-homed task that's still important, nothing about adding it here locks it into staying undated.

**Recurring tasks:**
Nothing new mechanically, only the current occurrence is ever a real row, same as everywhere else. Worth stating plainly since it's directly relevant to this page specifically, the important flag carries forward automatically when a completed recurring task generates its next occurrence, same as its folder, notes, and duration do. Only the date advances and status resets, everything else about the task stays exactly as it was.

**Settings:**
Can be hidden, alongside All, unlike My Day, Tasks, and Planned. Hiding this page is purely a nav visibility setting, it has zero effect on the underlying flag or on the star and its tooltip appearing on Tasks, Planned, or My Day. Someone can hide this page entirely and every star in the rest of the app keeps working exactly the same, since those two things were never actually connected to begin with.

*Implementation note: query is folder_id in (every folder you have access to) AND important = true AND status = pending, ordered by due_date ascending with nulls last, so dated items surface first and undated ones follow beneath them.* ⚠️ This is might be wrong.

## All 👁️

All holds every task you have access to, full stop, with exactly one condition, it isn't finished. No date filter, no folder filter, no assignee filter, nothing. Since every task is, by definition, either in Tasks (no due_date) or in Planned (has one), All is nothing more than those two added together. It was never a third bucket, it's the union of the two you already have.

**Scope matches Tasks, Planned, and Important, not My Day:**
Every task across every folder you have access to, not narrowed to what's assigned to you. Same reasoning as the last three pages, this one answers what exists, not what's mine to do today, so assignee never filters it.

**The one real decision this page actually needs: how dated and undated tasks share a single unfiltered screen**

"No filters" describes interaction, whether you have to click anything to narrow the list, not structure, whether the page has any organization at all. Those are different things, and worth being precise about, since a single list with dated and undated tasks thrown together in arbitrary order would be genuinely unusable the moment it holds more than a dozen items, no filters or not.

The honest fix costs nothing new: since All is just Tasks plus Planned, show it as exactly that, two sections stacked in one continuous scroll, Planned's block on top exactly as Planned already renders it, chronological, Tasks' block underneath exactly as Tasks already renders it, grouped by folder, Default Folder ungrouped at the top. Nothing new to build, no third sorting scheme to invent, this page just displays the output of the other two pages back to back. Zero clicks, zero choices, still exactly one continuous page, which is what "no filters" actually asked for.

I did consider the fully flat alternative, one list, sorted by date, undated items pushed to one end since they have no date to sort by. It ends up looking almost identical to the two-section version, just without a heading explaining why the list suddenly stops having dates partway through. That reads like a bug. A labeled section costs nothing and removes the confusion, so that's the one I'd build.

**Search doesn't actually belong to this page, and that matters now that it's hideable**

Earlier I'd said All's main surviving value was being a single surface to search when you don't remember if something had a date. That was sloppy, because this page can now be turned off in settings, and losing the ability to search everything as a side effect of a nav-visibility toggle would be a real, accidental cost, two unrelated things breaking together for no good reason. Search needs to live in the global chrome, available from anywhere in the app, completely independent of whether All itself is shown in the sidebar. Hiding All should only ever mean one less nav item, never less searchable.

**What's actually left once search is pulled out, and that's a fine, complete answer**

Once search stops being All's job, what remains is exactly what it looks like, one continuous page for seeing everything at once without switching between Tasks and Planned. That's the entire purpose, nothing more, and it's a legitimate one, just a genuinely smaller one than Tasks, Planned, or Important each carry on their own. Which is exactly why it's the one you already flagged as fine to hide, that instinct holds up once everything else is accounted for.

**Important still cross-lists the same way:**
Same star, same tooltip, appearing on whichever rows are flagged, whether they came from the Planned block or the Tasks block underneath it.

**Completed tasks:**
Drop out of the pending view immediately, same as Tasks, Planned, and Important. My Day's fade-and-collapse was tied specifically to a single day's session resetting, which has no equivalent concept here.

**Recurring tasks:**
Only the current occurrence is ever a real row, same as Tasks and as Planned's list mode specifically. All has no calendar mode and no bounded visible frame to project virtual instances into, so nothing gets projected here either, same reasoning as why Planned's list mode doesn't project but its calendar mode does.

**Adding a task directly from this page:**
Defaults to no due date, landing it in Tasks, same default Tasks itself uses. All has no single obvious date context the way Planned's calendar cells do, so absence of an explicit date should default to undated rather than manufacturing one.

**Settings:**
Can be hidden, alongside Important. Purely a nav-visibility toggle, same as Important's, no effect on any task's data, on the star appearing elsewhere, or, now that it's separated out properly, on global search.

*Implementation note: query is folder_id in (every folder you have access to) AND status = pending. No other condition. It's the broadest query in the entire app, Tasks' query and Planned's query combined with their due_date conditions simply removed.* ⚠️ This is might be wrong.

## Done 👁️

Done holds every completed task, across every folder, shown by the day it was finished. It's a view, exactly the same category as Important and All, not a home. A task's folder_id and its Tasks-or-Planned origin never change when it's completed, only status and completed_at do, so nothing here is a copy or a move, it's the same row you'd find sitting in its real home, just surfaced through a different lens.

**Scope, same universal reach as Important and All:**
Every completed task across every folder you have access to, not narrowed to your own assignments, same reasoning as the other cross-cutting views, this answers what got finished, not what's mine.

**Layout:**
Grouped by completed_at, one day per section, most recent day at the top, and within a day, most recently finished task at the top of that section. Each row shows the task's actual folder and its due date if it had one, same convention Important already uses, since this view also mixes Tasks-origin and Planned-origin items together with nothing else distinguishing them.

**This list only grows, so it loads in chunks:**
Load the most recent stretch of days first, fetch further back as someone scrolls. It's the same pagination pattern already flagged when we first talked this through, the one page in the whole set that isn't naturally bounded the way the others are.

**Recurring tasks actually make this page more useful than it might look at first:**
Completing an occurrence doesn't delete it or turn it into the next one, it stays exactly where it is, now permanently marked done on that date, while a separate new row gets created for the next occurrence over in Planned. So a daily or weekly recurring task builds a real trail here over time, one completed row per day you actually did it, which is a genuine, useful log, did I take the bins out last Monday, scroll to last Monday, it's right there.

**Abandoned tasks don't appear here:**
Different state entirely, given up on rather than finished, and they already stay visible in their real home and in All, this page isn't a second place for them to surface.

**Un-completing a task from this page:**
Reverses status back to pending, and the task simply disappears from this view and reappears wherever it actually lives, Tasks or Planned depending on whether it has a due date. Nothing else about it changes.

**No add-task affordance here, unlike the other four pages:**
There's no sensible way to create a task that's already done, that's backwards. Logging something already finished still means adding it wherever it actually belongs and marking it complete there, not adding it directly from this view.

**The important star still cross-lists here, same as everywhere:**
A completed task that was also flagged important still shows the star, same tooltip, same behavior. Being done doesn't undo being important, they're still two independent facts about the same task.

**Settings:**
Hideable, and off by default, unlike Important and All which I'd lean toward shipping visible. This one's pure history with nothing actionable in it, and it starts genuinely empty on day one regardless, so there's nothing lost by leaving it tucked away until someone actually wants to look back.

*Implementation note: query is folder_id in (every folder you have access to) AND status = completed, grouped by completed_at descending, then completed_at descending within each day group, cursor-paginated on completed_at for infinite scroll. ⚠️ This is might be wrong.*

# 4. Deferred for v2

## Deferred: Dana Chat

Instead of a separate "AI Suggestions" page and a separate "add task with AI" page, there's just one page called Dana, where you chat about a task or a project. Dana asks back-and-forth questions to understand what you actually need, then, once it has enough context, builds the task, or breaks a project into multiple tasks and steps, for review before saving.

You describe a goal or responsibility in chat. Dana discusses it with you, then turns it into a structured set of tasks and steps, with suggested durations, deadlines, and reminders. Nothing saves until you review and approve it, through the exact same creation form already specified, Dana is filling that form out on your behalf, not inventing a second way to create a task.

This is the one genuinely foundational piece here. Everything else below either needs this to exist first, or needs the same underlying model access this establishes.

## Deferred: Sharing Content With Dana

You send Dana a screenshot, an email, a message, a photo of a blackboard, a meeting summary, a document, whatever. Dana reads it and extracts possible tasks, then you add, edit, or ignore whatever it finds. Nothing gets added automatically without confirmation.

Mechanically, this is Dana chat's engine pointed at a different input, a file or a paste instead of a conversation. Extracted candidates should land in a review queue, not straight into Tasks or Planned, a badge on the Dana page is enough to surface it. Approving one runs it through the same creation form as everything else, this is drafting, not a separate save path.

## Deferred, and further out than it looks: Automatic Inbox Scanning

The idea of a cron job that crawls your inbox for appointments and paperwork and drops them straight into Tasks or Planned is the same extraction engine from the section above, just with the trigger changed from you sharing one email on purpose to Dana reading everything, continuously, uninvited. That difference is bigger than it sounds, worth naming both parts of it plainly.

The practical cost: reading a user's entire inbox on an ongoing basis is a sensitive Gmail OAuth scope, not the same tier of permission as "read this one email I forwarded you." Google puts scopes like that through a security assessment and annual re-verification. That's a real operational cost sitting on a two-person team, not just more code to write, and it's worth knowing that going in rather than discovering it once you're ready to ship the feature.

The design risk is the same one already caught with calendar linking: an automatic system guessing at what's a real appointment versus what's a promotional email or a newsletter mention of a date is going to be wrong sometimes, and a wrong task that showed up on its own, that you never asked for, is a worse experience than a wrong extraction from something you deliberately handed over. Same failure mode, different feature.

Sequencing, if this ever gets built: prove the manual version first, sharing content with Dana, actually used, actually trusted. This is the automated version of that, not a parallel feature, and it shouldn't get built before the thing it's automating has been validated.

## Deferred, possibly permanently: Calendar Linking

Not imports, linking, so Dana can see open timeframes when suggesting when to do something. Still risky for the reason already on record: most people don't log everything on their calendar, so Dana would routinely assume a slot is free when it isn't, and that false assumption causes more problems than skipping the feature entirely. Nothing about anything built since changes this calculus. Worth keeping on the list as an idea, not as a commitment, it needs someone to actually solve the false-assumption problem before it's buildable at all, not just time and priority.

## Deferred: Stats Page

Worth separating from the three above, since this one doesn't wait on the AI layer at all, it's gated on unclear value, not on a missing dependency. It could be built the day after V1 ships, and it still might not be worth building.

A breakdown of time or effort by category, family, work, entertainment, shown as percentages, feeding into something like a productivity index. The categorization problem this needed is already solved by something that exists for an unrelated reason, Folders. There's no need to resurrect the tags debate, a user's own folders already are their categories, Work, Personal, Fitness, whatever they've named. And "time or effort" doesn't need a new time-tracking system either, duration is already a field on every task, summed per folder, that's a real, if rough, effort proxy with zero new data to capture.

The public, shareable version, example.com/username, stays cut, same reasoning as before, an index like this only means something if there's a social graph around it to make comparison meaningful, and a brand new app has nobody to show it to yet. A template library, letting people duplicate reusable folder and task structures the way Notion templates work, is a more promising direction than a public profile, but it's further out still, and only worth real consideration if Dana grows well past being a to-do app.

---

Attachments and an activity log are still sitting in this same deferred bucket from earlier, unchanged, nothing new to add there.

If any of this becomes real, the order that actually makes sense is Dana chat first, sharing-with-Dana second since it reuses the same engine, Stats whenever, independent of both, and inbox scanning last, after the manual version has actually proven itself and someone's ready to deal with the OAuth approval process. Calendar linking sits outside that order entirely, since it's not a sequencing problem, it's an unsolved design problem.

Still open whenever you want it: the folder-owner-deletes-their-account question, and the tech stack conversation itself.

## Deferred: Templates

This is wayyyy later func.