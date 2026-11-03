import { defineConfig } from "@playwright/test";
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: externalBaseURL ?? "http://127.0.0.1:4173",
    headless: true,
    screenshot: "only-on-failure",
    launchOptions: {
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl"],
    },
  },
  webServer: externalBaseURL
    ? undefined
    : {
        command: "npm run dev -- --port 4173",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env.CI,
      },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "webkit-phone",
      testMatch: "**/ui.spec.ts",
      use: {
        browserName: "webkit",
        deviceScaleFactor: 3,
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        launchOptions: { args: [] },
      },
    },
    {
      name: "webkit-landscape",
      testMatch: "**/ui.spec.ts",
      use: {
        browserName: "webkit",
        deviceScaleFactor: 3,
        viewport: { width: 844, height: 390 },
        isMobile: true,
        hasTouch: true,
        launchOptions: { args: [] },
      },
    },
    {
      name: "webkit-tablet",
      testMatch: "**/ui.spec.ts",
      use: {
        browserName: "webkit",
        deviceScaleFactor: 2,
        viewport: { width: 1024, height: 768 },
        isMobile: true,
        hasTouch: true,
        launchOptions: { args: [] },
      },
    },
  ],
});
