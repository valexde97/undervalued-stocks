import React, { Suspense, useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import Header from "../components/Header";
import { Footer } from "../components/Footer";
import { Main } from "../components/Main";
import { AnimatePresence } from "framer-motion";
import { useTheme } from "../components/ThemeContext";

// Ленивые маршруты
const Home = React.lazy(() =>
  import("../pages/Home").then((m) => ({ default: m.Home }))
);
const Favorites = React.lazy(() => import("../components/Favorites")); // default export
const About = React.lazy(() =>
  import("../components/About").then((m) => ({ default: m.About }))
);
const StockDetails = React.lazy(() =>
  import("../pages/StockDetails").then((m) => ({ default: m.StockDetails }))
);

function App() {
  const { theme } = useTheme();
  const location = useLocation();

  // Простая смена заголовка документа по маршруту (без Helmet)
  useEffect(() => {
    const p = location.pathname;
    if (p === "/") document.title = "Undervalued Stocks — быстрый список недооценённых акций";
    else if (p.startsWith("/stocks/")) document.title = "Детали акции — Undervalued Stocks";
    else if (p === "/favorites") document.title = "Избранное — Undervalued Stocks";
    else if (p === "/about") document.title = "О приложении — Undervalued Stocks";
    else document.title = "Undervalued Stocks";
  }, [location.pathname]);

  return (
    <>
      <div
        className={theme === "light" ? "bg-white text-black" : "bg-gray-900 text-white"}
        style={{ minHeight: "100vh" }}
      >
        <Header />
        <Main>
          <AnimatePresence mode="wait">
            <Suspense fallback={<div className="p-6">Loading…</div>}>
              <Routes location={location} key={location.pathname}>
                <Route path="/" element={<Home />} />
                <Route path="/favorites" element={<Favorites />} />
                <Route path="/about" element={<About />} />
                <Route path="/stocks/:ticker" element={<StockDetails />} />
              </Routes>
            </Suspense>
          </AnimatePresence>
        </Main>
        <Footer />
      </div>
    </>
  );
}

export default App;
