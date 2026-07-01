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
  const expectedDepositInvoiceNumber = invoiceNumberPattern("DEP", rentCycleDate);
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
          securityDeposit: 350,
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
          securityDeposit: 900,
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
    securityDepositCount: document.getElementById("securityDepositWorkflowCount")?.textContent?.trim(),
    navWidth: Math.round(document.querySelector(".nav-tabs")?.getBoundingClientRect().width || 0),
    settingsWidth: Math.round(document.querySelector('[data-view="settings"]')?.getBoundingClientRect().width || 0),
  }));
  assert(overviewState.overviewActive, "App should open on the Overview workflow page.");
  assert(
    overviewState.workflowButtons.join("|") === "Create Rent Invoices|Calculate Utilities|Security Deposits|Review Saved Invoices",
    `Unexpected overview workflow buttons: ${overviewState.workflowButtons.join("|")}.`
  );
  assert(overviewState.rentCount === "2 remaining", `Expected 2 rent invoices remaining, got ${overviewState.rentCount}.`);
  assert(
    overviewState.utilityCount === "2 remaining",
    `Expected 2 utility invoices remaining, got ${overviewState.utilityCount}.`
  );
  assert(
    overviewState.securityDepositCount === "2 remaining",
    `Expected 2 security deposit invoices remaining, got ${overviewState.securityDepositCount}.`
  );
  assert(
    Math.abs(overviewState.settingsWidth + 2 - overviewState.navWidth) <= 1,
    `Expected Settings to fill the bottom nav row, got ${overviewState.settingsWidth} of ${overviewState.navWidth}.`
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

  const driveSavedInvoiceId = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    const invoice = (state.invoices || []).find((item) => item.invoiceType === "rent" && item.tenantId === "andrew");
    invoice.drivePdfFileId = "drive-pdf-123";
    invoice.drivePdfFileName = `${invoice.invoiceNumber}-Andrew-Buckwalter.pdf`;
    invoice.driveSavedAt = "2026-07-01T13:00:00.000Z";
    invoice.driveModifiedTime = "2026-07-01T13:00:00.000Z";
    localStorage.setItem("rent-ledger:v1", JSON.stringify(state));
    return invoice.id;
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.click('[data-view="invoices"]');
  await page.click(`#invoiceHistory [data-load-invoice="${driveSavedInvoiceId}"]`);
  const driveSavedLabelState = await page.evaluate(() => ({
    saveState: document.getElementById("saveState")?.textContent?.trim(),
    invoiceStatus: document.getElementById("invoiceStatus")?.textContent?.trim(),
    invoiceType: document.getElementById("invoiceType")?.value,
  }));
  assert(
    driveSavedLabelState.saveState === "Saved to Drive" && driveSavedLabelState.invoiceStatus === "Saved to Drive",
    `Expected reopened Drive-saved invoice to show Saved to Drive, got ${driveSavedLabelState.invoiceStatus}/${driveSavedLabelState.saveState}.`
  );
  assert(driveSavedLabelState.invoiceType === "rent", `Expected reopened Drive-saved rent invoice, got ${driveSavedLabelState.invoiceType}.`);

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
  await page.waitForFunction(() => document.getElementById("paymentDialog")?.hidden === false);
  const paymentDialogState = await page.evaluate(() => ({
    copy: document.getElementById("paymentDialogCopy")?.textContent?.trim(),
    buttons: [...document.querySelectorAll("#paymentDialog .button-row button")].map((button) =>
      button.textContent.trim()
    ),
    partialHidden: document.getElementById("partialPaymentFields")?.hidden,
  }));
  assert(paymentDialogState.copy.includes("Balance due"), `Unexpected payment dialog copy: ${paymentDialogState.copy}.`);
  assert(
    paymentDialogState.buttons.join("|") === "Full|Partial|Cancel",
    `Unexpected payment dialog buttons: ${paymentDialogState.buttons.join("|")}.`
  );
  assert(paymentDialogState.partialHidden === true, "Partial payment amount should be hidden before Partial is selected.");
  await page.click("#paymentFull");
  const paidState = await page.evaluate(() => ({
    firstCardText: document.querySelector("#utilityAllocationList .cycle-row")?.textContent.trim(),
    firstToggle: document.querySelector("#utilityAllocationList [data-toggle-paid-invoice]")?.textContent.trim(),
  }));
  assert(paidState.firstCardText.includes("Paid"), `Expected first invoice card to show Paid: ${paidState.firstCardText}.`);
  assert(paidState.firstToggle === "Reopen", `Expected Reopen after marking paid, got ${paidState.firstToggle}.`);

  await page.click('[data-view="security"]');
  await page.waitForFunction(
    () => window.location.hash === "#security" && document.getElementById("invoiceType")?.value === "security"
  );
  const securityState = await page.evaluate(() => {
    const utility = document.getElementById("utilityCalculator");
    return {
      invoiceType: document.getElementById("invoiceType")?.value,
      invoiceNumber: document.getElementById("invoiceNumber")?.value,
      billingPeriod: document.getElementById("billingPeriod")?.value,
      securityPanelHidden: document.getElementById("securityDepositBatchPanel")?.hidden,
      securityRows: document.querySelectorAll("#securityDepositBatchList .cycle-row").length,
      utilityHidden: utility?.hidden,
      utilityDisplay: utility ? getComputedStyle(utility).display : "",
      lineTypes: [...document.querySelectorAll("[data-line-type]")].map((input) => input.value),
      lineAmounts: [...document.querySelectorAll("[data-line-amount]")].map((input) => input.value),
      batchButton: document.getElementById("createAllSecurityDepositInvoices")?.textContent?.trim(),
    };
  });
  assert(securityState.invoiceType === "security", `Expected security invoice, got ${securityState.invoiceType}.`);
  assert(
    expectedDepositInvoiceNumber.test(securityState.invoiceNumber || ""),
    `Expected deposit invoice number to match ${expectedDepositInvoiceNumber}, got ${securityState.invoiceNumber}.`
  );
  assert(
    securityState.billingPeriod === expectedRentPeriod,
    `Expected deposit period ${expectedRentPeriod}, got ${securityState.billingPeriod}.`
  );
  assert(securityState.securityPanelHidden === false, "Security tab must show the security deposit cycle panel.");
  assert(securityState.securityRows === 2, `Expected 2 security deposit rows, got ${securityState.securityRows}.`);
  assert(securityState.utilityHidden && securityState.utilityDisplay === "none", "Security tab must hide the utility calculator.");
  assert(
    securityState.lineTypes.join("|") === "Security Deposit",
    `Expected one Security Deposit line, got ${securityState.lineTypes.join("|")}.`
  );
  assert(securityState.lineAmounts[0] === "350", `Expected deposit amount 350, got ${securityState.lineAmounts[0]}.`);
  assert(
    securityState.batchButton === "Create all security deposits",
    `Expected security deposit batch button, got ${securityState.batchButton}.`
  );

  await page.click("#createAllSecurityDepositInvoices");
  await page.waitForFunction(() => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    return state.invoices?.filter((invoice) => invoice.invoiceType === "security").length === 2;
  });
  const securityBatchState = await page.evaluate(() => ({
    hash: window.location.hash,
    rows: [...document.querySelectorAll("#securityDepositBatchList .cycle-row")].map((row) => row.textContent.trim()),
    invoiceNumbers: (JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}").invoices || [])
      .filter((invoice) => invoice.invoiceType === "security")
      .map((invoice) => invoice.invoiceNumber),
    buttons: [...document.querySelectorAll("#securityDepositBatchList [data-toggle-paid-invoice]")].map((button) =>
      button.textContent.trim()
    ),
  }));
  assert(securityBatchState.hash === "#security", `Security batch should stay on the security workflow, got ${securityBatchState.hash}.`);
  assert(securityBatchState.rows.length === 2, `Expected 2 generated security rows, got ${securityBatchState.rows.length}.`);
  assert(securityBatchState.rows.every((row) => row.includes("Open")), `Security rows should show Open after batch create.`);
  assert(
    securityBatchState.invoiceNumbers.every((number) => expectedDepositInvoiceNumber.test(number)),
    `Batch deposit invoice numbers did not match ${expectedDepositInvoiceNumber}: ${securityBatchState.invoiceNumbers.join(", ")}.`
  );
  assert(
    securityBatchState.buttons.every((label) => label === "Mark paid"),
    `Expected Mark paid buttons, got ${securityBatchState.buttons.join("|")}.`
  );

  await page.fill("#credits", "200");
  await page.click("#saveInvoice");
  await page.waitForFunction(() => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    const invoice = (state.invoices || []).find((item) => item.invoiceType === "security" && item.tenantId === "andrew");
    return invoice?.credits === 200;
  });
  const creditedSecurityState = await page.evaluate(() => ({
    firstCardText: document.querySelector("#securityDepositBatchList .cycle-row")?.textContent.trim(),
    firstCardAmount: document.querySelector("#securityDepositBatchList .cycle-row > strong")?.textContent.trim(),
  }));
  assert(
    creditedSecurityState.firstCardText.includes("credits $200.00 applied"),
    `Expected credited security row to mention applied credit: ${creditedSecurityState.firstCardText}.`
  );
  assert(
    creditedSecurityState.firstCardAmount === "$150.00",
    `Expected credited security row balance $150.00, got ${creditedSecurityState.firstCardAmount}.`
  );

  await page.click("#securityDepositBatchList [data-toggle-paid-invoice]");
  await page.waitForFunction(() => document.getElementById("paymentDialog")?.hidden === false);
  const creditedPaymentDialog = await page.evaluate(() => document.getElementById("paymentDialogCopy")?.textContent?.trim());
  assert(
    creditedPaymentDialog.includes("Charges total $350.00.") &&
      creditedPaymentDialog.includes("credits $200.00 already applied.") &&
      creditedPaymentDialog.includes("Balance due is $150.00."),
    `Expected payment dialog to explain credited balance, got: ${creditedPaymentDialog}.`
  );
  await page.click("#paymentPartial");
  await page.fill("#partialPaymentAmount", "200");
  await page.click("#paymentPartialSave");
  const overpaymentToast = await page.locator("#toast").textContent();
  assert(
    overpaymentToast.includes("Payment cannot exceed the current balance due of $150.00"),
    `Expected overpayment toast to reference the $150.00 balance, got: ${overpaymentToast}.`
  );
  await page.fill("#partialPaymentAmount", "100");
  await page.click("#paymentPartialSave");
  const partialState = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    const invoice = (state.invoices || []).find((item) => item.invoiceType === "security" && item.tenantId === "andrew");
    return {
      firstCardText: document.querySelector("#securityDepositBatchList .cycle-row")?.textContent.trim(),
      firstToggle: document.querySelector("#securityDepositBatchList [data-toggle-paid-invoice]")?.textContent.trim(),
      status: invoice?.status,
      paymentTotal: (invoice?.payments || []).reduce((total, payment) => total + Number(payment.amount || 0), 0),
      remainingTotal:
        (invoice?.lineItems || []).reduce((total, item) => total + Number(item.amount || 0), 0) -
        Number(invoice?.credits || 0) -
        (invoice?.payments || []).reduce((total, payment) => total + Number(payment.amount || 0), 0),
    };
  });
  assert(
    partialState.firstCardText.includes("Partially paid"),
    `Expected first security invoice to show Partially paid: ${partialState.firstCardText}.`
  );
  assert(partialState.firstToggle === "Mark paid", `Expected Mark paid after partial payment, got ${partialState.firstToggle}.`);
  assert(partialState.status === "partial", `Expected stored partial status, got ${partialState.status}.`);
  assert(partialState.paymentTotal === 100, `Expected stored payment total 100, got ${partialState.paymentTotal}.`);
  assert(partialState.remainingTotal === 50, `Expected remaining balance 50, got ${partialState.remainingTotal}.`);

  await page.click("#securityDepositBatchList [data-toggle-paid-invoice]");
  await page.waitForFunction(() => document.getElementById("paymentDialog")?.hidden === false);
  await page.click("#paymentFull");
  const fullAfterPartialState = await page.evaluate(() => ({
    firstCardText: document.querySelector("#securityDepositBatchList .cycle-row")?.textContent.trim(),
    firstToggle: document.querySelector("#securityDepositBatchList [data-toggle-paid-invoice]")?.textContent.trim(),
  }));
  assert(
    fullAfterPartialState.firstCardText.includes("Paid"),
    `Expected first security invoice to show Paid after full payment: ${fullAfterPartialState.firstCardText}.`
  );
  assert(fullAfterPartialState.firstToggle === "Reopen", `Expected Reopen after full payment, got ${fullAfterPartialState.firstToggle}.`);

  await page.evaluate(
    ({ rentPeriod, utilityPeriod }) => {
      const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
      const tenantIds = (state.tenants || []).map((tenant) => tenant.id);
      const tenantFor = (index) => tenantIds[index % tenantIds.length] || "andrew";
      const invoices = [];
      for (let index = 0; index < 12; index += 1) {
        const isUtility = index % 3 === 1;
        const isSecurity = index % 3 === 2;
        const prefix = isUtility ? "UTL" : isSecurity ? "DEP" : "RNT";
        const invoiceType = isUtility ? "utility" : isSecurity ? "security" : "rent";
        const lineType = isUtility ? "Utility" : isSecurity ? "Security Deposit" : "Rent";
        invoices.push({
          id: `overview-current-${index}`,
          tenantId: tenantFor(index),
          invoiceType,
          invoiceNumber: `${prefix}-2099-01-${String(index + 1).padStart(4, "0")}`,
          issueDate: "2026-07-01",
          dueDate: "2026-07-01",
          billingPeriod: isUtility ? utilityPeriod : rentPeriod,
          lineItems: [{ type: lineType, description: `${lineType} overview test`, amount: 100 + index }],
          previousBalance: 0,
          credits: 0,
          payments: [],
          status: "open",
          updatedAt: "2026-07-01T12:00:00.000Z",
        });
      }
      invoices.push({
        id: "overview-old-cycle",
        tenantId: tenantFor(0),
        invoiceType: "rent",
        invoiceNumber: "RNT-2099-01-9999",
        issueDate: "2026-05-01",
        dueDate: "2026-05-01",
        billingPeriod: "May 2026",
        lineItems: [{ type: "Rent", description: "Old rent", amount: 999 }],
        previousBalance: 0,
        credits: 0,
        payments: [],
        status: "open",
        updatedAt: "2026-05-01T12:00:00.000Z",
      });
      state.invoices = invoices;
      localStorage.setItem("rent-ledger:v1", JSON.stringify(state));
    },
    { rentPeriod: expectedRentPeriod, utilityPeriod: expectedUtilityPeriod }
  );
  await page.evaluate(() => {
    window.location.hash = "#overview";
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelectorAll("#overviewInvoiceList .invoice-card").length === 12);
  const fullOverviewState = await page.evaluate(() => ({
    savedCount: document.getElementById("invoiceWorkflowCount")?.textContent?.trim(),
    invoiceCards: document.querySelectorAll("#overviewInvoiceList .invoice-card").length,
    overviewText: document.getElementById("overviewInvoiceList")?.textContent || "",
  }));
  assert(
    fullOverviewState.savedCount === "12 saved this cycle",
    `Expected overview to count 12 current-cycle invoices, got ${fullOverviewState.savedCount}.`
  );
  assert(
    fullOverviewState.invoiceCards === 12,
    `Expected overview to render all 12 current-cycle invoices, got ${fullOverviewState.invoiceCards}.`
  );
  assert(
    !fullOverviewState.overviewText.includes("RNT-2099-01-9999"),
    "Overview should not include old-cycle invoices."
  );

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
    [
      "Not connected. Click Connect Drive.",
      "Google Drive confirmation was cancelled or expired.",
      "Google confirmation needed for saving invoice...",
      "Google confirmation needed for saving security deposit invoices...",
    ].includes(settingsState.driveStatus),
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
