import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TranslationBadge } from "@/components/translation-badge";

describe("TranslationBadge", () => {
  it("distinguishes catalog copy from a deterministic local summary", () => {
    expect(renderToStaticMarkup(createElement(TranslationBadge, { kind: "catalog" }))).toContain("中文说明");
    expect(renderToStaticMarkup(createElement(TranslationBadge, { kind: "automatic" }))).toContain("本地中文摘要");
  });

  it("does not label an original Chinese description as generated copy", () => {
    expect(renderToStaticMarkup(createElement(TranslationBadge, { kind: "source" }))).toBe("");
  });
});
