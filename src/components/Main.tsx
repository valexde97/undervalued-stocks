import { ReactNode } from "react";
import { useTranslation } from "react-i18next";

type Props = {
  children: ReactNode;
};

export const Main = ({ children }: Props) => {
  const { t } = useTranslation();

  return (
    <div style={{ textAlign: "center", marginBottom: "2rem" }}>
      <h2>{t("main.title")}</h2>
      <p>{t("main.subtitle")}</p>
      {children}
    </div>
  );
};
