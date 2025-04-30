import { createContext, useContext, useEffect,  useState, ReactNode } from "react";
import i18n from '../i18n'; 

type Language = "en" | "de";

type LanguageContextType = {
  language: Language;
  toggleLanguage: () => void;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguage] = useState<Language>(i18n.language as Language);
  
  useEffect(() => {
    i18n.changeLanguage(language);
  }, [language]);
 
  const toggleLanguage = () => {
    const newLang = language === "en" ? "de" : "en";
    setLanguage(newLang);
  };
  
  return (
    <LanguageContext.Provider value={{ language, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};