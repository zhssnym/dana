# Authentication

Spec 11.6 is the contract, with 7.1 and 10.1. Each file's header gives its own reasons;
these are the rules that cross files.

- **Two things keep the dev login out of the production build.**
  `app/tsconfig.build.json` excludes `dev-login.ts` by name, and `router.ts` loads it
  through a specifier built at runtime, because tsc still emits an excluded file that any
  import names, a literal dynamic `import()` included (spec 11.15). Rename or move the
  file, or import it from anywhere, and it ships. A build that contains it lets whoever
  posts to it sign in as any account they name, whenever `DANA_DEV_LOGIN=1` is set. After
  touching either half, run `npm run build` and check that `ls dist/src/server/auth` lists
  no dev-login module.
- **Write `users.timezone` only through `writeTimezone`** in `timezone-sync.ts`. It
  updates the column and then, in the caller's transaction, recomputes the scheduled
  reminders on tasks assigned to that person. A plain `UPDATE` silently leaves those
  reminders firing at the old zone's times.
- **A passing suite proves that sign-in works, not what it refuses.** Every acceptance
  test signs in through the real handshake against the stub issuer in
  `app/tests/support/oidc-stub.ts`. A change to one of the handshake's checks (the state,
  the nonce, the ID token signature that `enableNonRepudiationChecks` in `oidc.ts` turns
  on, redirects built only from configuration) is proved only by breaking it: the stub's
  `overrideNextIdToken` crafts a bad token, including one signed with the wrong key.
