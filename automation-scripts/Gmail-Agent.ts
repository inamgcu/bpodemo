import { Stagehand } from "@browserbasehq/stagehand";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const EMAIL = "umersalman81@gmail.com";
const PASSWORD = "ayan12345";
const SENDER_EMAIL = "kashif.hussain@tkxel.io";

// Creates a safe unique folder name based on email
const SAFE_EMAIL = EMAIL.replace(/[^a-zA-Z0-9]/g, "_");

const USER_DATA_DIR = `C:\\StagehandProfiles\\gmail-session-${SAFE_EMAIL}`;

const PROJECT_DOWNLOAD_DIR = path.resolve("downloads");
const WINDOWS_DOWNLOAD_DIR = path.join(os.homedir(), "Downloads");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

function listDownloadFiles() {
  if (!fs.existsSync(WINDOWS_DOWNLOAD_DIR)) return new Set<string>();

  return new Set(
    fs
      .readdirSync(WINDOWS_DOWNLOAD_DIR)
      .filter((f) => !f.endsWith(".crdownload"))
  );
}

async function waitForNewDownloadedFile(beforeFiles: Set<string>) {
  const start = Date.now();

  while (Date.now() - start < 60000) {
    const files = fs
      .readdirSync(WINDOWS_DOWNLOAD_DIR)
      .filter((f) => !f.endsWith(".crdownload"));

    for (const file of files) {
      if (!beforeFiles.has(file)) {
        return path.join(WINDOWS_DOWNLOAD_DIR, file);
      }
    }

    await sleep(1000);
  }

  return null;
}

function moveToProjectDownloads(filePath: string) {
  const fileName = path.basename(filePath);
  const targetPath = path.join(PROJECT_DOWNLOAD_DIR, fileName);

  fs.copyFileSync(filePath, targetPath);
  console.log(`Moved to project downloads: ${targetPath}`);
}

async function main() {
  let stagehand: Stagehand | undefined;
  let failed = false;

  try {
    ensureDir(USER_DATA_DIR);
    ensureDir(PROJECT_DOWNLOAD_DIR);

    console.log(`Using browser profile: ${USER_DATA_DIR}`);

    stagehand = new Stagehand({
      env: "LOCAL",
      localBrowserLaunchOptions: {
        userDataDir: USER_DATA_DIR,
      },
    });

    await stagehand.init();

    const page = stagehand.context.pages()[0];

    await page.goto("https://gmail.com", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    console.log("Gmail opened");

    await sleep(5000);

    const bodyText = await page.locator("body").innerText();

    const isLoggedOut =
      bodyText.includes("Choose an account") ||
      bodyText.includes("Use another account") ||
      bodyText.includes("Signed out") ||
      (await page.locator('input[type="email"]').count()) > 0;

    if (isLoggedOut) {
      console.log("Login required.");

      const useAnotherAccount = page.locator("text=Use another account");

      if ((await useAnotherAccount.count()) > 0) {
        await useAnotherAccount.click();
        await sleep(3000);
      }

      await page.waitForSelector('input[type="email"]', { timeout: 60000 });
      await page.locator('input[type="email"]').fill(EMAIL);
      await page.locator("#identifierNext").click();

      console.log("Email entered");

      await page.waitForSelector('input[type="password"]', { timeout: 60000 });
      await page.locator('input[type="password"]').fill(PASSWORD);
      await page.locator("#passwordNext").click();

      console.log("Password entered");
      console.log("Login submitted");

      await sleep(12000);
    } else {
      console.log("Already logged in. Skipping login.");
    }

    await page.goto("https://mail.google.com/mail/u/0/#inbox", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    console.log("Inbox opened");

    await sleep(5000);

    const searchQuery = `from:${SENDER_EMAIL}`;
    const encodedQuery = encodeURIComponent(searchQuery);

    await page.goto(
      `https://mail.google.com/mail/u/0/#search/${encodedQuery}`,
      {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      }
    );

    console.log(`Search opened for: ${searchQuery}`);

    await sleep(8000);

    await page.waitForSelector('div[role="main"] div[role="link"]', {
      timeout: 60000,
    });

    await page.locator('div[role="main"] div[role="link"]').first().click();

    console.log("Latest email opened");

    await sleep(8000);

    console.log("Email is displayed in browser");

    const downloadButtons = page.locator(
      '[aria-label*="Download"], [data-tooltip*="Download"]'
    );

    const attachmentCount = await downloadButtons.count();

    console.log(`Download buttons found: ${attachmentCount}`);

    for (let i = 0; i < attachmentCount; i++) {
      try {
        const beforeFiles = listDownloadFiles();

        await downloadButtons.nth(i).click({ force: true });

        console.log(`Attachment ${i + 1} download clicked`);

        const downloadedFile = await waitForNewDownloadedFile(beforeFiles);

        if (downloadedFile) {
          moveToProjectDownloads(downloadedFile);
        } else {
          console.log(`Attachment ${i + 1} was not detected in Downloads`);
        }
      } catch (err) {
        console.log(`Attachment ${i + 1} could not be downloaded`);
        console.error(err);
      }
    }

    console.log("Task completed");
    console.log("Closing browser automatically after ledger retrieval.");
  } catch (err) {
    failed = true;
    console.error("ERROR:");
    console.error(err);

    console.log("Automation failed. Closing browser and returning to the desktop application.");
  } finally {
    try {
      if (stagehand) {
        const openPages = stagehand.context.pages();
        for (const openPage of openPages) {
          await openPage.close({ runBeforeUnload: false }).catch((closeErr) => {
            console.error("Unable to close an open browser page:");
            console.error(closeErr);
          });
        }
        await stagehand.close();
        console.log("Browser closed automatically.");
      }
    } catch (err) {
      failed = true;
      console.error("Unable to close browser automatically:");
      console.error(err);
    }

    console.log("Session cleaned");
    process.exit(failed ? 1 : 0);
  }
}

main();
