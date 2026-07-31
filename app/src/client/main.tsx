import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Placeholder entry so the toolchain builds end to end from P0 on. The real
// client shell arrives with P8 and belongs to the Frontend Architect.
function App() {
  return <p>Dana</p>
}

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('index.html no longer carries the root element')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
