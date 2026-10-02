import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// The Solver (in-person game assistant) is a separate app on /solver, loaded only when opened.
const SolverApp = lazy(() => import('./solver/SolverApp.tsx'))
const isSolver = /^\/solver\/?$/.test(location.pathname)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isSolver ? (
      <Suspense fallback={null}>
        <SolverApp />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
