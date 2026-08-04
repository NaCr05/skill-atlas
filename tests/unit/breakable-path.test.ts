import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BreakablePath } from "@/components/breakable-path";

describe("BreakablePath", () => {
  it("offers wrap opportunities only at path separators and retains the complete value", () => {
    const value = "C:\\Users\\36007\\.codex\\skills\\very-long-skill-name";
    const markup = renderToStaticMarkup(createElement(BreakablePath, { value }));

    expect(markup).toContain('data-breakable-path="true"');
    expect(markup).toContain('title="C:\\Users\\36007\\.codex\\skills\\very-long-skill-name"');
    expect(markup).toContain("<span>very-long-skill-name</span>");
    expect(markup.match(/<wbr\/>/g)).toHaveLength(5);
  });

  it("supports repository-relative paths with forward slashes", () => {
    const markup = renderToStaticMarkup(createElement(BreakablePath, { value: "references/guides/setup.md" }));
    expect(markup.match(/<wbr\/>/g)).toHaveLength(2);
  });
});
