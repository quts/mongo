import { test, expect } from "@playwright/test";

test("cozy planning HUD keeps the island clear in portrait and landscape", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /THREE\.|WebGL|shader/i.test(message.text()))
      errors.push(message.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "村委會大樓", exact: true }),
  ).toBeEnabled({ timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() =>
      Array.from(document.fonts).some(
        (face) => face.family === "Huninn Rounded" && face.status === "loaded",
      ),
    ),
  ).toBe(true);
  await expect(page.locator("aside")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const viewport = page.viewportSize()!,
    dock = (await page
      .getByRole("region", { name: "規劃工具列" })
      .boundingBox())!;
  expect(dock.x).toBeGreaterThanOrEqual(0);
  expect(dock.x + dock.width).toBeLessThanOrEqual(viewport.width);
  expect(dock.y + dock.height).toBeLessThanOrEqual(viewport.height);
  expect(dock.height).toBeLessThan(
    viewport.height * (viewport.height < 500 ? 0.36 : 0.25),
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    viewport.width,
  );
  await page.getByRole("button", { name: "顯示格線" }).click();
  await expect(page.getByRole("button", { name: "顯示格線" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "顯示格線" }).click();
  await page.getByRole("button", { name: "平移 / 縮放", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "平移 / 縮放", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "回到島嶼中央" }).click();
  await page.screenshot({
    animations: "disabled",
    path: `test-results/ui-${info.project.name}-initial.png`,
  });
  await page.getByRole("button", { name: "開啟選單" }).click();
  await expect(page.getByRole("dialog", { name: "村委會手札" })).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("本機進度");
  await page.getByRole("button", { name: "關閉視窗" }).click();
  await page.getByRole("button", { name: "操作說明" }).last().click();
  await expect(
    page.getByRole("dialog", { name: "幹事操作指南" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "關閉視窗" }).click();
  expect(errors).toEqual([]);
});

test("planning selection stays separate from the tool dock and supports the opening flow", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "村委會大樓", exact: true }),
  ).toBeEnabled({ timeout: 15000 });
  const { width, height } = page.viewportSize()!,
    x = width * (width < 700 ? 0.7 : 0.55),
    y = height * (height < 500 ? 0.4 : width < 700 ? 0.56 : 0.48);
  if (info.project.use.hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  await expect(page.getByRole("button", { name: "確認放置" })).toBeEnabled();
  const card = (await page
      .getByRole("region", { name: "選址預覽" })
      .boundingBox())!,
    dock = (await page
      .getByRole("region", { name: "規劃工具列" })
      .boundingBox())!;
  expect(card.x).toBeGreaterThanOrEqual(0);
  expect(card.x + card.width).toBeLessThanOrEqual(width);
  expect(card.y).toBeGreaterThanOrEqual(0);
  expect(card.y + card.height).toBeLessThanOrEqual(height);
  const overlap =
    Math.max(
      0,
      Math.min(card.x + card.width, dock.x + dock.width) -
        Math.max(card.x, dock.x),
    ) *
    Math.max(
      0,
      Math.min(card.y + card.height, dock.y + dock.height) -
        Math.max(card.y, dock.y),
    );
  expect(overlap).toBe(0);
  await page.screenshot({
    animations: "disabled",
    path: `test-results/ui-${info.project.name}-selection.png`,
  });
  await page.getByRole("button", { name: "確認放置" }).click();
  await expect(
    page.getByRole("tab", { name: "分區", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("button", { name: "農業", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "住宅", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "住宅", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "開啟選單" }).click();
  await page.getByRole("button", { name: "重新開始", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "重新開始確認" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "保留島嶼" }).click();
  await expect(
    page.getByRole("button", { name: "農業", exact: true }),
  ).toBeEnabled();
});
