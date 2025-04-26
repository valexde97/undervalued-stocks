import { Routes, Route } from "react-router-dom";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { Main } from "../components/Main";
import { Home } from "../pages/Home";
import { Favorites } from "../components/Favorites";
import { About } from "../components/About";
import { StockDetails } from "../pages/StockDetails";
import { AnimatePresence } from "framer-motion";
import { useLocation } from "react-router-dom";
import "./App.css";
function App() {
  const location = useLocation();
  return (
    <>
      <Header title="InvAPI" />
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
      <Footer />
    </>
  );
}

export default App;
