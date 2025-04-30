import { Routes, Route, useLocation } from "react-router-dom";
import Header from "../components/Header";
import { Footer } from "../components/Footer";
import { Main } from "../components/Main";
import { Home } from "../pages/Home";
import Favorites from "../components/Favorites";
import { About } from "../components/About";
import { StockDetails } from "../pages/StockDetails";
import { AnimatePresence } from "framer-motion";
import { useTheme } from "../components/ThemeContext"; // <-- вот это обязательно!
import "./App.css";

function App() {
  const { theme } = useTheme(); // <-- здесь мы получаем из контекста

  const location = useLocation();

  return (
    <>
      <div className={theme === 'light' ? 'bg-white text-black' : 'bg-gray-900 text-white'} style={{ minHeight: '100vh' }}>
        <Header />
        <main className="p-4">
          <Main>
            <AnimatePresence mode="wait">
              <Routes location={location} key={location.pathname}>
                <Route path="/" element={<Home />} />
                <Route path="/favorites" element={<Favorites />} />
                <Route path="/about" element={<About />} />
                <Route path="/stocks/:ticker" element={<StockDetails />} />
              </Routes>
            </AnimatePresence>
          </Main>
        </main>
      </div>
      <Footer />
    </>
  );
}

export default App;
