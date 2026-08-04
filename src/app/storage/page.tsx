import type { Metadata } from "next";
import { cookies } from "next/headers";

import { LocalizedText } from "@/components/localized-text";
import { StorageManagerClient } from "@/components/storage-manager-client";
import { LANGUAGE_COOKIE, normalizeLanguage } from "@/core/i18n";
import { inspectManagedStorage } from "@/core/storage/storage-manager";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> { return { title: normalizeLanguage((await cookies()).get(LANGUAGE_COOKIE)?.value) === "zh" ? "备份与归档" : "Backups & Archives" }; }

export default async function StoragePage() {
  return <main className="storage-page"><header className="page-intro"><span className="eyebrow"><LocalizedText zh="私有存储 / 安全清理" en="PRIVATE STORAGE / SAFE CLEANUP" /></span><h1><LocalizedText zh="备份与归档，" en="Backups and archives. " /><em><LocalizedText zh="每一份都可核对。" en="Every copy accounted for." /></em></h1><p><LocalizedText zh="查看更新备份、停用目录和重复入口归档的空间占用；恢复优先，永久清理始终需要重新审查。" en="Inspect space used by update backups, disabled Skills, and duplicate-entry archives. Restore comes first; permanent cleanup always requires a fresh review." /></p></header><StorageManagerClient initialOverview={await inspectManagedStorage()} /></main>;
}
