import { StrictMode } from 'react'
import './index.css'
import App from './app/App.tsx'
import ReactDom from "react-dom/client"
import { BrowserRouter } from 'react-router-dom'
import { FavoritesProvider } from './components/FavoritesContext.tsx'
import { ThemeProvider } from './components/ThemeContext.tsx'

ReactDom.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
    <FavoritesProvider>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
    <App />
    </BrowserRouter>
    </FavoritesProvider>
    </ThemeProvider>
  </StrictMode>,
)
