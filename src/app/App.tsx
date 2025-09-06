import React, { Suspense, useEffect } from "react";
import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import Header from "../components/Header";
import { Footer } from "../components/Footer";
import { Main } from "../components/Main";
import { AnimatePresence } from "framer-motion";
import { useTheme } from "../components/ThemeContext";

// Ленивые маршруты
const Home = React.lazy(() =>
  import("../pages/Home").then((m) => ({ default: m.Home }))
);
const Favorites = React.lazy(() => import("../components/Favorites"));
const About = React.lazy(() =>
  import("../components/About").then((m) => ({ default: m.About }))
);
const StockDetails = React.lazy(() =>
  import("../pages/StockDetails").then((m) => ({ default: m.StockDetails }))
);

function App() {
  const { theme } = useTheme();
  const location = useLocation();

  useEffect(() => {
    const p = location.pathname;
    if (p === "/") document.title = "Undervalued Stocks — быстрый список недооценённых акций";
    else if (/^\/\d+$/.test(p)) document.title = `Undervalued Stocks — Page ${p.slice(1)}`;
    else if (p.startsWith("/stocks/")) document.title = "Детали акции — Undervalued Stocks";
    else if (p === "/favorites") document.title = "Избранное — Undervalued Stocks";
    else if (p === "/about") document.title = "О приложении — Undervalued Stocks";
    else document.title = "Undervalued Stocks";
  }, [location.pathname]);

  const themeClass = theme === "light" ? "light-theme" : "dark-theme";

  return (
    <div className={themeClass} style={{ minHeight: "100vh" }}>
      <Header />
      <Main>
        <AnimatePresence mode="wait">
          <Suspense fallback={<div className="p-6">Loading…</div>}>
            <Routes location={location} key={location.pathname}>
              {/* Детали тикера — выше, чтобы не конфликтовало с /:page */}
              <Route path="/stocks/:ticker" element={<StockDetails />} />
              <Route path="/favorites" element={<Favorites />} />
              <Route path="/about" element={<About />} />

              {/* Фиксированные страницы (без регэкспа) */}
              <Route path="/:page" element={<Home />} />

              {/* Редиректы */}
              <Route path="/" element={<Navigate to="/1" replace />} />
              <Route path="*" element={<Navigate to="/1" replace />} />
            </Routes>
          </Suspense>
        </AnimatePresence>
      </Main>
      <Footer />
    </div>
  );
}

export default App;
