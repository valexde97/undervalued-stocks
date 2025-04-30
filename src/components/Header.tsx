import { Link } from "react-router-dom";
import styles from "./Header.module.css";
import { useTheme } from "./ThemeContext";
import { useLanguage } from "./LanguageContext";

const Header = () => {
  const { theme, toggleTheme } = useTheme();
  const { language, toggleLanguage } = useLanguage();

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <div className={styles.logoBlock}>
          <h1 className={styles.logo}>InvAPI</h1>
          <h2 className={styles.subtitle}>(Coming soon...)</h2>
        </div>
        
        <nav className={styles.nav}>
          <Link to="/" className={styles.link}>Home</Link>
          <Link to="/favorites" className={styles.link}>Favorites</Link>
          <Link to="/about" className={styles.link}>About</Link>
        </nav>

        <div className={styles.actions}>
          <button onClick={toggleTheme} className={styles.button}>
            {theme === "light" ? "🌙" : "☀️"}
          </button>
          <button onClick={toggleLanguage} className={styles.button}>
            {language === "en" ? "🇩🇪 DE" : "🇬🇧 EN"}
          </button>
        </div>
      </div>
    </header>
  );
};
export default Header;
