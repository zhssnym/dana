# RFC 0004: The v2 build

**Status:** implemented
**Milestone:** none, this RFC predates the milestone process

The work order for v2: build RFC 0005's backend systems onto the existing single
deployable, then replace the client with the approved v2 design. Thirty-one packages ran
in order, one agent session each, and it released as 2.0.0 on 2026-08-30.

**One item in it is still live.** The September hosting move was hard-dated. The free
database expires **2026-09-12**, and the purchases were planned for 2026-09-10 or 11: a
paid Postgres instance, and an always-on service so that idle suspension stops freezing
the in-process reminder tick. As of 2026-09-01 neither has happened. It is tracked as
GitHub issue #15, and the finding behind the always-on half is spec section 13, item 35.

**Why the patch strategy was superseded rather than extended.** It missed the same target
twice, with a recorded mechanism both times. The first miss: no artifact was ever named
`prototype-v2/`, so the packages building the client built it from the v1 prototype while
reading the rulebook correctly, and the checkpoint showed the owner a client that was
never being built from his design. The second miss: the parity audit that followed
measured 31 surfaces for appearance and structure, and the packages closed what that
audit measured, so the next checkpoint showed surfaces that match and behaviour that does
not. A surface audit marks a task card ported without ever noticing that the prototype's
card carries a comment thread. The deeper mechanism is spec 11.13's own sentence: a
design decision reaches Dana only by being read into a numbered section, so every
prototype decision that never reached a section was never handed to any session and was
never going to be built. **Patching fixes what the last instrument measured.** When the
target is the prototype itself, the instrument has to be the prototype itself.

**Lift, do not re-derive.** The client was replaced by the prototype's own code, surface
by surface, bound to the existing API through an adapter seam. That rested on a
measurement taken before the strategy was written rather than on an assumption: the
prototype's coupling to its fixtures was concentrated rather than spread. Its components
imported a small set of named lib modules and navigated by query parameter, while the
markup, classes, pickers, drags and animations touched no data at all. So the seam was
those modules rewritten over the query layer plus one navigation adapter, and the
component files crossed verbatim. The discipline that made it checkable: **a lifted file
diffs empty against its prototype original except at named seams**, and every seam
carries a comment saying which adapter it crosses. A session rewriting a component's body
has left the strategy and found an escalation.

Two smaller lessons. **One package per chat, from measurement:** a session that carried
one and a half packages spent 72% of its window and about 280 million cached tokens, and
running out of window mid-package is the expensive failure, because the next session pays
to rediscover what the last one knew. **And a column naming an owner is not an
authority:** the plan's owner column was wrong six times running, because it named who
was known when the row was written; the role definitions were the record.

Three options lost. **One combined RFC**, RFC 0002's shape, lost to splitting the
contract from the work order: the two are judged by different questions, one asking
whether this is what Dana should be and the other whether this is how we get there.
**Porting the client first and building the backend after** lost because half the
approved screens draw features with no backend, so the port would have re-created the
prototype's fixture hazards in shipping code. **A big-bang swap with no foundation
package** lost to RFC 0002's experience: tokens and primitives land first, or every arm
re-imports its own.
