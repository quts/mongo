import { test, expect } from "@playwright/test";
test("HQ, rectangular farm, first immigrants, reload and second tab lease", async ({
  page,
  context,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: new Date("2026-11-03T12:00:00Z") });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "村委會大樓", exact: true }),
  ).toBeEnabled();
  // Projected ground at the visual center is safely inside the test island.
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  const mobile = info.project.name === "mobile";
  const x = box.width * (mobile ? 0.7 : 0.55),
    y = box.height * (mobile ? 0.56 : 0.48);
  if (mobile) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  await expect(page.getByRole("button", { name: "確認放置" })).toBeEnabled();
  await page.getByRole("button", { name: "確認放置" }).click();
  await expect(
    page.getByRole("button", { name: "農業", exact: true }),
  ).toBeEnabled();
  if (mobile) {
    const session = await context.newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: x + 50, y: y + 50 }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + 50, y: y + 90 }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await session.detach();
  } else {
    await page.mouse.move(x + 50, y + 50);
    await page.mouse.down();
    await page.mouse.move(x + 50, y + 90, { steps: 5 });
    await page.mouse.up();
  }
  await expect(page.getByRole("button", { name: "確認分區" })).toBeEnabled();
  await page.getByRole("button", { name: "確認分區" }).click();
  await page.clock.fastForward(121000);
  await expect(page.getByTestId("population")).toContainText("3");
  await page.screenshot({ path: `test-results/${info.project.name}-farm.png` });
  await page.getByRole("button", { name: "暫停", exact: true }).click();
  await page.clock.fastForward(2000);
  const population = await page.getByTestId("population").textContent();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "繼續", exact: true }),
  ).toBeEnabled();
  await expect(page.getByTestId("population")).toHaveText(population!);
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByText(/另一個分頁正在管理島嶼/)).toBeVisible();
  await expect(
    other.getByRole("button", { name: "農業", exact: true }),
  ).toBeDisabled();
  await other.close();
  await page.getByRole("button", { name: "重新開始", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "繼續確認" }).click();
  await page.getByRole("button", { name: "清除並重新開始" }).click();
  await expect(
    page.getByRole("button", { name: "村委會大樓", exact: true }),
  ).toBeEnabled();
  await expect(page.getByTestId("population")).toHaveText("0 / 0");
  expect(errors).toEqual([]);
});

test("unsupported Web Locks stays read-only and never initializes storage", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "locks", { value: undefined }),
  );
  await page.goto("/");
  await expect(page.getByText(/此瀏覽器不支援安全寫入鎖/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "村委會大樓", exact: true }),
  ).toBeDisabled();
  const saved = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const r = indexedDB.open("mongo-v1", 1);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction("checkpoint", "readonly"),
            q = tx.objectStore("checkpoint").get("single");
          q.onsuccess = () => {
            resolve(q.result ?? null);
            db.close();
          };
        };
      }),
  );
  expect(saved).toBeNull();
});
