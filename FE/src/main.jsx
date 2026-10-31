import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { installGlobalErrorReporting } from './lib/reportError'

// Prerender services snapshot the page once this turns true (see lib/query.js).
window.prerenderReady = false
installGlobalErrorReporting()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
