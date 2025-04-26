import { Link } from "react-router-dom";

type HeaderProps = {
  title: string;
};

export const Header = ({title}:HeaderProps) => (
  <header style={{ padding: '1rem', backgroundColor: '#333', color: '#fff' }}>
    <h1>{title}</h1>
    <h2> (Coming soon...)</h2>
    <nav>
      <Link to="/" style={{ color: '#fff', marginRight: '1rem' }}>Home</Link>
      <Link to="/favorites" style={{ color: '#fff', marginRight: '1rem' }}>Favorites</Link>
      <Link to="/about" style={{ color: '#fff' }}>About</Link>
    </nav>
  </header>
);