# Dana: vision and future direction

The owner's statement of where Dana is going, recorded 2026-08-17 so that no
session needs it retold in chat. The words are Imran's, transcribed verbatim
apart from the repository's punctuation conventions. It binds nothing by
itself: the specification remains the only contract, and growth happens
through RFCs when real usage justifies the next layer, which is this
document's own closing rule.

Dana starts as a simple productivity system for managing tasks, projects,
schedules, and collaboration, but the long-term vision is broader. The goal is
to create one place where people can organize the work they are involved in,
understand what needs to happen next, collaborate with others, and
increasingly perform the work itself without constantly moving between
separate task managers, AI assistants, and other tools.

Dana should remain fully useful without AI. Its native structure (tasks,
larger pieces of work, schedules, people, progress, and eventually richer
project context) should be understandable and manageable manually. AI becomes
another way to operate that same structure. A user may create and edit work
manually, or simply describe what they want through text, voice, or other
inputs and let Dana propose the corresponding native changes. The AI should
not create a separate world of chats and generated plans; it should understand
and work through the same objects that the user sees.

Over time, Dana may move beyond helping users organize work and begin helping
them execute it. With explicitly connected tools and controlled permissions,
AI could research, write, work with files, interact with code repositories,
manage communications, or complete other bounded tasks. Humans and AI could
eventually participate in the same workflow, with work assigned to a person,
an AI agent, or both, and with clear states such as waiting, working, blocked,
ready for review, and completed.

The larger ambition is for Dana to become a unified work platform where the
productivity system and the AI system share the same state. For users whose AI
usage is mainly connected to their projects and responsibilities, Dana could
eventually become the primary place they work rather than requiring a separate
task manager plus a general AI subscription. The underlying AI models are
infrastructure; Dana's product value comes from the work structure, context,
collaboration, permissions, execution tools, and experience built around them.

This vision does not mean building all of this now. Dana should grow only when
real usage justifies the next layer. The current product can remain
deliberately simple, but important architectural decisions should avoid
closing the door on richer workspaces, AI-operated actions, human-and-agent
collaboration, integrations, automation, and deeper execution later.
