import "@fontsource-variable/inter"
import React from "react"
import ReactDOM from "react-dom/client"

import { App } from "@/App"
import { TooltipProvider } from "@/components/ui/tooltip"
import { RowDensityProvider } from "@/lib/density"
import "./styles/app.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TooltipProvider>
      <RowDensityProvider>
        <App />
      </RowDensityProvider>
    </TooltipProvider>
  </React.StrictMode>,
)
