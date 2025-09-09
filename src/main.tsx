import './i18n'; 
import { StrictMode } from 'react'
import './index.css'
import App from './app/App.tsx'
import ReactDom from "react-dom/client"
import { BrowserRouter } from 'react-router-dom'
import { FavoritesProvider } from './components/FavoritesContext.tsx'
import { ThemeProvider } from './components/ThemeContext.tsx'
import { LanguageProvider } from "./components/LanguageContext.tsx";
import { Provider } from "react-redux";
import { store } from "./store";

ReactDom.createRoot(document.getElementById('root')!).render(
  <StrictMode>
     <Provider store={store}>
    <ThemeProvider>
    <FavoritesProvider>
    <LanguageProvider>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
    <App />
    </BrowserRouter>
    </LanguageProvider>
    </FavoritesProvider>
    </ThemeProvider>
    </Provider>
  </StrictMode>,
)


