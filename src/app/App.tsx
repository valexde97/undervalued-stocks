import { Routes, Route } from "react-router-dom";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { Main } from "../components/Main";
import { Home } from "../pages/Home";
import { Favorites } from "../components/Favorites";
import { About } from "../components/About";
import "./App.css";
function App() {
  return (
    <>
      <Header title="InApp" />
      <Main>
        <Routes>
          <Route path="/" element={<Home/>}/>
          <Route path="/favorites" element={<Favorites/>}/>
          <Route path="/about" element={<About/>}/>
        </Routes>
      </Main>
      <Footer />
    </>
  );
}

export default App;
