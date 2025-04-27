import { Link } from "react-router-dom";
import styles from "./Header.module.css";

interface HeaderProps {
  theme: "light" | "dark";
  toggleTheme: () => void;
}

function Header({ theme, toggleTheme }: HeaderProps) {
  return (
    <header
      className={`${theme === "light" ? "bg-white" : "bg-gray-900"} shadow-md`}
      style={{ padding: "1rem" }}
    >
      <div className="container mx-auto flex justify-between items-center">
        {/* Левый блок: название */}
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-blue-600">InvAPI</h1>
          <h2 className="text-sm text-gray-500">(Coming soon...)</h2>
        </div>

        {/* Центральная навигация */}
        <nav className="flex gap-6 text-lg">
          <Link to="/" className={styles.link}>
            Home
          </Link>
          <Link to="/favorites" className={styles.link}>
            Favorites
          </Link>
          <Link to="/about" className={styles.link}>
            About
          </Link>
        </nav>

        {/* Правая часть: переключение темы */}
        <button
          onClick={toggleTheme}
          className="ml-4 px-4 py-2 rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors"
        >
          {theme === "light" ? "🌙 Dark Mode" : "☀️ Light Mode"}
        </button>
      </div>
    </header>
  );
}

export default Header;
