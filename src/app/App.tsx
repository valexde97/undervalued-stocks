import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { Main } from '../components/Main';
import { Home } from "../pages/Home"
import './App.css'
function App() {
  return (
    <>
    <Header title='Undervalued Stocks Finder'/>
    <Main>
      <Home/>
      </Main>
      <Footer/>
    </>
  )
}

export default App
