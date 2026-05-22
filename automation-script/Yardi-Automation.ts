import { Stagehand } from "@browserbasehq/stagehand";

const MOCK_YARDI_URL = process.env.MOCK_YARDI_URL ?? "http://localhost:1420/mock-yardi";
const USERNAME = process.env.MOCK_YARDI_USER ?? "yardi.demo";
const PASSWORD = process.env.MOCK_YARDI_PASSWORD ?? "password";
const STEP_DELAY_MS = Number(process.env.MOCK_YARDI_STEP_DELAY_MS ?? "1500");
const CHECKBOX_DELAY_MS = Number(process.env.MOCK_YARDI_CHECKBOX_DELAY_MS ?? "900");

async function pause(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntilBrowserClosed(page: any) {
  while (true) {
    try {
      await page.evaluate(() => document.title);
      await pause(1_000);
    } catch {
      return;
    }
  }
}

async function main() {
  let stagehand: Stagehand | undefined;

  try {
    stagehand = new Stagehand({
      env: "LOCAL",
      localBrowserLaunchOptions: {
        headless: false,
      },
    });

    await stagehand.init();
    const page = stagehand.context.pages()[0] ?? await stagehand.context.newPage();

    await page.goto(MOCK_YARDI_URL, {
      waitUntil: "domcontentloaded",
      timeoutMs: 60_000,
    });
    await page.waitForSelector('[data-testid="yardi-username"]', { timeout: 30_000 });
    await pause(STEP_DELAY_MS);

    await page.locator('[data-testid="yardi-username"]').fill(USERNAME);
    await pause(STEP_DELAY_MS);
    await page.locator('[data-testid="yardi-password"]').fill(PASSWORD);
    await pause(STEP_DELAY_MS);
    await page.locator('[data-testid="yardi-login"]').click();
    await page.waitForSelector('[data-testid="yardi-banking-menu"]', { timeout: 30_000 });
    await pause(STEP_DELAY_MS);

    await page.locator('[data-testid="yardi-banking-menu"]').click();
    await pause(STEP_DELAY_MS);
    await page.locator('[data-testid="yardi-bank-reconcile"]').click();
    await page.waitForSelector('[data-testid="yardi-clear-checkbox"]', { timeout: 30_000 });
    await pause(STEP_DELAY_MS);

    const checkboxes = page.locator('[data-testid="yardi-clear-checkbox"]');
    const count = await checkboxes.count();
    for (let index = 0; index < count; index += 1) {
      const checkbox = checkboxes.nth(index);
      if (!(await checkbox.isChecked())) {
        await checkbox.click();
        await pause(CHECKBOX_DELAY_MS);
      }
    }

    await page.locator('[data-testid="yardi-save"]').click();
    await page.waitForSelector('[data-testid="yardi-save-message"]', { timeout: 30_000 });
    await pause(STEP_DELAY_MS);

    console.log("Yardi items marked reconciled. Close the browser manually when done reviewing.");
    await waitUntilBrowserClosed(page);
    try {
      await stagehand.close();
    } catch {
      // The user may have already closed the browser window.
    }
    process.exit(0);
  } catch (error) {
    console.error("Yardi automation failed.");
    console.error(error);

    try {
      await stagehand?.close();
    } catch {
      // Ignore cleanup errors after a failed browser run.
    }

    process.exit(1);
  }
}

main();
