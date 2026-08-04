import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LocalizedText } from "@/components/localized-text";
import { OperationsCenterClient } from "@/components/operations-center-client";
import { LANGUAGE_COOKIE, normalizeLanguage } from "@/core/i18n";
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> { const language = normalizeLanguage((await cookies()).get(LANGUAGE_COOKIE)?.value); return { title: language === "zh" ? "操作中心" : "Operations Center" }; }
export default function OperationsPage() { return <main className="operations-page"><header className="page-intro"><span className="eyebrow"><LocalizedText zh="批量规划 / 可恢复执行" en="BATCH PLANNING / RECOVERABLE EXECUTION" /></span><h1><LocalizedText zh="操作中心，" en="Operations Center. " /><em><LocalizedText zh="先审查，再执行。" en="Review before action." /></em></h1><p><LocalizedText zh="集中处理重复入口、缺失依赖、批量上游检查和所有写操作的结果与恢复入口。" en="Handle duplicate entries, missing dependencies, batch upstream checks, and every write operation with its result and recovery entry in one place." /></p></header><OperationsCenterClient /></main>; }
