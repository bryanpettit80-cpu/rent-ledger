import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const baseUrl = process.env.RENT_LEDGER_URL || "http://127.0.0.1:4173/";
const appVersion = readFileSync("app.js", "utf8").match(/const APP_VERSION = "([^"]+)"/)?.[1];

if (!appVersion) {
  throw new Error("Unable to read APP_VERSION from app.js.");
}

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}
);
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  deviceScaleFactor: 3,
});

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function monthLabel(date) {
  const monthNumber = String(date.getMonth() + 1).padStart(2, "0");
  const monthName = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
  return `${monthNumber} - ${monthName}`;
}

function currentRentCycleDate(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const cycleMonth = referenceDate.getDate() >= 11 ? month + 1 : month;
  return new Date(year, cycleMonth, 1);
}

function previousMonthDate(date) {
  return new Date(date.getFullYear(), date.getMonth() - 1, 1);
}

try {
  const page = await context.newPage();
  const rentCycleDate = currentRentCycleDate();
  const expectedRentPeriod = monthLabel(rentCycleDate);
  const expectedUtilityPeriod = monthLabel(previousMonthDate(rentCycleDate));
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  await page.evaluate((version) => {
    const state = {
      landlord: {
        name: "Test Landlord",
        address: "1 Test Way",
        email: "",
        phone: "",
        paymentInstructions: "Pay test.",
      },
      tenants: [
        {
          id: "andrew",
          name: "Andrew Buckwalter",
          unit: "Unit A",
          address: "",
          email: "",
          phone: "",
          rent: 850,
          utilityUnits: 1,
          active: true,
          excludeUtilities: false,
          memo: "",
        },
        {
          id: "brenda",
          name: "Brenda Carter",
          unit: "Unit B",
          address: "",
          email: "",
          phone: "",
          rent: 900,
          utilityUnits: 2,
          active: true,
          excludeUtilities: false,
          memo: "",
        },
      ],
      invoices: [],
    };
    localStorage.clear();
    sessionStorage.setItem(`rent-ledger:splash-seen:${version}`, "true");
    localStorage.setItem("rent-ledger:v1", JSON.stringify(state));
  }, appVersion);

  await page.reload({ waitUntil: "networkidle" });
  await page.click('[data-view="rent"]');

  const rentState = await page.evaluate(() => {
    const utility = document.getElementById("utilityCalculator");
    return {
      splashVersion: document.getElementById("splashVersion")?.textContent?.trim(),
      invoiceStatus: document.getElementById("invoiceStatus")?.textContent?.trim(),
      saveState: document.getElementById("saveState")?.textContent?.trim(),
      startNewText: document.getElementById("newInvoice")?.textContent?.trim(),
      markPaidDisabled: document.getElementById("markPaid")?.disabled,
      billingPeriod: document.getElementById("billingPeriod")?.value,
      utilityHidden: utility?.hidden,
      utilityDisplay: utility ? getComputedStyle(utility).display : "",
      applyRentHidden: document.getElementById("applyRentCharge")?.hidden,
      applyRentDisplay: getComputedStyle(document.getElementById("applyRentCharge")).display,
      invoiceButtons: [...document.querySelectorAll("#invoiceForm > .button-row button")].map((button) =>
        button.textContent.trim()
      ),
      lineTypes: [...document.querySelectorAll("[data-line-type]")].map((input) => input.value),
      lineAmounts: [...document.querySelectorAll("[data-line-amount]")].map((input) => input.value),
      scrollWidth: document.documentElement.scrollWidth,
      width: window.innerWidth,
    };
  });

  assert(rentState.splashVersion === appVersion, `Expected splash version ${appVersion}, got ${rentState.splashVersion}.`);
  assert(rentState.invoiceStatus === "Not saved", `Expected Not saved status, got ${rentState.invoiceStatus}.`);
  assert(rentState.saveState === "Not saved", `Expected Not saved save-state, got ${rentState.saveState}.`);
  assert(rentState.startNewText === "Start new", `Expected Start new button, got ${rentState.startNewText}.`);
  assert(rentState.markPaidDisabled, "Mark paid should be disabled before save.");
  assert(rentState.billingPeriod === expectedRentPeriod, `Expected rent period ${expectedRentPeriod}, got ${rentState.billingPeriod}.`);
  assert(rentState.utilityHidden && rentState.utilityDisplay === "none", "Rent tab must hide the utility calculator.");
  assert(!rentState.applyRentHidden && rentState.applyRentDisplay !== "none", "Rent Apply charge button should be visible.");
  assert(rentState.invoiceButtons.join("|") === "Save|Print", `Expected Save|Print, got ${rentState.invoiceButtons.join("|")}.`);
  assert(rentState.lineTypes.join("|") === "Rent", `Expected one Rent line, got ${rentState.lineTypes.join("|")}.`);
  assert(rentState.lineAmounts[0] === "850", `Expected rent amount 850, got ${rentState.lineAmounts[0]}.`);
  assert(rentState.scrollWidth <= rentState.width + 1, `Mobile overflow: ${rentState.scrollWidth} > ${rentState.width}.`);

  await page.click('[data-remove-line="0"]');
  const emptyText = await page.locator("#lineItems").textContent();
  assert(emptyText.includes("Apply the rent charge"), `Unexpected empty rent message: ${emptyText}.`);

  await page.click("#applyRentCharge");
  const appliedRent = await page.evaluate(() => ({
    lineTypes: [...document.querySelectorAll("[data-line-type]")].map((input) => input.value),
    lineAmounts: [...document.querySelectorAll("[data-line-amount]")].map((input) => input.value),
    total: document.getElementById("totalDue")?.textContent?.trim(),
  }));
  assert(appliedRent.lineTypes.join("|") === "Rent", "Apply charge should restore the Rent line.");
  assert(appliedRent.lineAmounts[0] === "850", `Apply charge restored wrong rent amount: ${appliedRent.lineAmounts[0]}.`);
  assert(appliedRent.total === "$850.00", `Expected $850.00 total, got ${appliedRent.total}.`);

  await page.click('[data-view="utility"]');
  const utilityState = await page.evaluate(() => {
    const utility = document.getElementById("utilityCalculator");
    return {
      invoiceType: document.getElementById("invoiceType")?.value,
      billingPeriod: document.getElementById("billingPeriod")?.value,
      utilityHidden: utility?.hidden,
      utilityDisplay: utility ? getComputedStyle(utility).display : "",
      applyRentHidden: document.getElementById("applyRentCharge")?.hidden,
      applyRentDisplay: getComputedStyle(document.getElementById("applyRentCharge")).display,
    };
  });
  assert(utilityState.invoiceType === "utility", `Expected utility invoice, got ${utilityState.invoiceType}.`);
  assert(
    utilityState.billingPeriod === expectedUtilityPeriod,
    `Expected utility period ${expectedUtilityPeriod}, got ${utilityState.billingPeriod}.`
  );
  assert(!utilityState.utilityHidden && utilityState.utilityDisplay !== "none", "Utility tab must show the utility calculator.");
  assert(utilityState.applyRentHidden && utilityState.applyRentDisplay === "none", "Rent Apply charge should hide on Utility tab.");

  await page.evaluate(() => {
    const values = {
      utilityTotalUnits: "3",
      utilityElectric: "120",
      utilityWaterSewer: "60",
      utilityGas: "30",
    };
    for (const [id, value] of Object.entries(values)) {
      const input = document.getElementById(id);
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await page.selectOption("#tenantSelect", "brenda");
  const utilityTenantSwitch = await page.evaluate(() => ({
    tenantId: document.getElementById("tenantSelect")?.value,
    tenantUnits: document.getElementById("utilityTenantUnits")?.value,
    totalUnits: document.getElementById("utilityTotalUnits")?.value,
    electric: document.getElementById("utilityElectric")?.value,
    waterSewer: document.getElementById("utilityWaterSewer")?.value,
    gas: document.getElementById("utilityGas")?.value,
  }));
  assert(utilityTenantSwitch.tenantId === "brenda", `Expected selected utility tenant brenda, got ${utilityTenantSwitch.tenantId}.`);
  assert(utilityTenantSwitch.tenantUnits === "2", `Expected Brenda utility units 2, got ${utilityTenantSwitch.tenantUnits}.`);
  assert(utilityTenantSwitch.totalUnits === "3", `Expected total utility units to persist, got ${utilityTenantSwitch.totalUnits}.`);
  assert(utilityTenantSwitch.electric === "120", `Expected electric total to persist, got ${utilityTenantSwitch.electric}.`);
  assert(utilityTenantSwitch.waterSewer === "60", `Expected water/sewer total to persist, got ${utilityTenantSwitch.waterSewer}.`);
  assert(utilityTenantSwitch.gas === "30", `Expected gas total to persist, got ${utilityTenantSwitch.gas}.`);

  await page.click('[data-view="settings"]');
  const settingsState = await page.evaluate(() => ({
    buttons: [...document.querySelectorAll(".drive-tools .button-row button")].map((button) => button.textContent.trim()),
    driveStatus: document.getElementById("driveStatus")?.textContent?.trim(),
    help: document.querySelector(".drive-tools .field-help:last-child")?.textContent?.trim(),
    hasSaveConnection: document.body.textContent.includes("Save connection settings"),
  }));
  assert(
    settingsState.buttons.join("|") === "Authorize Drive|Load cloud data|Sync now",
    `Unexpected Drive buttons: ${settingsState.buttons.join("|")}.`
  );
  assert(!settingsState.hasSaveConnection, "Removed Save connection settings text should not be present.");
  assert(settingsState.driveStatus === "Not connected: click Authorize Drive.", `Unexpected Drive status: ${settingsState.driveStatus}.`);
  assert(settingsState.help.includes("These actions save the connection fields first"), "Drive help must explain settings auto-save.");

  const testClientId = "123456789012-testclient.apps.googleusercontent.com";
  await page.evaluate(() => {
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient() {
            return {
              callback: () => {},
              requestAccessToken() {
                this.callback({ error: "test_error" });
              },
            };
          },
        },
      },
    };
  });
  await page.fill("#googleClientId", testClientId);
  await page.check("#driveAutoSync");
  await page.click("#connectDrive");
  const storedSettings = await page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem("rent-ledger:settings:v1"));
    return {
      googleClientId: settings.googleClientId,
      driveAutoSync: settings.driveAutoSync,
      driveStatus: document.getElementById("driveStatus")?.textContent?.trim(),
    };
  });
  assert(storedSettings.googleClientId === testClientId, "Drive action should save edited client ID first.");
  assert(storedSettings.driveAutoSync === true, "Drive action should save edited auto-sync setting first.");
  assert(
    storedSettings.driveStatus === "Google authorization was cancelled or failed.",
    `Unexpected mocked authorization status: ${storedSettings.driveStatus}.`
  );
} finally {
  await context.close();
  await browser.close();
}

if (failures.length) {
  console.error("Smoke test failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Smoke test passed for ${appVersion}.`);
