import { Link } from "react-router-dom";
import styles from "./Header.module.css";

type HeaderProps = {
  title: string;
};

export const Header = ({ title }: HeaderProps) => (
  <header className={styles.header}>
    <h1>{title}</h1>
    <h2>(Coming soon...)</h2>
    <nav className={styles.nav}>
      <Link to="/" className={styles.link}>Home</Link>
      <Link to="/favorites" className={styles.link}>Favorites</Link>
      <Link to="/about" className={styles.link}>About</Link>
    </nav>
  </header>
);
