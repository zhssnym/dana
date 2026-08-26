import "@fontsource-variable/inter"
import React from "react"
import ReactDOM from "react-dom/client"

import { App } from "@/App"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./styles/app.css"
import { applyStoredTheme } from "@/lib/theme"

/* Before the first paint, or the page renders light and then turns dark —
   the white flash every product that stores a theme solves exactly once. */
applyStoredTheme()

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </React.StrictMode>,
)
