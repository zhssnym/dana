# dana pdd v2

### General Concept

Dana is a webapp, built as a PWA. This means it can be installed and used like real software, but without needing separate OS-level compilations, builds, or signatures for iOS/Android/desktop. The goal is to keep the technical side simple so we can get an MVP out as fast as possible.

### Landing Page

A simple website that explains what Dana is: a collaborative to-do list with an AI that helps you plan. From there, the user has the option to log in.

### Login

No separate authentication system. The only login method is Google Auth. This covers almost all users and removes the need to build and maintain our own auth system, password resets, etc.

### Workspace

A workspace is where you add the people you work with.

There are no permission levels inside a workspace. Every user is trusted enough to assign tasks, not assign tasks, or ignore things without needing a role system to manage that. If you've added someone to your workspace, you already trust them.

**How adding someone works:**
You enter their email. They receive an invitation.

- If they already have a Dana account, they're added to the workspace directly.
- If they don't, they're prompted to create an account first, and then get added.

Being in someone's workspace only gives you the ability to assign a task to them. It doesn't unlock anything else.

**Core workspace rule:**
You don't see each other's tasks. The only purpose of the workspace is to let people "co-work," meaning share or assign a task to one another. It's less "assignment" in the manager/employee sense, and more "co-working" in the sense of two equals splitting or handing off pieces of work.

*(Still to decide: what happens to a task assigned to someone who leaves the workspace? Other workspace rules may come up as we build.)*

### Folders

A folder is a shared container for tasks, though you don't have to share it with anyone. You can create a folder (like Work / Personal split or just a mini folder for a project) just to organize your own stuff, or you can invite people into it.

**How folder invites work:**
You invite someone into a folder the same way you invite them into a workspace. Once they're in, they can see everything inside that folder: every task, not just the ones assigned to them. They can open any task and mark it complete.

This is different from the base workspace rule above. A folder is the one place where shared visibility actually exists. Being invited to a folder should probably also add that person to your workspace, since folder access already implies enough trust to assign them things directly too.

**Folder stats:**
A folder shows via visual anchor that how much of its tasks are done, something like "6 of 10 done." This is a smaller, narrower version of the Stats idea below, scoped to one folder instead of the whole account.

**How a folder-tied task behaves:**
A task inside a folder is a completely normal task: same fields, same assignment mechanics as any other task. The two things that change:

- it counts toward that folder's completion stat
- everyone with access to the folder can see it there

*Still to decide: if a folder task is assigned to someone, does it also show up in their regular Tasks / All page like any other assigned task, or does it stay out of Tasks / All and only surface through the folder itself and My Day (if it's due that day)? These are genuinely two different behaviors:*

- *Option A: a folder task behaves exactly like any assigned task. It always shows in Tasks / All too. The folder just adds an extra place to see it, plus shared visibility for teammates.*
- *Option B: a folder task is deliberately scoped. It only shows inside the folder and in My Day when due, keeping Tasks / All as "things I'm handling outside of any folder" plus whatever's due today.*

### My Day

Shows all tasks due for that specific day. This is just a filtered view of all your tasks, filtered by "due today."

If a task isn't completed by the end of the day, it snowballs into the next day automatically. If a task genuinely can't be moved to another day, it can be marked as unfinished/undone instead of snowballed.

Snowballed and unfinished tasks should indirectly affect the productivity index (see Stats, below).

### Important

This doesn't need to be its own separate page. It can just be a filter inside My Day: tasks get flagged as "important," and there's a toggle that shows only the important ones for that day.

*(Still slightly debatable, but this is the simpler and more correct approach.)*

### Planned

This page has two possible meanings, and I haven't decided which one it should be yet, or whether it should be both:

**Option 1: Big-picture calendar view.**
Like looking at Google Calendar zoomed out. Shows a week, month, or year view, and colors in the days that already have tasks planned. Days with important tasks get a different color. This gives you a visual sense of your future workload at a glance.

**Option 2: A "someday/maybe" list.**
For vague ideas that aren't ready to become real tasks yet. Example: you see a road trip video on Instagram and think "I want to do this eventually," and you just want to save that thought somewhere so you don't forget it. It still needs proper planning and a specific day before it becomes a real task, but for now it just lives here as a "want to do" item.

### Tasks / All

These two pages are essentially the same thing: everything that's yours, plus everything assigned to you. Both would show the same list.

If we want a way to see the week at a glance (not just today, like My Day, but the whole week), that filtering should probably happen inside My Day or inside this page, rather than creating a whole new page for it. A user could click something like "day / week / month" to change how much time range they're looking at.

**Important open problem: recurring tasks.**
If we ever show a month's worth of tasks at once, recurring tasks (like a daily task) will multiply and flood the view, crowding out the actual planned work. We need a real solution for this before building a month view, not an afterthought.

*(See Folders above: whether folder-tied tasks show up here too is still an open question.)*

### Calendar Imports

Not needed, and it adds unnecessary complexity. Most normal users don't know how to import a calendar file, and more importantly, Dana isn't a "manage your whole day" app, it's a "to-do" app.

The one thing that could make sense is letting a user *link* their Google Calendar (not import it), so Dana can look at open timeframes when suggesting when to do a task. But even this is risky: most people don't log everything on their calendar, so Dana could easily assume a time slot is free when the user is actually busy, just because it wasn't written down. That false assumption would create more problems than it solves, so this whole feature is currently more mess than value.

### AI Suggestions (Dana Chat)

Instead of a separate "AI Suggestions" page for one thing, and another “Add task with AI” page again, there should just be a page called "Dana" where you can chat with it about a task or a project. Dana asks you back-and-forth questions to understand what you actually need, and once it has enough context, it builds the task (or breaks a project into multiple tasks and steps) for you to review before saving.

### Creating a Task

**Manually:** through an always-available "add task" element, likely a floating button at the bottom of the screen that expands into a full task-creation view when clicked. From inside that view, you should also be able to jump into "Dana" if you'd rather talk it through than fill out the form yourself.

**With Dana:** you describe a goal or responsibility in chat. Dana discusses it with you, then turns it into a structured project: broken into tasks and steps, with suggested durations, deadlines, and reminders. Nothing gets saved until you review and approve it.

### Sharing content with Dana

Users can send Dana things like screenshots, emails, messages, photos of a blackboard, meeting summaries, or documents. Dana reads through them and extracts possible tasks, then the user can add, edit, or ignore whatever it finds. Nothing gets added automatically without the user's confirmation. 

### Stats Page

A page (possibly your profile) showing a breakdown of your time/effort by category: family, work, entertainment, etc, shown as percentages. For this to work, tasks need to be tagged (directly or indirectly) with a category.

This data feeds into something like a "productivity index."

This could eventually be a public page (example.com/username) that a user chooses to share, with a public/private toggle, private by default.

## Comments After Review

### Workspace

**How adding someone works**

- Entering someone’s email should not be the main way to share something in Dana. It would be easier to generate a link for the specific project, list, folder, or other shared structure. The owner could send that link through email, WhatsApp, or any other platform.

**Core workspace rule**

- I am not fully convinced that we need a workspace whose only purpose is allowing people to assign tasks to each other.
It may be cleaner to make collaboration happen directly inside a shared project, list, or folder.
I prefer the Microsoft To Do approach. Members of a shared list or project should see and manage all tasks inside it, not only assigned tasks.
We can also introduce roles in a shared structure (Lists/Project or collection of tasks), like an admin (the main creator of the list or project) can set a role for a member as:
• Admin (Full control)
• ….
• …..
• …..
But, for the first version, I agree that we do not need complicated permission levels for the MVP. Members of a shared structure can initially have equal access.
I do not think users should normally share one task independently. It may be cleaner to invite someone to the project, list, or folder that contains it.

**Leaving the workspace / hierarchy note**

- Assigned tasks should remain after a member leaves. The assignee should simply be removed, leaving those tasks unassigned.

For product hierarchy, a possible structure is **Folder → Project/List → Task → Step**. We still need to decide whether “project,” “list,” “goal,” or another term fits Dana best.

I suggest using **Collection** instead of Project/List. It is broad enough for projects, goals, routines, checklists, and AI-generated task groups.

We should use **Collection** as the universal product term, but also allow optional collection types:
• Project
• Goal
• Routine
• List
• Mission
• Manual name

### Folders

**Folder stats**

- The completion indicator is useful, but it should belong to whichever structure directly contains the tasks, whether that is a folder or a Collection (Project or List).
It has some conflicts with recurring or routine tasks, so it would be better to not include it in the first release.

**How a folder-tied task behaves**

- A task should not be inside a folder. A task should be inside a Collection (project, list, goal, etc). A folder should contain only Collections, though the user can create empty folders.

**Folder task visibility (Option A vs B)**

- Still undecided

### Important

- Important is a task tag, tags are optional in every task, some tags such as important or others should be already there, and user can also use manual tags.

### Planned

- **Planned** should contain tasks with a specific date, time, reminder, or recurrence. It could include both a chronological list of upcoming tasks and a calendar view, allowing users to see their schedule by day, week, month, or year and understand their future workload at a glance.

### Tasks / All

- I think we can make the distinction clearer by separating **Tasks** from **All**.

A task inside a Collection should remain visible inside that structure.
It should also appear in:
- **My Day**, when it is due today.
- **All**, because All should contain every task the user can access.

So, what is Tasks page then?

The Tasks page should contain standalone tasks that are not part of any Collection (project, list, folder, or shared structure).

Examples could include:
- Call the dentist.
- Buy groceries.
- Renew a document.
- Return a package.

I know the name is kind of vague and needs a definition, therefore I suggest Quick Tasks or Standalone Tasks. They can be added to Collections.

### Calendar Imports

- Yes this should be terminated.

### AI Suggestions (Dana Chat)

- I agree that AI Suggestions should become a full Dana chat where users discuss goals, scedules or responsibilities and turn them into reviewed tasks and Collections.
We still need to decide how chat histories are organized. Chats could remain separate but be linked to the projects or tasks they create.

### Stats Page

- The Stats page is still too vague. We first need to define exactly what is measured and whether a productivity score would be useful or misleading.

**I do not yet see a strong purpose for publicly sharing a productivity index. It does not feel essential to the core product.**

A template library may be more valuable than a public stats profile. Users could share or duplicate project plans and professional workflows, similar to Notion templates, though it is highly debatable.
A template library could work by allowing users to duplicate reusable Dana structures, such as Folders, Collections, Tasks, and Steps, with optional schedules, reminders, and recurring rules. Some basic templates could be free, while specialized professional workflows could eventually be sold. However, this would become much more valuable if Dana grows into a broader planning, scheduling, and life-organization platform, so it should probably remain a future feature rather than part of the MVP.