import type { Metadata } from "next";
import { cookies } from "next/headers";

import { AppHeader } from "@/components/app-header";
import { LanguageProvider } from "@/components/language-provider";
import { LocalizedText } from "@/components/localized-text";
import { LANGUAGE_COOKIE, normalizeLanguage } from "@/core/i18n";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const language = normalizeLanguage((await cookies()).get(LANGUAGE_COOKIE)?.value);
  return language === "zh" ? {
    title: { default: "Skill Atlas · Codex 技能控制台", template: "%s · Skill Atlas" },
    description: "Windows 本地优先的 Codex 技能管理控制台。",
  } : {
    title: { default: "Skill Atlas · Codex Skill Console", template: "%s · Skill Atlas" },
    description: "A bilingual, local-first Codex Skill console for Windows.",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const language = normalizeLanguage((await cookies()).get(LANGUAGE_COOKIE)?.value);

  return (
    <html
      lang={language === "zh" ? "zh-CN" : "en"}
      data-language={language}
      data-scroll-behavior="smooth"
    >
      <body>
        <LanguageProvider initialLanguage={language}>
          <a className="skip-link" href="#main-content">
            <LocalizedText zh="跳到主要内容" en="Skip to main content" />
          </a>
          <div className="app-shell">
            <AppHeader />
            <div className="app-stage">
              <div id="main-content" tabIndex={-1}>{children}</div>
              <footer className="app-footer">
                <span><LocalizedText zh="SKILL ATLAS / 本地优先" en="SKILL ATLAS / LOCAL-FIRST" /></span>
                <p>
                  <LocalizedText
                    zh="文件系统是真相来源。AI 只做可选增强，不改写原始技能。"
                    en="The filesystem is the source of truth. AI is an optional enhancement and never rewrites the original Skill."
                  />
                </p>
              </footer>
            </div>
          </div>
        </LanguageProvider>
      </body>
    </html>
  );
}
