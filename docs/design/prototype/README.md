# Dana desktop UI handoff

This repository is the approved desktop design prototype and implementation
reference for Dana v1. It contains fake data only and does not contain backend or
production application code.

## Run the prototype

```bash
cd prototype
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`. Vite may choose the next available port when that
port is already in use.

## Start here

1. `docs/design/notes.md` — implementation handoff, behavior and QA notes.
2. `docs/design/design-contract.md` — approved decisions and unresolved items.
3. `docs/design/screen-registry.csv` — required surfaces, states and status.
4. `docs/design/screens/` — approved 1440px reference exports.
5. `prototype/src/styles/tokens.css` — authoritative visual tokens.

The numbered product specification remains authoritative for product behavior.
Where a UI decision deliberately clarifies or amends presentation, the relevant
`DES-*` record names it explicitly.
