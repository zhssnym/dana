# RFC 0002: Replace the client user interface with the designer's prototype

**Status:** implemented
**Milestone:** none, this RFC predates the milestone process

Package P8D was chartered to carry the designer's visual values onto markup an earlier
package had built, a restyle rather than a replacement. The owner opened both
applications side by side on 2026-08-13 and rejected the result. This RFC replaced the
client's markup and components with the designer's committed prototype wholesale, wired
to the data layer the application already had. It shipped in v1, and its specification
changes were folded into `docs/spec/` on 2026-08-17. The spec has since moved past them,
so the interface they described no longer exists and the delta is not reproduced here.

**An instruction failed by generalisation, and six sessions obeyed it.** The rejection
was not a defect in anyone's work: six sessions did what the plan row told them, and the
row was wrong. The row said the designer's pages "are read and never copied", reasoning
in the same sentence that his screens run on fixtures where ours run on the query layer
against a real API. That argues against copying his data wiring and against nothing
else. A component rendering a task row does not become untrustworthy because the object
it rendered came from a fixture; the fixture is what is untrustworthy. A narrow and
correct ruling about component provenance was generalised into a rule covering the whole
package, and the composition the owner was actually rejecting sat inside the part that
got generalised away.

**Nobody ran the prototype.** Not the kickoff, not the audit, not one of the six
implementing sessions, in a package whose entire subject was appearance. This RFC was
written with both applications running, and three claims in the research handed to it
proved false, each in a way that only running the application exposes. Two of them
changed what the work had to do.

Two rejected options are worth keeping. **Replacing the markup but keeping FullCalendar
7** was close, and is recorded as close so nobody reverses it cheaply: the library
carried the keyboard and accessibility handling in the one place this change gives up
most. It lost because the design fixes a constant six-week grid height and a "+N more"
overflow, a layout the library has opinions about, so keeping it meant fighting it on
the surface the design is most specific about. **Moving the acceptance suite to the new
markup** was refused outright: six criteria would have had to assert buttons where they
assert links, which is changing the contract to match the implementation.

One ruling here outlived the RFC and is now house style. The designer's approved landing
copy used an em dash and it was replaced with a comma, because the punctuation
convention holds across the whole corpus, including copy adopted from outside it.
