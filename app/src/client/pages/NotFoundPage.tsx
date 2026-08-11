/*
A path under /app that 9.1's route table does not name.

It renders inside the chrome rather than replacing it, which is the same rule
the 404 of an inaccessible folder follows: the shell survives, so the person
can navigate away from a page they cannot see.
*/

export function NotFoundPage(): React.JSX.Element {
  return (
    <div>
      <h1>Not found</h1>
      <p>That page does not exist. Everything Dana has is in the sidebar.</p>
    </div>
  )
}
