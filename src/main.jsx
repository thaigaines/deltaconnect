// Entry point: index.html loads this file to start the React app.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// Render App inside <div id="root">. StrictMode adds development-only checks,
// such as running effects twice to catch missing cleanup.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
