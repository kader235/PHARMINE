import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import './styles/base.css'
import './styles/comptoir.css'
import './styles/impression.css'

createRoot(document.getElementById('racine')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
