"use client";

import { Archive, Boxes, CheckCircle2, LayoutGrid, ListChecks, Network, Settings, Store, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { LanguageToggle, useLanguage } from "./language-provider";

const navigation = [
  { href: "/", zh: "知识图谱", en: "Knowledge graph", icon: Network },
  { href: "/skills", zh: "本地技能", en: "Local Skills", icon: LayoutGrid },
  { href: "/marketplace", zh: "技能市场", en: "Skill marketplace", icon: Store },
  { href: "/operations", zh: "操作中心", en: "Operations", icon: ListChecks },
  { href: "/trash", zh: "回收站", en: "Trash", icon: Trash2 },
  { href: "/storage", zh: "备份与归档", en: "Backups & archives", icon: Archive },
  { href: "/settings", zh: "环境设置", en: "Environment", icon: Settings },
];

export function AppHeader() {
  const pathname = usePathname();
  const { t } = useLanguage();

  return (
    <aside className="app-sidebar">
      <Link className="brand" href="/" aria-label={t("Skill Atlas 首页", "Skill Atlas home")}>
        <span className="brand-mark" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span>
          <strong>SKILL ATLAS</strong>
          <small>{t("Codex 能力控制台", "Codex capability console")}</small>
        </span>
      </Link>

      <div className="sidebar-section-label">{t("工作区", "Workspace")}</div>
      <nav className="main-nav" aria-label={t("主导航", "Primary navigation")}>
        {navigation.map(({ href, zh, en, icon: Icon }) => {
          const active = href === "/"
            ? pathname === "/" || pathname.startsWith("/graph")
            : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} data-active={active} aria-current={active ? "page" : undefined} aria-label={t(zh, en)}>
              <Icon size={18} aria-hidden="true" />
              <span>{t(zh, en)}</span>
            </Link>
          );
        })}
      </nav>

      <LanguageToggle />

      <div className="sidebar-status">
        <span><CheckCircle2 size={16} aria-hidden="true" /> {t("本地模式已就绪", "Local mode ready")}</span>
        <p>{t("技能内容不被改写，安装和移除始终经过审查。", "Skill contents are not rewritten, and installation and removal are always reviewed.")}</p>
        <code><Boxes size={14} aria-hidden="true" /> {t("WINDOWS / 本地", "WINDOWS / LOCAL")}</code>
      </div>
    </aside>
  );
}
