"use client";

import { Archive, Boxes, CheckCircle2, LayoutGrid, Library, ListChecks, Menu, Network, Settings, Store, Trash2, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { LanguageToggle, useLanguage } from "./language-provider";

const navigationGroups = [
  {
    zh: "工作区",
    en: "Workspace",
    items: [
      { href: "/", zh: "技能目录", en: "Skill catalog", icon: LayoutGrid },
      { href: "/library", zh: "配方与工作流", en: "Recipes & flows", icon: Library },
      { href: "/graph", zh: "知识图谱", en: "Knowledge graph", icon: Network },
      { href: "/marketplace", zh: "技能市场", en: "Skill marketplace", icon: Store },
    ],
  },
  {
    zh: "管理",
    en: "Manage",
    items: [
      { href: "/operations", zh: "操作中心", en: "Operations", icon: ListChecks },
      { href: "/trash", zh: "回收站", en: "Trash", icon: Trash2 },
      { href: "/storage", zh: "备份与归档", en: "Backups & archives", icon: Archive },
      { href: "/settings", zh: "环境设置", en: "Environment", icon: Settings },
    ],
  },
];

export function AppHeader() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!navigationOpen) return;
    navigationRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setNavigationOpen(false);
      toggleRef.current?.focus();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [navigationOpen]);

  return (
    <aside className="app-sidebar">
      <Link className="brand" href="/" aria-label={t("Skill Atlas 首页", "Skill Atlas home")} onClick={() => setNavigationOpen(false)}>
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

      <button
        ref={toggleRef}
        className="sidebar-menu-toggle"
        type="button"
        aria-expanded={navigationOpen}
        aria-controls="primary-navigation"
        aria-label={navigationOpen ? t("关闭导航", "Close navigation") : t("打开导航", "Open navigation")}
        onClick={() => setNavigationOpen((current) => !current)}
      >
        {navigationOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
        <span>{t("菜单", "Menu")}</span>
      </button>

      <div id="primary-navigation" ref={navigationRef} className="sidebar-nav-groups" data-open={navigationOpen}>
        {navigationGroups.map((group) => (
          <section className="sidebar-nav-group" key={group.en} aria-labelledby={`sidebar-${group.en.toLocaleLowerCase()}`}>
            <div className="sidebar-section-label" id={`sidebar-${group.en.toLocaleLowerCase()}`}>{t(group.zh, group.en)}</div>
            <nav className="main-nav" aria-label={t(group.zh, group.en)}>
              {group.items.map(({ href, zh, en, icon: Icon }) => {
                const active = href === "/"
                  ? pathname === "/" || pathname.startsWith("/skills")
                  : pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link key={href} href={href} data-active={active} aria-current={active ? "page" : undefined} aria-label={t(zh, en)} onClick={() => setNavigationOpen(false)}>
                    <Icon size={18} aria-hidden="true" />
                    <span>{t(zh, en)}</span>
                  </Link>
                );
              })}
            </nav>
          </section>
        ))}
      </div>

      <LanguageToggle />

      <div className="sidebar-status">
        <span><CheckCircle2 size={16} aria-hidden="true" /> {t("本地模式已就绪", "Local mode ready")}</span>
        <p>{t("技能内容不被改写，安装和移除始终经过审查。", "Skill contents are not rewritten, and installation and removal are always reviewed.")}</p>
        <code><Boxes size={14} aria-hidden="true" /> {t("WINDOWS / 本地", "WINDOWS / LOCAL")}</code>
      </div>
    </aside>
  );
}
