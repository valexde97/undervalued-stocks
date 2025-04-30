import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import styles from "./about.module.css";

export const About = () => {
  const { t } = useTranslation();

  return (
    <motion.div
      className={styles.aboutWrapper}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className={styles.container}>
        <h2 className={styles.title}>{t("aboutTitle")}</h2>
        <p className={styles.lead}>{t("aboutIntro")}</p>

        <section className={styles.section}>
          <h3>{t("aboutMissionTitle")}</h3>
          <p>{t("aboutMissionText")}</p>
        </section>

        <section className={styles.section}>
          <h3>{t("aboutHowTitle")}</h3>
          <p>{t("aboutHowText")}</p>
        </section>

        <section className={styles.section}>
          <h3>{t("aboutTeamTitle")}</h3>
          <p>{t("aboutTeamText")}</p>
        </section>
      </div>
    </motion.div>
  );
};
