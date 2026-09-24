# Dana

Dana is a collaborative to-do web app, installable as a PWA. You sign in with Google. Once inside, it works like any normal to-do app (think Microsoft To Do): create tasks, create folders, put tasks in folders, complete them, and most importantly share them and assign people to it so you can collaborate with other people.

Inside the app you have a few pages and the option to create folders, you can group folders too. You'll normally see default pages such as Desk, Today and Scheduled, and you can pin or unpin others, like Done, in settings.

**Stack:** The rest of the app is: Vite + React on the front end, Express API on the back end, both in one Node app. Postgres for the database (PGlite locally), deployed on Render as a single always-on instance. Also no Docker is needed.

**To run the app:** from `app/` (there is no `package.json` at the repository root), run `npm ci` to install dependencies, `npm test` for unit + acceptance tests, and `DANA_DEV_LOGIN=1 npm run dev` to run the API and the client with the development login.

**Working on the code:** read `AGENTS.md` first. It has the commands, how a change gets in, and where the rest of the documentation lives.

**Vision:** The long-term idea is to add AI and when you give it a goal, and it turns that into concrete to-do items. Beyond that we're still figuring things out to be honest, we just wanted to ship a usable thing, so a to-do app just felt like the most classic way to start.

**Team:** Hassan runs the project and handles the back end and infrastructure, built with Claude Code. Imran does UI and design.

*Written with love by Hassan.*
