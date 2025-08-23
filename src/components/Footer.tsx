import styles from "./footer.module.css";

export const Footer = () => (
  <footer className={styles.footer}>
    <p>&copy; {new Date().getFullYear()} Valex Finance</p>
  </footer>
);
