import { describe, expect, it } from "vitest";

import { DEFAULT_CATALOG_PAGE_SIZE, paginateCatalog } from "@/core/skills/pagination";

describe("catalog pagination", () => {
  it("renders a bounded page instead of the complete catalog", () => {
    const skills = Array.from({ length: 1_000 }, (_, index) => `skill-${index}`);

    const page = paginateCatalog(skills, 2);

    expect(page.items).toHaveLength(DEFAULT_CATALOG_PAGE_SIZE);
    expect(page.items[0]).toBe("skill-20");
    expect(page.start).toBe(21);
    expect(page.end).toBe(40);
    expect(page.pageCount).toBe(50);
  });

  it("clamps stale page numbers after filtering", () => {
    const page = paginateCatalog(["one", "two"], 99);

    expect(page.page).toBe(1);
    expect(page.items).toEqual(["one", "two"]);
  });
});
