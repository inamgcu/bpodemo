import { Stagehand } from "@browserbasehq/stagehand";

const MOCK_YARDI_URL = process.env.MOCK_YARDI_URL ?? "https://inamgcu.github.io/bpodemo/mock-yardi/";
const USERNAME = process.env.MOCK_YARDI_USER ?? "yardi.demo";
const PASSWORD = process.env.MOCK_YARDI_PASSWORD ?? "password";
const STEP_DELAY_MS = Number(process.env.MOCK_YARDI_STEP_DELAY_MS ?? "1500");
const CHECKBOX_DELAY_MS = Number(process.env.MOCK_YARDI_CHECKBOX_DELAY_MS ?? "900");

async function pause(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  let stagehand: Stagehand | undefined;
  let failed = false;

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

    console.log("Yardi items marked reconciled. Closing browser automatically.");
  } catch (error) {
    failed = true;
    console.error("Yardi automation failed.");
    console.error(error);
  } finally {
    try {
      if (stagehand) {
        const openPages = stagehand.context.pages();
        for (const openPage of openPages) {
          await openPage.close({ runBeforeUnload: false }).catch((closeError) => {
            console.error("Unable to close an open Yardi browser page.");
            console.error(closeError);
          });
        }
        await stagehand.close();
        console.log("Yardi browser closed automatically.");
      }
    } catch (error) {
      failed = true;
      console.error("Unable to close Yardi browser automatically.");
      console.error(error);
    }

    process.exit(failed ? 1 : 0);
  }
}

main();
