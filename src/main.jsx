// Mounts the app and loads its styles; StrictMode checks effect cleanup in development.
// React DOM's createRoot connects React's JSX tree to the root HTML element.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
