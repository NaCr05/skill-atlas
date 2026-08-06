"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import type { CatalogPage } from "@/core/skills/pagination";

import { useLanguage } from "./language-provider";

export function CatalogPagination<T>({ page, onPageChange }: { page: CatalogPage<T>; onPageChange: (page: number) => void }) {
  const { t } = useLanguage();
  if (page.total <= page.pageSize) return null;

  return (
    <nav className="catalog-pagination" aria-label={t("Skill 列表分页", "Skill list pagination")}>
      <span>{t(`显示 ${page.start}–${page.end}，共 ${page.total} 个`, `Showing ${page.start}–${page.end} of ${page.total}`)}</span>
      <div>
        <button type="button" disabled={page.page === 1} onClick={() => onPageChange(page.page - 1)}>
          <ChevronLeft size={15} aria-hidden="true" /> {t("上一页", "Previous")}
        </button>
        <output>{page.page} / {page.pageCount}</output>
        <button type="button" disabled={page.page === page.pageCount} onClick={() => onPageChange(page.page + 1)}>
          {t("下一页", "Next")} <ChevronRight size={15} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
