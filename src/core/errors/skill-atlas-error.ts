import { ZodError } from "zod";

import type { Language } from "@/core/i18n";

export type SkillAtlasErrorCode =
  | "REQUEST_INVALID"
  | "LOCAL_REQUEST_REJECTED"
  | "SKILL_NOT_FOUND"
  | "INSTALL_INSPECTION_FAILED"
  | "INSTALL_SOURCE_INVALID"
  | "INSTALL_PLAN_MISSING"
  | "INSTALL_PLAN_EXPIRED"
  | "INSTALL_BLOCKED"
  | "INSTALL_STATE_CHANGED"
  | "INSTALL_FAILED"
  | "UPDATE_INSPECTION_FAILED"
  | "UPDATE_SKILL_NOT_FOUND"
  | "UPDATE_READ_ONLY"
  | "UPDATE_SOURCE_REQUIRED"
  | "UPDATE_PLAN_MISSING"
  | "UPDATE_PLAN_EXPIRED"
  | "UPDATE_BLOCKED"
  | "UPDATE_STATE_CHANGED"
  | "UPDATE_TRACKING_FAILED"
  | "UPDATE_APPLY_FAILED"
  | "DISABLE_INSPECTION_FAILED"
  | "DISABLE_PLAN_MISSING"
  | "DISABLE_PLAN_EXPIRED"
  | "DISABLE_BLOCKED"
  | "DISABLE_FAILED"
  | "ENABLE_FAILED"
  | "RECOVERY_ACTION_FAILED"
  | "OPERATION_READ_FAILED"
  | "BATCH_UPDATE_FAILED"
  | "DUPLICATE_MIGRATION_INSPECTION_FAILED"
  | "DUPLICATE_MIGRATION_PLAN_MISSING"
  | "DUPLICATE_MIGRATION_PLAN_EXPIRED"
  | "DUPLICATE_MIGRATION_BLOCKED"
  | "DUPLICATE_MIGRATION_FAILED"
  | "MIGRATION_ARCHIVE_READ_FAILED"
  | "MIGRATION_ARCHIVE_RESTORE_FAILED"
  | "MIGRATION_ARCHIVE_PURGE_INSPECTION_FAILED"
  | "MIGRATION_ARCHIVE_PURGE_PLAN_MISSING"
  | "MIGRATION_ARCHIVE_PURGE_PLAN_EXPIRED"
  | "MIGRATION_ARCHIVE_PURGE_CONFIRMATION_MISMATCH"
  | "MIGRATION_ARCHIVE_PURGE_FAILED"
  | "REMOVAL_INSPECTION_FAILED"
  | "REMOVAL_PLAN_MISSING"
  | "REMOVAL_PLAN_EXPIRED"
  | "REMOVAL_BLOCKED"
  | "REMOVAL_FAILED"
  | "PURGE_INSPECTION_FAILED"
  | "PURGE_PLAN_MISSING"
  | "PURGE_PLAN_EXPIRED"
  | "PURGE_CONFIRMATION_MISMATCH"
  | "PURGE_FAILED"
  | "RESTORE_FAILED"
  | "TRASH_READ_FAILED"
  | "STORAGE_READ_FAILED"
  | "STORAGE_ENTRY_INVALID"
  | "STORAGE_PLAN_INVALID"
  | "STORAGE_CONFIRMATION_MISMATCH"
  | "STORAGE_STATE_CHANGED"
  | "STORAGE_CLEANUP_FAILED"
  | "SOURCE_POLICY_FAILED"
  | "DATA_EXPORT_FAILED"
  | "DATA_IMPORT_FAILED"
  | "AI_SETTINGS_UNAVAILABLE"
  | "AI_SETTINGS_INVALID"
  | "AI_SETTINGS_ENCRYPTION_FAILED"
  | "AI_SETTINGS_WRITE_FAILED"
  | "AI_SETTINGS_SAVE_FAILED"
  | "AI_SETTINGS_CLEAR_FAILED"
  | "RESCAN_FAILED"
  | "PROMPT_FAILED";

const messages: Record<SkillAtlasErrorCode, Record<Language, string>> = {
  REQUEST_INVALID: { zh: "请求内容无效，请检查输入后重试。", en: "The request is invalid. Check the input and try again." },
  LOCAL_REQUEST_REJECTED: { zh: "仅接受由本机 Skill Atlas 发起的请求。", en: "Only requests from the local Skill Atlas instance are accepted." },
  SKILL_NOT_FOUND: { zh: "未找到该技能，请重新扫描。", en: "The Skill was not found. Rescan and try again." },
  INSTALL_INSPECTION_FAILED: { zh: "无法安全审查这个安装源。", en: "The installation source could not be reviewed safely." },
  INSTALL_SOURCE_INVALID: { zh: "安装源或技能名称无效。", en: "The installation source or Skill name is invalid." },
  INSTALL_PLAN_MISSING: { zh: "安装审查单不存在或已被使用，请重新审查。", en: "The installation review is missing or has already been used. Review the source again." },
  INSTALL_PLAN_EXPIRED: { zh: "安装审查已过期，请重新检查源文件。", en: "The installation review expired. Review the source files again." },
  INSTALL_BLOCKED: { zh: "安装审查包含阻断风险，不能继续安装。", en: "The installation review contains a blocking risk and cannot continue." },
  INSTALL_STATE_CHANGED: { zh: "安装目标或源文件在审查后发生变化，操作已停止。", en: "The install target or source files changed after review, so the operation was stopped." },
  INSTALL_FAILED: { zh: "技能安装失败，未写入不完整结果。", en: "Skill installation failed. No incomplete result was installed." },
  UPDATE_INSPECTION_FAILED: { zh: "无法检查上游更新。", en: "The upstream update could not be inspected." },
  UPDATE_SKILL_NOT_FOUND: { zh: "未找到要检查的本地技能。", en: "The local Skill to inspect was not found." },
  UPDATE_READ_ONLY: { zh: "只有个人技能可以建立上游追踪。", en: "Only personal Skills can be linked to an upstream source." },
  UPDATE_SOURCE_REQUIRED: { zh: "此技能尚未记录来源，请提供精确的 GitHub 技能目录地址。", en: "This Skill has no recorded source. Provide an exact GitHub Skill directory URL." },
  UPDATE_PLAN_MISSING: { zh: "更新预览不存在或已被使用，请重新检查。", en: "The update preview is missing or has already been used. Inspect again." },
  UPDATE_PLAN_EXPIRED: { zh: "更新预览已过期，请重新检查上游。", en: "The update preview expired. Inspect the upstream source again." },
  UPDATE_BLOCKED: { zh: "此预览不能用于建立来源关联。", en: "This preview cannot be used to link an upstream source." },
  UPDATE_STATE_CHANGED: { zh: "本地技能在预览后发生变化，操作已停止。", en: "The local Skill changed after preview, so the operation was stopped." },
  UPDATE_TRACKING_FAILED: { zh: "无法记录技能来源。", en: "The Skill source could not be recorded." },
  UPDATE_APPLY_FAILED: { zh: "技能更新失败；如果原目录已移动，系统已尝试自动回滚。", en: "The Skill update failed. If the original directory had moved, an automatic rollback was attempted." },
  DISABLE_INSPECTION_FAILED: { zh: "无法生成技能停用审查单。", en: "The Skill disable review could not be created." },
  DISABLE_PLAN_MISSING: { zh: "停用审查单不存在或已被使用，请重新审查。", en: "The disable review is missing or has already been used. Review again." },
  DISABLE_PLAN_EXPIRED: { zh: "停用审查已过期，请重新检查技能。", en: "The disable review expired. Inspect the Skill again." },
  DISABLE_BLOCKED: { zh: "停用审查包含阻断风险。", en: "The disable review contains a blocking risk." },
  DISABLE_FAILED: { zh: "技能停用失败，系统已尝试保持原状态。", en: "Disabling the Skill failed. The system attempted to preserve the original state." },
  ENABLE_FAILED: { zh: "技能重新启用失败，系统已尝试保持停用状态。", en: "Re-enabling the Skill failed. The system attempted to preserve the disabled state." },
  RECOVERY_ACTION_FAILED: { zh: "恢复动作未能安全完成；系统没有继续执行不确定的文件操作。", en: "The recovery action could not be completed safely. No uncertain file operation was continued." },
  OPERATION_READ_FAILED: { zh: "无法读取操作记录。", en: "Operation records could not be read." },
  BATCH_UPDATE_FAILED: { zh: "批量上游检查未能完成。", en: "The batch upstream check could not be completed." },
  DUPLICATE_MIGRATION_INSPECTION_FAILED: { zh: "无法生成重复入口迁移审查单。", en: "The duplicate-entry migration review could not be created." },
  DUPLICATE_MIGRATION_PLAN_MISSING: { zh: "迁移审查单不存在或已被使用，请重新审查。", en: "The migration review is missing or has already been used. Review again." },
  DUPLICATE_MIGRATION_PLAN_EXPIRED: { zh: "迁移审查已过期，请重新检查。", en: "The migration review expired. Inspect again." },
  DUPLICATE_MIGRATION_BLOCKED: { zh: "该重复入口不满足安全迁移条件。", en: "The duplicate entry does not meet safe migration requirements." },
  DUPLICATE_MIGRATION_FAILED: { zh: "重复入口迁移失败，系统已尝试恢复原位置。", en: "Duplicate-entry migration failed. The system attempted to restore the original location." },
  MIGRATION_ARCHIVE_READ_FAILED: { zh: "无法读取重复入口迁移归档。", en: "Duplicate-entry migration archives could not be read." },
  MIGRATION_ARCHIVE_RESTORE_FAILED: { zh: "迁移归档恢复失败，系统已尝试保留归档副本。", en: "Restoring the migration archive failed. The system attempted to retain the archived copy." },
  MIGRATION_ARCHIVE_PURGE_INSPECTION_FAILED: { zh: "无法生成迁移归档永久清理审查单。", en: "The migration-archive purge review could not be created." },
  MIGRATION_ARCHIVE_PURGE_PLAN_MISSING: { zh: "迁移归档清理审查单不存在或已被使用，请重新审查。", en: "The migration-archive purge review is missing or already used. Review again." },
  MIGRATION_ARCHIVE_PURGE_PLAN_EXPIRED: { zh: "迁移归档清理审查已过期，请重新检查。", en: "The migration-archive purge review expired. Inspect again." },
  MIGRATION_ARCHIVE_PURGE_CONFIRMATION_MISMATCH: { zh: "输入的 Skill 名称不匹配，未执行永久清理。", en: "The Skill name does not match. Permanent cleanup was not performed." },
  MIGRATION_ARCHIVE_PURGE_FAILED: { zh: "迁移归档永久清理失败，系统已保留恢复线索。", en: "Permanent migration-archive cleanup failed. Recovery evidence was retained." },
  REMOVAL_INSPECTION_FAILED: { zh: "无法生成技能删除审查单。", en: "The Skill removal review could not be created." },
  REMOVAL_PLAN_MISSING: { zh: "删除审查单不存在或已被使用，请重新审查。", en: "The removal review is missing or has already been used. Review again." },
  REMOVAL_PLAN_EXPIRED: { zh: "删除审查已过期，请重新检查技能。", en: "The removal review expired. Inspect the Skill again." },
  REMOVAL_BLOCKED: { zh: "删除审查包含阻断风险。", en: "The removal review contains a blocking risk." },
  REMOVAL_FAILED: { zh: "技能移入回收站失败，系统已尝试保持原状态。", en: "Moving the Skill to trash failed. The system attempted to preserve the original state." },
  PURGE_INSPECTION_FAILED: { zh: "无法生成永久删除审查单。", en: "The permanent deletion review could not be created." },
  PURGE_PLAN_MISSING: { zh: "永久删除审查单不存在或已被使用，请重新审查。", en: "The permanent deletion review is missing or has already been used. Review again." },
  PURGE_PLAN_EXPIRED: { zh: "永久删除审查已过期，请重新检查回收站记录。", en: "The permanent deletion review expired. Inspect the trash record again." },
  PURGE_CONFIRMATION_MISMATCH: { zh: "输入的技能名称不匹配，未执行永久删除。", en: "The Skill name does not match. Permanent deletion was not performed." },
  PURGE_FAILED: { zh: "技能永久删除事务失败，系统已保留恢复线索。", en: "Permanent deletion failed. Recovery evidence has been retained." },
  RESTORE_FAILED: { zh: "技能恢复事务失败。", en: "The Skill restore operation failed." },
  TRASH_READ_FAILED: { zh: "无法读取技能回收站。", en: "The Skill trash could not be read." },
  STORAGE_READ_FAILED: { zh: "无法读取备份与归档存储。", en: "Backup and archive storage could not be read." },
  STORAGE_ENTRY_INVALID: { zh: "该存储项不存在、已损坏或仍被未完成事务占用。", en: "The storage entry is missing, damaged, or still required by an unfinished transaction." },
  STORAGE_PLAN_INVALID: { zh: "清理审查单不存在、已使用或已过期。", en: "The cleanup review is missing, already used, or expired." },
  STORAGE_CONFIRMATION_MISMATCH: { zh: "输入的 Skill 名称不匹配，未执行清理。", en: "The Skill name does not match. Cleanup was not performed." },
  STORAGE_STATE_CHANGED: { zh: "存储项在审查后发生变化，清理已停止。", en: "The storage entry changed after review, so cleanup was stopped." },
  STORAGE_CLEANUP_FAILED: { zh: "存储清理失败；系统已尝试恢复隔离内容。", en: "Storage cleanup failed. The system attempted to restore quarantined content." },
  SOURCE_POLICY_FAILED: { zh: "无法读取或保存来源策略。", en: "The source policy could not be read or saved." },
  DATA_EXPORT_FAILED: { zh: "无法导出本地数据。", en: "Local data could not be exported." },
  DATA_IMPORT_FAILED: { zh: "无法安全导入本地数据；现有数据未被直接覆盖。", en: "Local data could not be imported safely. Existing data was not directly overwritten." },
  AI_SETTINGS_UNAVAILABLE: { zh: "无法读取本机 AI 配置。默认本地提示词仍然可用。", en: "Local AI settings could not be read. The deterministic local Prompt remains available." },
  AI_SETTINGS_INVALID: { zh: "AI 配置内容无效。请检查提供商、模型名称和 Key 长度后重试。", en: "The AI settings are invalid. Check the provider, model name, and key length, then try again." },
  AI_SETTINGS_ENCRYPTION_FAILED: { zh: "Windows 无法加密 API Key。请确认 Windows PowerShell 可用，并从当前用户会话启动 Skill Atlas。", en: "Windows could not encrypt the API key. Confirm Windows PowerShell is available and start Skill Atlas from the current user session." },
  AI_SETTINGS_WRITE_FAILED: { zh: "API Key 已完成加密，但无法写入本机配置目录。请检查目录权限或文件占用。", en: "The API key was encrypted, but the local settings directory could not be written. Check permissions or file locks." },
  AI_SETTINGS_SAVE_FAILED: { zh: "无法保存 AI 配置。默认本地提示词仍然可用。", en: "AI settings could not be saved. The deterministic local Prompt remains available." },
  AI_SETTINGS_CLEAR_FAILED: { zh: "无法清除页面保存的 AI 配置。", en: "AI settings saved from the page could not be cleared." },
  RESCAN_FAILED: { zh: "重新扫描失败。", en: "The rescan failed." },
  PROMPT_FAILED: { zh: "调用提示词生成失败。", en: "The invocation Prompt could not be generated." },
};

export class SkillAtlasError extends Error {
  constructor(
    public readonly code: SkillAtlasErrorCode,
    options?: { cause?: unknown },
  ) {
    super(messages[code].zh, options);
    this.name = "SkillAtlasError";
  }
}

export function localizedErrorMessage(code: SkillAtlasErrorCode, language: Language): string {
  return messages[code][language];
}

export function requestLanguage(request: Request): Language {
  const explicit = request.headers.get("x-skill-atlas-language")?.toLocaleLowerCase();
  if (explicit === "en") return "en";
  if (explicit === "zh") return "zh";
  return request.headers.get("accept-language")?.toLocaleLowerCase().startsWith("en") ? "en" : "zh";
}

export function apiErrorResponse(
  request: Request,
  error: unknown,
  fallbackCode: SkillAtlasErrorCode,
  status = 400,
): Response {
  const code = error instanceof SkillAtlasError
    ? error.code
    : error instanceof ZodError
      ? "REQUEST_INVALID"
      : fallbackCode;
  return Response.json(
    { code, error: localizedErrorMessage(code, requestLanguage(request)) },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
