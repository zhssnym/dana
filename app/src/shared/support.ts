/*
The one address a person writes to when Dana cannot help them from inside the
product.

It is here, in the folder both sides import, because it is now needed on both:
the Settings support row and the legal pages render it (issue #23), and since
issue #17 the sign-in refusal page the server renders has to name it too. A
second literal is how two addresses come to exist, and a support address that
is wrong in one place is worse than one that is missing, because nobody is
told that nobody is listening.

The client still writes the address out in four places
(`pages/LandingPage.tsx`, `pages/LegalPage.tsx` twice, and
`screens/settings-screen.tsx`). Those are Imran's files and are not changed
from here; folding them onto this constant is a one-line import each and is
recorded as a follow-up rather than done quietly from the backend side.
*/
export const SUPPORT_EMAIL = 'support.danadana@gmail.com'
