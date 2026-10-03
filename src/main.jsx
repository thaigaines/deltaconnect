// Entry point: index.html loads this file, and it starts the React app.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// Find <div id="root"> in index.html and render the App component inside it.
// StrictMode adds development-only checks; for example, it runs effects twice
// to catch missing cleanup. It has no effect in the production build.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
