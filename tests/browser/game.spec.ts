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

test("save failure exposes durable progress and reload restores it", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "村委會大樓", exact: true }),
  ).toBeEnabled();
  const mobile = info.project.name === "mobile",
    box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.click(
    box.width * (mobile ? 0.7 : 0.55),
    box.height * (mobile ? 0.56 : 0.48),
  );
  await page.getByRole("button", { name: "確認放置" }).click();
  const storage = page.getByTestId("storage-status");
  await expect(storage).toContainText("進度已儲存");
  const durable = await storage.textContent();
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (stores, mode, options) {
      const tx = original.call(this, stores, mode, options);
      if (mode === "readwrite") queueMicrotask(() => tx.abort());
      return tx;
    };
  });
  await page.getByRole("button", { name: "暫停", exact: true }).click();
  await expect(page.getByText(/已停止寫入與模擬/)).toBeVisible();
  await expect(storage).toContainText("畫面含未儲存進度");
  await expect(storage).toContainText("重新載入會回到上次存檔");
  expect(await storage.textContent()).toContain(
    durable!.replace("進度已儲存。", ""),
  );
  await expect(
    page.getByRole("button", { name: "農業", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "暫停", exact: true }),
  ).toBeEnabled();
  await expect(page.getByTestId("storage-status")).toContainText("進度已儲存");
});

test("72h catch-up yields to browser event loop under 4x CPU throttling", async ({
  page,
  context,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "村委會大樓", exact: true }),
  ).toBeEnabled();
  await page.evaluate(async () => {
    const path = "/src/simulation/core.ts";
    const { Core, createState } = await import(path);
    const c = new Core(createState("browser-catchup"));
    c.command({
      id: "hq",
      type: "placeHQ",
      bounds: { minX: 25, minY: 25, maxXExclusive: 27, maxYExclusive: 27 },
      timestamp: Date.now() - 100 * 3600000,
    });
    for (let y = 16; y <= 40; y += 4)
      for (let x = 20; x <= 40; x += 4)
        c.command({
          id: `parcel-${x}-${y}`,
          type: "zone",
          zone: x % 8 === 0 ? "residential" : "agriculture",
          bounds: {
            minX: x,
            minY: y,
            maxXExclusive: x + (y % 8 === 0 ? 1 : 2),
            maxYExclusive: y + 2,
          },
        });
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.open("mongo-v1", 1);
      r.onsuccess = () => {
        const db = r.result,
          tx = db.transaction("checkpoint", "readwrite");
        tx.objectStore("checkpoint").put(c.getSnapshot(), "single");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => reject(tx.error);
      };
    });
  });
  await page.addInitScript(installCatchUpProbe);
  const session = await context.newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText(/正在補算離線進度/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "農業", exact: true }),
  ).toBeDisabled();
  await expect(page.getByTestId("tick")).toContainText("Tick 4320", {
    timeout: 30000,
  });
  await expect(
    page.getByRole("button", { name: "農業", exact: true }),
  ).toBeEnabled();
  await expect(page.getByTestId("storage-status")).toContainText("進度已儲存");
  const metrics = await page.evaluate(() =>
    Reflect.get(window, "testCatchUpMetrics"),
  );
  console.info(
    JSON.stringify({
      benchmark: "chromium-72h-mixed-4x",
      project: info.project.name,
      ...metrics,
    }),
  );
  expect(metrics.finished).toBe(true);
  expect(metrics.beats).toBeGreaterThan(100);
  expect(metrics.longTaskObserverSupported).toBe(true);
  expect(metrics.maxLongTaskMs).toBeLessThan(500);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await session.detach();
});

function installCatchUpProbe() {
  let beats = 0,
    last = 0,
    maxGap = 0,
    start = 0,
    totalMs = 0,
    active = false,
    finished = false;
  let maxGapAtTick = "",
    maxGapAtMs = 0;
  const longTasks: { duration: number; startTime: number }[] = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries())
      if (
        start &&
        entry.startTime + entry.duration > start &&
        (!finished || entry.startTime <= start + totalMs)
      )
        longTasks.push({
          duration: entry.duration,
          startTime: entry.startTime - start,
        });
  }).observe({ entryTypes: ["longtask"] });
  const recordGap = (now: number) => {
    if (now - last > maxGap) {
      maxGap = now - last;
      maxGapAtMs = now - start;
      maxGapAtTick =
        document.querySelector('[data-testid="tick"]')?.textContent ?? "";
    }
  };
  new MutationObserver(() => {
    const running =
      document.body?.textContent?.includes("正在補算離線進度") ?? false;
    if (running && !active && !finished) {
      active = true;
      start = last = performance.now();
    }
    if (active && !running) {
      const now = performance.now();
      recordGap(now);
      totalMs = now - start;
      active = false;
      finished = true;
    }
  }).observe(document, {
    subtree: true,
    childList: true,
    characterData: true,
  });
  setInterval(() => {
    if (!active) return;
    const now = performance.now();
    recordGap(now);
    last = now;
    beats++;
  }, 5);
  Object.defineProperty(window, "testCatchUpMetrics", {
    get: () => ({
      beats,
      maxGap,
      totalMs,
      finished,
      maxGapAtTick,
      maxGapAtMs,
      longTasks,
      longTaskObserverSupported:
        PerformanceObserver.supportedEntryTypes.includes("longtask"),
      maxLongTaskMs: Math.max(0, ...longTasks.map((entry) => entry.duration)),
    }),
  });
}

test("catch-up probe detects deliberately blocking work", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "村委會大樓", exact: true }),
  ).toBeEnabled();
  await page.evaluate(installCatchUpProbe);
  const metrics = await page.evaluate(async () => {
    const note = document.createElement("span");
    note.hidden = true;
    note.textContent = "正在補算離線進度";
    document.body.append(note);
    await Promise.resolve();
    const began = performance.now();
    while (performance.now() - began < 650) {
      /* Positive control for the long-task observer. */
    }
    note.remove();
    await new Promise((resolve) => setTimeout(resolve, 50));
    return Reflect.get(window, "testCatchUpMetrics");
  });
  expect(metrics.finished).toBe(true);
  expect(metrics.longTaskObserverSupported).toBe(true);
  expect(metrics.maxLongTaskMs).toBeGreaterThanOrEqual(600);
});

test("insecure HTTP renders a read-only island without randomUUID", async ({
  page,
  context,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.route("http://mongo-preview.test/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: new URL(url.pathname + url.search, baseURL).href,
    });
    await route.fulfill({ response });
  });
  await page.goto("http://mongo-preview.test/");
  expect(await page.evaluate(() => isSecureContext)).toBe(false);
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe("undefined");
  await expect(
    page.getByRole("heading", { name: "發現新大陸", exact: true }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByText(/目前為區網 HTTP 畫面預覽/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "村委會大樓", exact: true }),
  ).toBeDisabled();
  const pan = page.getByRole("button", { name: "平移 / 縮放", exact: true });
  await expect(pan).toBeEnabled();
  await pan.click();
  await expect(pan).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

test("startup failure displays an error instead of a blank page", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(crypto, "getRandomValues", {
      value: () => {
        throw Error("ID_RANDOM_UNAVAILABLE");
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("遊戲無法啟動");
  await expect(page.getByRole("alert")).toContainText("ID_RANDOM_UNAVAILABLE");
});
