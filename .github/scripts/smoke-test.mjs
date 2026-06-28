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
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
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

function invoiceNumberPattern(prefix, date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return new RegExp(`^${prefix}-${year}-${month}-\\d{4}$`);
}

try {
  const page = await context.newPage();
  const rentCycleDate = currentRentCycleDate();
  const expectedRentPeriod = monthLabel(rentCycleDate);
  const expectedUtilityPeriod = monthLabel(previousMonthDate(rentCycleDate));
  const expectedRentInvoiceNumber = invoiceNumberPattern("RNT", rentCycleDate);
  const expectedUtilityInvoiceNumber = invoiceNumberPattern("UTL", previousMonthDate(rentCycleDate));
  await page.route("**/sw.js", (route) => route.abort());
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  await page.evaluate(async () => {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  });

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
    sessionStorage.setItem(`rent-ledger:refreshed:${version}`, "1");
    localStorage.setItem("rent-ledger:v1", JSON.stringify(state));
  }, appVersion);

  await page.reload({ waitUntil: "networkidle" });

  const overviewState = await page.evaluate(() => ({
    hash: window.location.hash,
    overviewActive: document.getElementById("view-overview")?.classList.contains("is-active"),
    workflowButtons: [...document.querySelectorAll(".workflow-button span")].map((button) => button.textContent.trim()),
    rentCount: document.getElementById("rentWorkflowCount")?.textContent?.trim(),
    utilityCount: document.getElementById("utilityWorkflowCount")?.textContent?.trim(),
  }));
  assert(overviewState.overviewActive, "App should open on the Overview workflow page.");
  assert(
    overviewState.workflowButtons.join("|") === "Create Rent Invoices|Calculate Utilities|Review Saved Invoices",
    `Unexpected overview workflow buttons: ${overviewState.workflowButtons.join("|")}.`
  );
  assert(overviewState.rentCount === "2 remaining", `Expected 2 rent invoices remaining, got ${overviewState.rentCount}.`);
  assert(
    overviewState.utilityCount === "2 remaining",
    `Expected 2 utility invoices remaining, got ${overviewState.utilityCount}.`
  );

  await page.click('[data-view="rent"]');

  const rentState = await page.evaluate(() => {
    const utility = document.getElementById("utilityCalculator");
    const preview = document.querySelector(".preview-panel");
    return {
      splashVersion: document.getElementById("splashVersion")?.textContent?.trim(),
      invoiceStatus: document.getElementById("invoiceStatus")?.textContent?.trim(),
      saveState: document.getElementById("saveState")?.textContent?.trim(),
      startNewExists: Boolean(document.getElementById("newInvoice")),
      markPaidExists: Boolean(document.getElementById("markPaid")),
      rentPanelHidden: document.getElementById("rentBatchPanel")?.hidden,
      rentRows: document.querySelectorAll("#rentBatchList .cycle-row").length,
      createAllRentLabel: document.getElementById("createAllRentInvoices")?.textContent?.trim(),
      advancedOpen: document.getElementById("advancedCharges")?.open,
      previewButtonDisplay: getComputedStyle(document.getElementById("togglePreview")).display,
      previewDisplay: preview ? getComputedStyle(preview).display : "",
      invoiceNumber: document.getElementById("invoiceNumber")?.value,
      billingPeriod: document.getElementById("billingPeriod")?.value,
      utilityHidden: utility?.hidden,
      utilityDisplay: utility ? getComputedStyle(utility).display : "",
      applyRentHidden: document.getElementById("applyRentCharge")?.hidden,
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
  assert(rentState.invoiceStatus === "Draft", `Expected Draft status, got ${rentState.invoiceStatus}.`);
  assert(rentState.saveState === "Draft", `Expected Draft save-state, got ${rentState.saveState}.`);
  assert(!rentState.startNewExists, "Start new should not appear in the invoice editor.");
  assert(!rentState.markPaidExists, "Mark paid should not appear in the invoice editor header.");
  assert(rentState.rentPanelHidden === false, "Rent tab must show the rent cycle panel.");
  assert(rentState.rentRows === 2, `Expected 2 rent cycle rows, got ${rentState.rentRows}.`);
  assert(
    rentState.createAllRentLabel === "Create all rent invoices",
    `Unexpected rent batch button: ${rentState.createAllRentLabel}.`
  );
  assert(rentState.advancedOpen === false, "Advanced charge editor should be closed by default.");
  assert(rentState.previewButtonDisplay !== "none", "Mobile Preview button should be visible.");
  assert(rentState.previewDisplay === "none", `Mobile preview should be hidden by default, got ${rentState.previewDisplay}.`);
  assert(
    expectedRentInvoiceNumber.test(rentState.invoiceNumber || ""),
    `Expected rent invoice number to match ${expectedRentInvoiceNumber}, got ${rentState.invoiceNumber}.`
  );
  assert(rentState.billingPeriod === expectedRentPeriod, `Expected rent period ${expectedRentPeriod}, got ${rentState.billingPeriod}.`);
  assert(rentState.utilityHidden && rentState.utilityDisplay === "none", "Rent tab must hide the utility calculator.");
  assert(!rentState.applyRentHidden, "Rent Apply charge button should be available inside Edit charges.");
  assert(
    rentState.invoiceButtons.join("|") === "Save|Print|Preview",
    `Expected Save|Print|Preview, got ${rentState.invoiceButtons.join("|")}.`
  );
  assert(rentState.lineTypes.join("|") === "Rent", `Expected one Rent line, got ${rentState.lineTypes.join("|")}.`);
  assert(rentState.lineAmounts[0] === "850", `Expected rent amount 850, got ${rentState.lineAmounts[0]}.`);
  assert(rentState.scrollWidth <= rentState.width + 1, `Mobile overflow: ${rentState.scrollWidth} > ${rentState.width}.`);

  await page.click("#togglePreview");
  const previewVisible = await page.evaluate(() => ({
    display: getComputedStyle(document.querySelector(".preview-panel")).display,
    label: document.getElementById("togglePreview")?.textContent?.trim(),
  }));
  assert(previewVisible.display !== "none", "Preview button should show the mobile preview panel.");
  assert(previewVisible.label === "Hide preview", `Expected Hide preview label, got ${previewVisible.label}.`);
  await page.click("#togglePreview");

  await page.locator("#advancedCharges").evaluate((details) => {
    details.open = true;
  });
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

  page.on("dialog", (dialog) => dialog.accept());
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
  await page.click("#createAllRentInvoices");
  await page.waitForFunction(() => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    return state.invoices?.filter((invoice) => invoice.invoiceType === "rent").length === 2;
  });
  await page.waitForFunction(() => document.getElementById("saveState")?.textContent?.trim() === "Saved locally");
  const rentBatchState = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    const rentInvoices = (state.invoices || []).filter((invoice) => invoice.invoiceType === "rent");
    return {
      hash: window.location.hash,
      rows: [...document.querySelectorAll("#rentBatchList .cycle-row")].map((row) => row.textContent.trim()),
      invoiceNumbers: rentInvoices.map((invoice) => invoice.invoiceNumber),
      driveStatus: document.getElementById("driveStatus")?.textContent?.trim(),
      saveState: document.getElementById("saveState")?.textContent?.trim(),
    };
  });
  assert(rentBatchState.hash === "#rent", `Rent batch should stay on the rent workflow, got ${rentBatchState.hash}.`);
  assert(rentBatchState.rows.every((row) => row.includes("Open")), `Rent rows should show Open after batch create.`);
  assert(
    rentBatchState.invoiceNumbers.every((number) => expectedRentInvoiceNumber.test(number)),
    `Batch rent invoice numbers did not match ${expectedRentInvoiceNumber}: ${rentBatchState.invoiceNumbers.join(", ")}.`
  );
  assert(rentBatchState.saveState === "Saved locally", `Expected saved-local state after mocked Drive failure, got ${rentBatchState.saveState}.`);

  await page.click('[data-view="utility"]');
  await page.waitForFunction(
    () => window.location.hash === "#utility" && document.getElementById("invoiceType")?.value === "utility"
  );
  await page.waitForTimeout(100);
  const utilityState = await page.evaluate(() => {
    const utility = document.getElementById("utilityCalculator");
    return {
      invoiceType: document.getElementById("invoiceType")?.value,
      invoiceNumber: document.getElementById("invoiceNumber")?.value,
      billingPeriod: document.getElementById("billingPeriod")?.value,
      utilityPanelHidden: document.getElementById("utilityBatchPanel")?.hidden,
      utilityRows: document.querySelectorAll("#utilityAllocationList .cycle-row").length,
      utilityHidden: utility?.hidden,
      utilityDisplay: utility ? getComputedStyle(utility).display : "",
      applyRentHidden: document.getElementById("applyRentCharge")?.hidden,
      applyRentDisplay: getComputedStyle(document.getElementById("applyRentCharge")).display,
      batchButton: document.getElementById("createAllUtilityInvoices")?.textContent?.trim(),
      oldBatchButtonExists: Boolean(document.getElementById("batchUtilityInvoices")),
      batchSummary: document.getElementById("utilityBatchSummary")?.textContent?.trim(),
    };
  });
  assert(utilityState.invoiceType === "utility", `Expected utility invoice, got ${utilityState.invoiceType}.`);
  assert(
    expectedUtilityInvoiceNumber.test(utilityState.invoiceNumber || ""),
    `Expected utility invoice number to match ${expectedUtilityInvoiceNumber}, got ${utilityState.invoiceNumber}.`
  );
  assert(
    utilityState.billingPeriod === expectedUtilityPeriod,
    `Expected utility period ${expectedUtilityPeriod}, got ${utilityState.billingPeriod}.`
  );
  assert(utilityState.utilityPanelHidden === false, "Utility tab must show the utility cycle panel.");
  assert(utilityState.utilityRows === 2, `Expected 2 utility allocation rows, got ${utilityState.utilityRows}.`);
  assert(!utilityState.utilityHidden && utilityState.utilityDisplay !== "none", "Utility tab must show the utility calculator.");
  assert(utilityState.applyRentHidden && utilityState.applyRentDisplay === "none", "Rent Apply charge should hide on Utility tab.");
  assert(!utilityState.oldBatchButtonExists, "Old editor-level utility batch button should be removed.");
  assert(utilityState.batchButton === "Create all utilities", `Expected utility batch button, got ${utilityState.batchButton}.`);
  assert(utilityState.batchSummary.includes("2 utility-billable tenants"), `Unexpected batch summary: ${utilityState.batchSummary}.`);

  await page.evaluate(() => {
    const values = {
      cycleUtilityTotalUnits: "3",
      cycleUtilityElectric: "120",
      cycleUtilityWaterSewer: "60",
      cycleUtilityGas: "30",
    };
    for (const [id, value] of Object.entries(values)) {
      const input = document.getElementById(id);
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await page.waitForFunction(
    () =>
      document.getElementById("cycleUtilityTotalUnits")?.value === "3" &&
      document.getElementById("cycleUtilityElectric")?.value === "120" &&
      document.getElementById("cycleUtilityWaterSewer")?.value === "60" &&
      document.getElementById("cycleUtilityGas")?.value === "30"
  );
  await page.selectOption("#tenantSelect", "brenda");
  const utilityTenantSwitch = await page.evaluate(() => ({
    tenantId: document.getElementById("tenantSelect")?.value,
    tenantUnits: document.getElementById("utilityTenantUnits")?.value,
    totalUnits: document.getElementById("utilityTotalUnits")?.value,
    electric: document.getElementById("utilityElectric")?.value,
    waterSewer: document.getElementById("utilityWaterSewer")?.value,
    gas: document.getElementById("utilityGas")?.value,
    cycleTotalUnits: document.getElementById("cycleUtilityTotalUnits")?.value,
    cycleElectric: document.getElementById("cycleUtilityElectric")?.value,
    cycleWaterSewer: document.getElementById("cycleUtilityWaterSewer")?.value,
    cycleGas: document.getElementById("cycleUtilityGas")?.value,
  }));
  assert(utilityTenantSwitch.tenantId === "brenda", `Expected selected utility tenant brenda, got ${utilityTenantSwitch.tenantId}.`);
  assert(utilityTenantSwitch.tenantUnits === "2", `Expected Brenda utility units 2, got ${utilityTenantSwitch.tenantUnits}.`);
  assert(utilityTenantSwitch.totalUnits === "3", `Expected total utility units to persist, got ${utilityTenantSwitch.totalUnits}.`);
  assert(utilityTenantSwitch.electric === "120", `Expected electric total to persist, got ${utilityTenantSwitch.electric}.`);
  assert(utilityTenantSwitch.waterSewer === "60", `Expected water/sewer total to persist, got ${utilityTenantSwitch.waterSewer}.`);
  assert(utilityTenantSwitch.gas === "30", `Expected gas total to persist, got ${utilityTenantSwitch.gas}.`);
  assert(utilityTenantSwitch.cycleTotalUnits === "3", `Expected cycle utility units to persist, got ${utilityTenantSwitch.cycleTotalUnits}.`);
  assert(utilityTenantSwitch.cycleElectric === "120", `Expected cycle electric to persist, got ${utilityTenantSwitch.cycleElectric}.`);
  assert(
    utilityTenantSwitch.cycleWaterSewer === "60",
    `Expected cycle water/sewer to persist, got ${utilityTenantSwitch.cycleWaterSewer}.`
  );
  assert(utilityTenantSwitch.cycleGas === "30", `Expected cycle gas to persist, got ${utilityTenantSwitch.cycleGas}.`);

  await page.click("#createAllUtilityInvoices");
  await page.waitForFunction(() => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    return state.invoices?.filter((invoice) => invoice.invoiceType === "utility").length === 2;
  });
  await page.waitForFunction(
    () => document.getElementById("driveStatus")?.textContent?.trim() === "Google Drive confirmation was cancelled or expired."
  );
  const batchState = await page.evaluate(() => ({
    hash: window.location.hash,
    rows: [...document.querySelectorAll("#utilityAllocationList .cycle-row")].map((row) => row.textContent.trim()),
    invoiceNumbers: (JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}").invoices || [])
      .filter((invoice) => invoice.invoiceType === "utility")
      .map((invoice) => invoice.invoiceNumber),
    driveStatus: document.getElementById("driveStatus")?.textContent?.trim(),
    buttons: [...document.querySelectorAll("#utilityAllocationList [data-toggle-paid-invoice]")].map((button) =>
      button.textContent.trim()
    ),
  }));
  assert(batchState.hash === "#utility", `Utility batch should stay on the utility workflow, got ${batchState.hash}.`);
  assert(batchState.rows.length === 2, `Expected 2 generated utility rows, got ${batchState.rows.length}.`);
  assert(batchState.rows.every((row) => row.includes("Open")), `Utility rows should show Open after batch create.`);
  assert(
    batchState.invoiceNumbers.every((number) => expectedUtilityInvoiceNumber.test(number)),
    `Batch utility invoice numbers did not match ${expectedUtilityInvoiceNumber}: ${batchState.invoiceNumbers.join(", ")}.`
  );
  assert(batchState.buttons.every((label) => label === "Mark paid"), `Expected Mark paid buttons, got ${batchState.buttons.join("|")}.`);
  assert(
    batchState.driveStatus === "Google Drive confirmation was cancelled or expired.",
    `Unexpected batch Drive status: ${batchState.driveStatus}.`
  );

  await page.click("#utilityAllocationList [data-toggle-paid-invoice]");
  const paidState = await page.evaluate(() => ({
    firstCardText: document.querySelector("#utilityAllocationList .cycle-row")?.textContent.trim(),
    firstToggle: document.querySelector("#utilityAllocationList [data-toggle-paid-invoice]")?.textContent.trim(),
  }));
  assert(paidState.firstCardText.includes("Paid"), `Expected first invoice card to show Paid: ${paidState.firstCardText}.`);
  assert(paidState.firstToggle === "Reopen", `Expected Reopen after marking paid, got ${paidState.firstToggle}.`);

  await page.click('[data-view="settings"]');
  const settingsState = await page.evaluate(() => ({
    buttons: [...document.querySelectorAll(".drive-tools .button-row button")].map((button) => button.textContent.trim()),
    driveStatus: document.getElementById("driveStatus")?.textContent?.trim(),
    help: document.querySelector(".drive-tools > .field-help")?.textContent?.trim(),
    hasSaveConnection: document.body.textContent.includes("Save connection settings"),
  }));
  assert(
    settingsState.buttons.join("|") === "Connect Drive|Download from Drive|Upload to Drive",
    `Unexpected Drive buttons: ${settingsState.buttons.join("|")}.`
  );
  assert(!settingsState.hasSaveConnection, "Removed Save connection settings text should not be present.");
  assert(
    ["Not connected. Click Connect Drive.", "Google Drive confirmation was cancelled or expired."].includes(
      settingsState.driveStatus
    ),
    `Unexpected Drive status: ${settingsState.driveStatus}.`
  );
  assert(settingsState.help.includes("Download replaces this browser's data"), "Drive help must explain Upload and Download.");

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
  await page.locator("details.advanced-settings").evaluate((details) => {
    details.open = true;
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
    storedSettings.driveStatus === "Google Drive connection was cancelled or failed.",
    `Unexpected mocked connection status: ${storedSettings.driveStatus}.`
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
