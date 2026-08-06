import { expect, test } from "@playwright/test";

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 900 },
  { name: "mobile", width: 360, height: 800 },
] as const;

const languages = ["zh", "en"] as const;

for (const language of languages) {
  for (const viewport of viewports) {
    test(`catalog visual contract · ${language} · ${viewport.name}`, async ({ context, page }) => {
      await context.addCookies([{
        name: "skill-atlas-language",
        value: language,
        domain: "127.0.0.1",
        path: "/",
      }]);
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.getByText("ready-skill", { exact: true }).first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      await expect(page).toHaveScreenshot(`catalog-${language}-${viewport.name}.png`, {
        animations: "disabled",
        caret: "hide",
        mask: [page.locator(".scan-status small")],
        maxDiffPixelRatio: 0.01,
      });
    });
  }
}

test("responsive catalog keeps a readable baseline and fixed actions clear of the command", async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const audit = await page.evaluate(() => {
      const interactive = [
        ...document.querySelectorAll<HTMLElement>("button, a, input, select, textarea, summary, [role='button']"),
      ].filter((element) => {
        const style = getComputedStyle(element);
        const label = element.innerText.trim() || element.getAttribute("aria-label")?.trim();
        return label && style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
      });
      const tooSmall = interactive.flatMap((element) => {
        const fontSize = Number.parseFloat(getComputedStyle(element).fontSize);
        return fontSize < 9 ? [{ label: element.innerText.trim() || element.getAttribute("aria-label"), fontSize }] : [];
      });
      const command = document.querySelector<HTMLElement>(".catalog-command-input-wrap")?.getBoundingClientRect();
      const fixedAction = document.querySelector<HTMLElement>(".responsive-builder-trigger")?.getBoundingClientRect();
      const overlaps = Boolean(command && fixedAction && !(
        fixedAction.bottom <= command.top ||
        fixedAction.top >= command.bottom ||
        fixedAction.right <= command.left ||
        fixedAction.left >= command.right
      ));
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        tooSmall,
        overlaps,
      };
    });

    expect(audit.overflow, `${viewport.name} horizontal overflow`).toBeLessThanOrEqual(1);
    expect(audit.tooSmall, `${viewport.name} interactive text below the current 9px floor`).toEqual([]);
    expect(audit.overlaps, `${viewport.name} fixed Builder action overlaps the command`).toBe(false);
  }
});

test("catalog waits for an explicit Skill selection before showing the Builder", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");

  await expect(page.locator(".invocation-builder")).toHaveCount(0);
  await expect(page.locator(".responsive-builder-trigger")).toHaveCount(0);

  await page.locator(".compact-skill-row", { hasText: "ready-skill" }).click();
  await expect(page.locator(".responsive-builder-trigger")).toBeVisible();
});

test("desktop Builder keeps its copy action inside the first viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator(".compact-skill-row", { hasText: "ready-skill" }).click();

  const builder = page.locator(".invocation-builder");
  const copyAction = page.locator(".invocation-builder-copy");
  await expect(builder).toBeVisible();
  await expect(copyAction).toBeVisible();
  const geometry = await page.evaluate(() => {
    const builderRect = document.querySelector<HTMLElement>(".invocation-builder")!.getBoundingClientRect();
    const actionRect = document.querySelector<HTMLElement>(".invocation-builder-copy")!.getBoundingClientRect();
    const scrollBody = document.querySelector<HTMLElement>(".invocation-builder-scroll")!;
    return {
      builderBottom: builderRect.bottom,
      actionBottom: actionRect.bottom,
      viewportHeight: window.innerHeight,
      scrollableBody: scrollBody.scrollHeight >= scrollBody.clientHeight,
    };
  });

  expect(geometry.builderBottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.actionBottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.scrollableBody).toBe(true);
});

test("tablet navigation uses an accessible disclosure instead of a clipped strip", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/");

  const toggle = page.locator(".sidebar-menu-toggle");
  const navigation = page.locator("#primary-navigation");
  await expect(toggle).toBeVisible();
  await expect(navigation).toBeHidden();
  await toggle.click();
  await expect(navigation).toBeVisible();
  await expect(page.getByRole("link", { name: /Operations|操作中心/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.keyboard.press("Escape");
  await expect(navigation).toBeHidden();
  await expect(toggle).toBeFocused();
});

test("mobile reaches the first Skill near the top and keeps personal insights collapsed", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");

  const firstSkill = page.locator(".compact-skill-row").first();
  const top = await firstSkill.evaluate((element) => element.getBoundingClientRect().top);
  expect(top).toBeLessThanOrEqual(470);
  await expect(page.locator(".local-insights-body")).toBeHidden();
  await expect(page.locator(".local-insights-toggle")).toHaveAttribute("aria-expanded", "false");
});
