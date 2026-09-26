# Dana

Dana helps you plan and finish projects without juggling multiple tools. Each project is a page:
you write down what it's for, break the work into tasks in one thread, and keep track of what's done
and what's left. Add people to a project and talk things through in threads next to the work.

Think of it as Notion's editor, GitHub Issues and Slack's threads, trimmed down to what a person needs
to finish a project. It's free and in beta: [dana.so](https://dana.so). You sign in with Google.

**Stack:** one Node app. Vite + React on the front end, an Express API on the back end, Postgres in
production (PGlite locally), deployed on Render. No Docker needed.

**To run it:** from `app/` (there is no `package.json` at the root), run `npm ci`, then
`DANA_DEV_LOGIN=1 npm run dev`. `npm test` runs the tests.

**Working on the code:** read `AGENTS.md` first. It has the commands, how a change gets in, and where
the rest of the docs live.

**Team:** Hassan runs the project, the back end and the infrastructure, built with Claude Code. Imran
does product and design.