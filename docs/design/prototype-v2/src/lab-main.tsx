/*
The share build's entry point.

`main.tsx` boots the whole prototype and picks a screen from `?view=`. That
works on a dev server and does not survive being published as a single file,
where there is no query string to read. This entry renders the row lab and
nothing else, so the shared page opens on the thing it is for.

It is a second entry rather than a change to `App.tsx` because the prototype's
routing is not the row lab's business, and a shared page that could show any
screen depending on a URL is a shared page that will one day open on the wrong
one.
*/

import "@fontsource-variable/inter"
import React from "react"
import ReactDOM from "react-dom/client"

import { TooltipProvider } from "@/components/ui/tooltip"
import { RowDensityProvider } from "@/lib/density"
import { RowLabPage } from "@/screens/row-lab"
import "./styles/app.css"
/* After app.css, because it lifts that file's desktop-only width floor. */
import "./styles/lab.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TooltipProvider>
      <RowDensityProvider>
        <RowLabPage />
      </RowDensityProvider>
    </TooltipProvider>
  </React.StrictMode>,
)
