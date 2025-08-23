import { Link } from "react-router-dom";
import styles from "./header.module.css";
import { useTheme } from "./ThemeContext";
import { useLanguage } from "./LanguageContext";
import { useTranslation } from "react-i18next";

const Header = () => {
  const { theme, toggleTheme } = useTheme();
  const { language, toggleLanguage } = useLanguage();
  const { t } = useTranslation();

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <div className={styles.logoBlock}>
          <Link to="/" className={styles.logoLink}>
            <h1 className={styles.logo}>InvAPI</h1>
          </Link>
          <h2 className={styles.subtitle}>({t("comingSoon")})</h2>
        </div>

        <nav className={styles.nav}>
          <Link to="/" className={styles.link}>{t("Home")}</Link>
          <Link to="/favorites" className={styles.link}>{t("favorites")}</Link>
          <Link to="/about" className={styles.link}>{t("about")}</Link>
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
