import type { ReactNode } from "react";

export function LocalizedText({ zh, en }: { zh: ReactNode; en: ReactNode }) {
  return (
    <>
      <span className="i18n-zh" lang="zh-CN">{zh}</span>
      <span className="i18n-en" lang="en">{en}</span>
    </>
  );
}
