# Dana

Dana is a tool to plan and finish projects. Each project is a page:

- Write what the project is for.
- Divide the work into tasks.
- See what is done and what remains.
- Add people, and discuss the work in threads beside it.

Dana joins a document editor, an issue tracker and chat threads in one tool, with only the
parts that a person needs to finish a project. Dana is free and in beta at
[dana.so](https://dana.so). You sign in with Google.

## Stack

- One Node 24 process: an Express 5 API and a Vite and React app.
- Postgres in production, on Render. PGlite on your computer and in tests.
- Uploaded files are in Cloudflare R2.
- A merge to `main` deploys to production.

## Run it

Run these commands from the repository root:

```bash
npm ci
DANA_DEV_LOGIN=1 npm run dev
```

Then open the address that Vite shows. `DANA_DEV_LOGIN=1` lets you sign in without Google.

To do the tests, run `npm test`.

## Change the code

Read `AGENTS.md` first. It gives the commands, the steps to ship a change, and the traps
to look for. The rules that the code does not show are in `docs/`.

## Team

- Hassan: the project, the back end and the infrastructure. He builds Dana with Claude Code.
- Imran: product and design.
