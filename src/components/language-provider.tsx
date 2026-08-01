"use client";

import { Languages } from "lucide-react";
import { createContext, useContext, useMemo, useState } from "react";

import { LANGUAGE_COOKIE, type Language, pick } from "@/core/i18n";

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: <T>(zh: T, en: T) => T;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function applyLanguage(language: Language) {
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.documentElement.dataset.language = language;
  document.cookie = `${LANGUAGE_COOKIE}=${language}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function LanguageProvider({
  initialLanguage,
  children,
}: {
  initialLanguage: Language;
  children: React.ReactNode;
}) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage(nextLanguage) {
      setLanguageState(nextLanguage);
      applyLanguage(nextLanguage);
    },
    t: (zh, en) => pick(language, zh, en),
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}

export function LanguageToggle() {
  const { language, setLanguage, t } = useLanguage();
  const nextLanguage = language === "zh" ? "en" : "zh";

  return (
    <div className="language-control">
      <span><Languages size={15} aria-hidden="true" /> {t("界面语言", "Interface language")}</span>
      <button
        type="button"
        className="language-toggle"
        data-language={language}
        aria-label={t("切换到英文", "Switch to Chinese")}
        onClick={() => setLanguage(nextLanguage)}
      >
        <span data-active={language === "zh"}>中文</span>
        <span data-active={language === "en"}>EN</span>
      </button>
    </div>
  );
}
