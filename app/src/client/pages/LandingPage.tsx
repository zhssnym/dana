/*
9.2's public page, at `/`.

Four rules and one paragraph: one screen describing the shipping product,
collaborative to-do lists in shareable folders; no AI claim anywhere in v1
copy; a single "Continue with Google" button; privacy and terms links.

**Single** is the word to keep. The ordinary way one call to action becomes two
is a hero and a footer, and a page with two of them fails a criterion written
against exactly that.

**The claim rule is broken by addition**, so the thing to watch when this copy
changes is what gets added rather than what is here. Section 13 item 14 records
the final wording as the designer's under that rule; what is below is
placeholder copy that obeys it, and the rule outlives the copy.

The sign-in link carries the browser's zone, which is 7.1's optional tz: it
rides the pending-authorization record to the callback, where it becomes the
new account's timezone. A value that fails validation is treated as absent
rather than refused there, a deliberate deviation so a stale zone database
cannot lock anyone out of signing in.

This page renders whether or not there is a session. A client that redirected
signed-in visitors away from `/` would hide the only surface an
unauthenticated person ever sees from everyone who could check it.
*/
import { browserTimezone } from '../api/tz.js'

export function LandingPage(): React.JSX.Element {
  const signInHref = `/api/v1/auth/google?tz=${encodeURIComponent(browserTimezone())}`
  return (
    <main>
      <h1>Dana</h1>
      <p>
        Shared to-do lists that stay in one place. Put your tasks in folders, share a
        folder with the people it concerns, and everyone sees the same list.
      </p>
      <p>
        Give anything a date and it shows up on the day. Assign it to someone and it
        shows up on theirs.
      </p>
      <a href={signInHref}>Continue with Google</a>
      <ul>
        <li>
          <a href="/privacy">Privacy</a>
        </li>
        <li>
          <a href="/terms">Terms</a>
        </li>
      </ul>
    </main>
  )
}
