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
  const pageErrors = [];
  page.on("pageerror", (error) => {
    const detail = error?.stack || error?.message || String(error);
    pageErrors.push(detail);
    console.error(`Browser page error: ${detail}`);
  });
  const rentCycleDate = currentRentCycleDate();
  const expectedRentPeriod = monthLabel(rentCycleDate);
  const expectedUtilityPeriod = monthLabel(previousMonthDate(rentCycleDate));
  const historicalPeriod = "January 2000";
  const expectedRentInvoiceNumber = invoiceNumberPattern("RNT", rentCycleDate);
  const expectedUtilityInvoiceNumber = invoiceNumberPattern("UTL", previousMonthDate(rentCycleDate));
  const expectedDepositInvoiceNumber = invoiceNumberPattern("DEP", rentCycleDate);
  await page.addInitScript((version) => {
    window.__RENT_LEDGER_ENABLE_TEST_HOOKS__ = true;
    sessionStorage.setItem(`rent-ledger:splash-seen:${version}`, "true");
    sessionStorage.setItem(`rent-ledger:refreshed:${version}`, "1");
  }, appVersion);
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

  const seedInitialFixture = (version) => {
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
  };
  let fixtureSeedError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.evaluate(seedInitialFixture, appVersion);
      fixtureSeedError = null;
      break;
    } catch (error) {
      fixtureSeedError = error;
      if (!String(error?.message || error).includes("Execution context was destroyed")) throw error;
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(100);
    }
  }
  if (fixtureSeedError) throw fixtureSeedError;

  await page.reload({ waitUntil: "networkidle" });

  const driveLockOrder = await page.evaluate(async () => {
    const order = [];
    let signalStarted;
    let releaseFirst;
    const started = new Promise((resolve) => {
      signalStarted = resolve;
    });
    const gate = new Promise((resolve) => {
      releaseFirst = resolve;
    });
    const first = window.__rentLedgerTest.withDriveStateLock(async () => {
      order.push("first-start");
      signalStarted();
      await gate;
      order.push("first-end");
    });
    await started;
    const second = window.__rentLedgerTest.withDriveStateLock(async () => {
      order.push("second");
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    order.push("release");
    releaseFirst();
    await Promise.all([first, second]);
    return order;
  });
  assert(
    driveLockOrder.join("|") === "first-start|release|first-end|second",
    `Drive operation lock should serialize replacement and artifact work across tabs, got ${driveLockOrder.join("|")}.`
  );
  const artifactFingerprintChanges = await page.evaluate(() => {
    const tenantId = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}").tenants?.[0]?.id || "";
    const invoice = {
      id: "fingerprint-test",
      tenantId,
      invoiceType: "rent",
      invoiceNumber: "RNT-2000-01-0001",
      issueDate: "2000-01-01",
      dueDate: "2000-01-01",
      billingPeriod: "January 2000",
      lineItems: [{ type: "Rent", description: "Rent", amount: 100 }],
      payments: [],
      notes: "Original",
      status: "open",
    };
    const before = window.__rentLedgerTest.invoiceArtifactFingerprint(invoice);
    const after = window.__rentLedgerTest.invoiceArtifactFingerprint({ ...invoice, notes: "Changed" });
    return before !== after;
  });
  assert(artifactFingerprintChanges, "Invoice artifact fingerprint should change when PDF source data changes.");

  const overviewState = await page.evaluate(() => ({
    hash: window.location.hash,
    overviewActive: document.getElementById("view-overview")?.classList.contains("is-active"),
    workflowButtons: [...document.querySelectorAll(".workflow-button span")].map((button) => button.textContent.trim()),
    rentCount: document.getElementById("rentWorkflowCount")?.textContent?.trim(),
    utilityCount: document.getElementById("utilityWorkflowCount")?.textContent?.trim(),
    securityDepositCount: document.getElementById("securityDepositWorkflowCount")?.textContent?.trim(),
    healthScore: document.getElementById("billingHealthScore")?.textContent?.trim(),
    healthText: document.getElementById("billingHealthList")?.textContent || "",
    actionText: document.getElementById("billingActionList")?.textContent || "",
    overdueText: document.getElementById("delinquencyList")?.textContent || "",
    communicationText: document.getElementById("communicationDraftList")?.textContent || "",
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
  assert(/^\d+%$/.test(overviewState.healthScore || ""), `Expected health score percentage, got ${overviewState.healthScore}.`);
  assert(overviewState.healthText.includes("Tenant email missing"), "Health checks should flag missing tenant emails.");
  assert(overviewState.actionText.includes("Create rent invoices"), "Action list should include rent billing work.");
  assert(overviewState.overdueText.includes("No overdue open balances"), "Overdue list should start clear.");
  assert(overviewState.communicationText.includes("No open invoice messages"), "Communication queue should start empty.");
  assert(
    Math.abs(overviewState.settingsWidth + 2 - overviewState.navWidth) <= 1,
    `Expected Settings to fill the bottom nav row, got ${overviewState.settingsWidth} of ${overviewState.navWidth}.`
  );

  await page.click('#billingHealthList [data-open-view="tenants"]');
  const healthTenantActionState = await page.evaluate(() => ({
    hash: window.location.hash,
    tenantsActive: document.getElementById("view-tenants")?.classList.contains("is-active"),
  }));
  assert(
    healthTenantActionState.hash === "#tenants" && healthTenantActionState.tenantsActive,
    `Billing health tenant action should open Tenants, got hash ${healthTenantActionState.hash}.`
  );
  await page.click('[data-view="overview"]');
  await page.waitForFunction(() => document.getElementById("view-overview")?.classList.contains("is-active"));

  const longPdfState = await page.evaluate(async ({ rentPeriod }) => {
    const lineItems = Array.from({ length: 46 }, (_, index) => ({
      type: index % 2 ? "Fee" : "Rent",
      description: `Long invoice line ${index + 1} with enough descriptive text to exercise wrapping and page breaks.`,
      amount: 25 + index,
    }));
    const blob = window.__rentLedgerTest.createInvoicePdfBlob({
      id: "long-pdf-test",
      tenantId: "andrew",
      invoiceType: "rent",
      invoiceNumber: "RNT-2099-01-9998",
      issueDate: "2026-07-01",
      dueDate: "2026-07-01",
      billingPeriod: rentPeriod,
      lineItems,
      previousBalance: 0,
      credits: 0,
      payments: [],
      paymentInstructions: "Pay test.",
      notes: "Long PDF pagination test note.",
      status: "open",
    });
    const text = await blob.text();
    const pageCount = (text.match(/\/Type \/Page\b/g) || []).length;
    return {
      blobType: blob.type,
      pageCount,
      hasMatchingCount: text.includes(`/Count ${pageCount}`),
      hasXref: text.includes("xref"),
    };
  }, { rentPeriod: expectedRentPeriod });
  assert(longPdfState.blobType === "application/pdf", `Expected PDF blob type, got ${longPdfState.blobType}.`);
  assert(longPdfState.pageCount >= 2, `Expected long invoice PDF to paginate, got ${longPdfState.pageCount} page.`);
  assert(longPdfState.hasMatchingCount, "PDF page tree count should match generated pages.");
  assert(longPdfState.hasXref, "Generated PDF must include a cross-reference table.");

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

  const dialogMessages = [];
  let nextDialogAction = "accept";
  page.on("dialog", async (dialog) => {
    dialogMessages.push(dialog.message());
    if (nextDialogAction === "dismiss") {
      nextDialogAction = "accept";
      await dialog.dismiss();
      return;
    }
    await dialog.accept();
  });
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

    const notes = document.getElementById("invoiceNotes");
    notes.value = "Edited after Drive save";
    notes.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("invoiceForm").requestSubmit();
  });
  await page.waitForFunction(
    (invoiceId) => {
      const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
      const invoice = (state.invoices || []).find((item) => item.id === invoiceId);
      return invoice?.notes === "Edited after Drive save" && document.getElementById("saveState")?.textContent?.trim() === "Saved locally";
    },
    driveSavedInvoiceId
  );
  const editedDriveState = await page.evaluate((invoiceId) => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    const invoice = (state.invoices || []).find((item) => item.id === invoiceId);
    return {
      drivePdfFileId: invoice?.drivePdfFileId || "",
      driveSavedAt: invoice?.driveSavedAt || "",
      invoiceStatus: document.getElementById("invoiceStatus")?.textContent?.trim(),
      saveState: document.getElementById("saveState")?.textContent?.trim(),
    };
  }, driveSavedInvoiceId);
  assert(!editedDriveState.drivePdfFileId, "Edited invoice should clear stale Drive PDF metadata before an immediate save.");
  assert(!editedDriveState.driveSavedAt, "Edited invoice should clear stale Drive saved timestamp before an immediate save.");
  assert(
    editedDriveState.invoiceStatus === "Saved locally" && editedDriveState.saveState === "Saved locally",
    `Expected edited Drive invoice to show Saved locally after mocked Drive failure, got ${editedDriveState.invoiceStatus}/${editedDriveState.saveState}.`
  );

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
    const input = document.getElementById("cycleUtilityElectric");
    input.value = "12.50";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(100);
  const cycleDecimalInput = await page.locator("#cycleUtilityElectric").inputValue();
  assert(cycleDecimalInput === "12.50", `Cycle utility input should not be normalized while typing, got ${cycleDecimalInput}.`);

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

  await page.evaluate(({ priorPeriod, historicalDepositPeriod }) => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    const depositInvoices = (state.invoices || []).filter((invoice) => invoice.invoiceType === "security");
    depositInvoices.forEach((invoice) => {
      invoice.billingPeriod = priorPeriod;
      invoice.issueDate = "2026-06-15";
      invoice.dueDate = "2026-07-01";
      if (invoice.tenantId === "brenda") {
        invoice.status = "partial";
        invoice.payments = [
          {
            id: "prior-deposit-partial-payment",
            date: "2026-07-10",
            amount: 200,
            method: "Partial payment",
          },
        ];
      }
    });
    const originalDeposit = depositInvoices.find((invoice) => invoice.tenantId === "andrew");
    state.invoices.push({
      ...originalDeposit,
      id: "legacy-duplicate-deposit",
      invoiceNumber: "DEP-2000-01-0001",
      issueDate: "2000-01-15",
      dueDate: "2000-02-01",
      billingPeriod: historicalDepositPeriod,
      credits: 0,
      payments: [],
      status: "open",
      updatedAt: "2000-01-15T12:00:00.000Z",
    });
    localStorage.setItem("rent-ledger:v1", JSON.stringify(state));
    window.location.hash = "#overview";
  }, { priorPeriod: expectedUtilityPeriod, historicalDepositPeriod: historicalPeriod });
  await page.reload({ waitUntil: "networkidle" });
  try {
    await page.waitForFunction(
      ({ cycleCount, completeCopy }) =>
        document.getElementById("securityDepositWorkflowCount")?.textContent?.trim() === "0 remaining" &&
        document.getElementById("invoiceWorkflowCount")?.textContent?.trim() === cycleCount &&
        (document.getElementById("cycleMissingSecurityDeposits")?.textContent || "").includes(completeCopy),
      { cycleCount: "4 saved this cycle", completeCopy: "one-time security deposit invoice" },
      { timeout: 5000 }
    );
  } catch (error) {
    failures.push(
      `Historical deposit state did not render after reload: ${error.message}. Page errors: ${
        pageErrors.length ? pageErrors.join(" | ") : "none captured"
      }.`
    );
  }

  const historicalDepositOverview = await page.evaluate(() => ({
    depositCount: document.getElementById("securityDepositWorkflowCount")?.textContent?.trim(),
    missingText: document.getElementById("cycleMissingSecurityDeposits")?.textContent || "",
    actionText: document.getElementById("billingActionList")?.textContent || "",
    cycleInvoiceCount: document.getElementById("invoiceWorkflowCount")?.textContent?.trim(),
    cycleDepositCards: [...document.querySelectorAll("#overviewInvoiceList .invoice-card")].filter((card) =>
      card.textContent.includes("Security Deposit Invoice")
    ).length,
  }));
  assert(
    historicalDepositOverview.depositCount === "0 remaining",
    `Prior-period paid and partial deposit invoices should leave 0 remaining, got ${historicalDepositOverview.depositCount}.`
  );
  assert(
    historicalDepositOverview.missingText.includes("one-time security deposit invoice"),
    `Expected historical issuance completion copy, got: ${historicalDepositOverview.missingText}.`
  );
  assert(
    !historicalDepositOverview.actionText.includes("Create security deposit invoices"),
    "Prior-period deposit invoices should remove the create-deposit next action."
  );
  assert(
    historicalDepositOverview.cycleInvoiceCount === "4 saved this cycle" &&
      historicalDepositOverview.cycleDepositCards === 0,
    `Prior-period deposits must stay out of Cycle Invoices, got ${historicalDepositOverview.cycleInvoiceCount} and ${historicalDepositOverview.cycleDepositCards} deposit cards.`
  );

  await page.click('[data-view="security"]');
  const historicalDepositWorkflow = await page.evaluate(() => ({
    copy: document.getElementById("securityDepositBatchCopy")?.textContent?.trim(),
    rows: [...document.querySelectorAll("#securityDepositBatchList .cycle-row")].map((row) => row.textContent.trim()),
    batchDisabled: document.getElementById("createAllSecurityDepositInvoices")?.disabled,
    createButtons: document.querySelectorAll("#securityDepositBatchList [data-create-security-deposit-invoice]").length,
  }));
  assert(
    historicalDepositWorkflow.copy.includes("one-time security deposit invoice") &&
      historicalDepositWorkflow.copy.includes("Payment status does not create another invoice"),
    `Expected one-time deposit workflow copy, got: ${historicalDepositWorkflow.copy}.`
  );
  assert(
    historicalDepositWorkflow.rows[0]?.includes("Paid") &&
      historicalDepositWorkflow.rows[1]?.includes("Partially paid") &&
      historicalDepositWorkflow.rows.every((row) => row.includes(`issued for ${expectedUtilityPeriod}`)),
    `Expected paid and partial prior-period deposit rows, got: ${historicalDepositWorkflow.rows.join(" | ")}.`
  );
  assert(historicalDepositWorkflow.batchDisabled === true, "Deposit batch creation must disable after historical issuance.");
  assert(historicalDepositWorkflow.createButtons === 0, "Issued tenants must not show another deposit Create button.");

  await page.click("#saveInvoice");
  await page.waitForFunction(() => document.getElementById("toast")?.textContent?.includes("already exists for this tenant"));
  const duplicateDepositState = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    return {
      count: (state.invoices || []).filter((invoice) => invoice.invoiceType === "security").length,
      selectedNumber: document.getElementById("invoiceNumber")?.value,
    };
  });
  assert(duplicateDepositState.count === 3, `Manual Save must not create a fourth deposit invoice, got ${duplicateDepositState.count}.`);
  assert(
    duplicateDepositState.selectedNumber?.startsWith("DEP-"),
    `Duplicate prevention should open the existing deposit invoice, got ${duplicateDepositState.selectedNumber}.`
  );

  await page.click('[data-view="invoices"]');
  await page.click('#invoiceHistory [data-load-invoice="legacy-duplicate-deposit"]');
  await page.fill("#invoiceNotes", "Edited legacy duplicate without creating another invoice");
  await page.click("#saveInvoice");
  await page.waitForFunction(() => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    const legacyInvoice = (state.invoices || []).find((invoice) => invoice.id === "legacy-duplicate-deposit");
    return legacyInvoice?.notes === "Edited legacy duplicate without creating another invoice";
  });
  const legacyDuplicateEditState = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    return {
      depositCount: (state.invoices || []).filter((invoice) => invoice.invoiceType === "security").length,
      selectedNumber: document.getElementById("invoiceNumber")?.value,
    };
  });
  assert(
    legacyDuplicateEditState.depositCount === 3 && legacyDuplicateEditState.selectedNumber === "DEP-2000-01-0001",
    `Editing a legacy duplicate should preserve all three records and the selected invoice, got ${legacyDuplicateEditState.depositCount}/${legacyDuplicateEditState.selectedNumber}.`
  );

  const depositRetargetBefore = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    const targetInvoice = (state.invoices || []).find(
      (invoice) => invoice.invoiceType === "security" && invoice.tenantId === "brenda"
    );
    return {
      count: (state.invoices || []).filter((invoice) => invoice.invoiceType === "security").length,
      sourceTenantId: (state.invoices || []).find((invoice) => invoice.id === "legacy-duplicate-deposit")?.tenantId,
      targetInvoiceNumber: targetInvoice?.invoiceNumber,
    };
  });
  await page.selectOption("#tenantSelect", "brenda");
  await page.click("#saveInvoice");
  await page.waitForFunction(
    (targetInvoiceNumber) =>
      document.getElementById("toast")?.textContent?.includes("already exists for this tenant") &&
      document.getElementById("invoiceNumber")?.value === targetInvoiceNumber,
    depositRetargetBefore.targetInvoiceNumber
  );
  const depositRetargetAfter = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    return {
      count: (state.invoices || []).filter((invoice) => invoice.invoiceType === "security").length,
      sourceTenantId: (state.invoices || []).find((invoice) => invoice.id === "legacy-duplicate-deposit")?.tenantId,
      openedTenantId: document.getElementById("tenantSelect")?.value,
      openedInvoiceNumber: document.getElementById("invoiceNumber")?.value,
      toast: document.getElementById("toast")?.textContent?.trim(),
    };
  });
  assert(
    depositRetargetBefore.sourceTenantId === "andrew" &&
      depositRetargetAfter.sourceTenantId === "andrew" &&
      depositRetargetAfter.count === depositRetargetBefore.count,
    `Blocked deposit retarget should preserve the source tenant and invoice count, got ${depositRetargetAfter.sourceTenantId}/${depositRetargetAfter.count}.`
  );
  assert(
    depositRetargetAfter.openedTenantId === "brenda" &&
      depositRetargetAfter.openedInvoiceNumber === depositRetargetBefore.targetInvoiceNumber &&
      depositRetargetAfter.toast.includes("already exists for this tenant"),
    `Blocked deposit retarget should open Brenda's existing invoice, got ${depositRetargetAfter.openedTenantId}/${depositRetargetAfter.openedInvoiceNumber}/${depositRetargetAfter.toast}.`
  );

  await page.click('[data-view="invoices"]');
  const paidDepositId = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    return (state.invoices || []).find((invoice) => invoice.invoiceType === "security" && invoice.status === "paid")?.id;
  });
  const dialogsBeforeDepositDelete = dialogMessages.length;
  nextDialogAction = "dismiss";
  await page.click(`#invoiceHistory [data-delete-invoice="${paidDepositId}"]`);
  const depositDeleteMessages = dialogMessages.slice(dialogsBeforeDepositDelete);
  assert(
    depositDeleteMessages.some(
      (message) => message.includes("removes one issuance record") && message.includes("may make")
    ),
    `Individual deposit deletion should explain the issuance consequence, got: ${depositDeleteMessages.join(" | ")}.`
  );

  const dialogsBeforePaidCleanup = dialogMessages.length;
  await page.click("#clearPaid");
  await page.waitForFunction(() => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    return !(state.invoices || []).some(
      (invoice) => invoice.status === "paid" && invoice.invoiceType !== "security"
    );
  });
  const paidCleanupState = await page.evaluate((depositId) => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    return {
      depositRetained: (state.invoices || []).some((invoice) => invoice.id === depositId),
      depositCount: (state.invoices || []).filter((invoice) => invoice.invoiceType === "security").length,
      auditMessage: state.auditEvents?.[0]?.message || "",
      toast: document.getElementById("toast")?.textContent?.trim(),
    };
  }, paidDepositId);
  const paidCleanupMessages = dialogMessages.slice(dialogsBeforePaidCleanup);
  assert(
    paidCleanupMessages.some((message) => message.includes("will be retained as one-time issuance records")),
    `Paid cleanup should explain deposit retention, got: ${paidCleanupMessages.join(" | ")}.`
  );
  assert(paidCleanupState.depositRetained, "Bulk paid cleanup must retain the paid security deposit invoice.");
  assert(paidCleanupState.depositCount === 3, `Bulk paid cleanup must retain all deposit records, got ${paidCleanupState.depositCount}.`);
  assert(
    paidCleanupState.auditMessage === "Deleted 1 paid non-deposit invoice; retained 1 paid security deposit invoice",
    `Paid cleanup audit should report exact deleted and retained counts, got: ${paidCleanupState.auditMessage}.`
  );
  assert(
    paidCleanupState.toast.includes("paid security deposit invoice was retained"),
    `Paid cleanup toast should confirm retention, got: ${paidCleanupState.toast}.`
  );

  const invoiceCountBeforeDepositOnlyCleanup = await page.evaluate(() => {
    return (JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}").invoices || []).length;
  });
  const dialogsBeforeDepositOnlyCleanup = dialogMessages.length;
  await page.click("#clearPaid");
  const depositOnlyCleanupState = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    return {
      invoiceCount: (state.invoices || []).length,
      toast: document.getElementById("toast")?.textContent?.trim(),
    };
  });
  assert(
    depositOnlyCleanupState.invoiceCount === invoiceCountBeforeDepositOnlyCleanup &&
      dialogMessages.length === dialogsBeforeDepositOnlyCleanup,
    "When all paid records are deposits, bulk cleanup should retain state without opening a confirmation."
  );
  assert(
    depositOnlyCleanupState.toast === "Paid security deposit invoices are retained as one-time issuance records.",
    `Unexpected deposit-only cleanup message: ${depositOnlyCleanupState.toast}.`
  );

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
    reportButtons: [...document.querySelectorAll(".report-tools .button-row button")].map((button) => button.textContent.trim()),
    lockButtons: [...document.querySelectorAll(".lock-tools .button-row button")].map((button) => button.textContent.trim()),
    driveStatus: document.getElementById("driveStatus")?.textContent?.trim(),
    help: document.querySelector(".drive-tools > .field-help")?.textContent?.trim(),
    auditText: document.getElementById("auditTrailList")?.textContent || "",
    closedPeriodText: document.getElementById("closedPeriodList")?.textContent || "",
    hasSaveConnection: document.body.textContent.includes("Save connection settings"),
  }));
  assert(
    settingsState.buttons.join("|") === "Connect Drive|Download from Drive|Upload to Drive",
    `Unexpected Drive buttons: ${settingsState.buttons.join("|")}.`
  );
  assert(
    settingsState.reportButtons.join("|") === "Invoice CSV|Tenant balances CSV|Audit CSV",
    `Unexpected report buttons: ${settingsState.reportButtons.join("|")}.`
  );
  assert(
    settingsState.lockButtons.join("|") === "Lock current cycle|Unlock current cycle",
    `Unexpected lock buttons: ${settingsState.lockButtons.join("|")}.`
  );
  assert(settingsState.auditText.includes("invoice"), `Expected audit trail to include saved activity, got: ${settingsState.auditText}.`);
  assert(settingsState.closedPeriodText.includes("No billing periods are locked"), "Closed period list should start unlocked.");
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

  await page.click("#lockCurrentCycle");
  await page.waitForFunction(() => {
    const closedPeriods = JSON.parse(localStorage.getItem("rent-ledger:closed-periods:v1") || "[]");
    return closedPeriods.length >= 2;
  });
  const lockedState = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    return {
      closedPeriods: state.closedPeriods || [],
      canonicalClosedPeriods: JSON.parse(localStorage.getItem("rent-ledger:closed-periods:v1") || "[]"),
      auditMessages: (state.auditEvents || []).map((event) => event.message),
      lockDisabled: document.getElementById("lockCurrentCycle")?.disabled,
      unlockDisabled: document.getElementById("unlockCurrentCycle")?.disabled,
      closedPeriodText: document.getElementById("closedPeriodList")?.textContent || "",
    };
  });
  assert(lockedState.lockDisabled === true, "Lock current cycle should disable after locking.");
  assert(lockedState.unlockDisabled === false, "Unlock current cycle should enable after locking.");
  assert(
    lockedState.closedPeriods.some((period) => period.label === expectedRentPeriod) &&
      lockedState.closedPeriods.some((period) => period.label === expectedUtilityPeriod),
    `Expected locked rent and utility periods, got ${lockedState.closedPeriods.map((period) => period.label).join(", ")}.`
  );
  assert(
    lockedState.canonicalClosedPeriods.some((period) => period.label === expectedRentPeriod) &&
      lockedState.canonicalClosedPeriods.some((period) => period.label === expectedUtilityPeriod),
    "Lock current cycle should persist the exact rent and utility periods to the canonical lock record."
  );
  assert(
    lockedState.auditMessages.some(
      (message) => message.includes("Locked billing periods") &&
        message.includes(expectedRentPeriod) &&
        message.includes(expectedUtilityPeriod)
    ),
    "Lock audit copy should name the exact rent and utility periods."
  );
  assert(
    lockedState.closedPeriodText.includes(expectedRentPeriod) && lockedState.closedPeriodText.includes(expectedUtilityPeriod),
    `Closed period list should render locked periods, got: ${lockedState.closedPeriodText}.`
  );

  await page.reload({ waitUntil: "networkidle" });
  const reloadedLockState = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    return {
      closedPeriods: state.closedPeriods || [],
      lockDisabled: document.getElementById("lockCurrentCycle")?.disabled,
      unlockDisabled: document.getElementById("unlockCurrentCycle")?.disabled,
    };
  });
  assert(reloadedLockState.closedPeriods.length >= 2, "Current-cycle locks should persist after a reload.");
  assert(
    reloadedLockState.lockDisabled === true && reloadedLockState.unlockDisabled === false,
    "Reloaded current-cycle lock controls should retain their locked state."
  );

  await page.evaluate((period) => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    state.closedPeriods = [...(state.closedPeriods || []), { label: period, lockedAt: "2000-02-01T00:00:00.000Z" }];
    localStorage.setItem("rent-ledger:closed-periods:v1", JSON.stringify(state.closedPeriods));
    localStorage.setItem("rent-ledger:v1", JSON.stringify(state));
  }, historicalPeriod);
  await page.reload({ waitUntil: "networkidle" });

  const dialogsBeforeUnlockCancel = dialogMessages.length;
  nextDialogAction = "dismiss";
  await page.click("#unlockCurrentCycle");
  await page.waitForTimeout(100);
  const cancelledCurrentUnlock = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    return state.closedPeriods || [];
  });
  assert(cancelledCurrentUnlock.length >= 3, "Cancelling current-cycle unlock should retain every lock.");
  assert(
    dialogMessages
      .slice(dialogsBeforeUnlockCancel)
      .some((message) => message.includes("Unlock the current-cycle safeguards")),
    "Current-cycle unlock should explain which safeguards will be removed."
  );

  await page.click("#unlockCurrentCycle");
  await page.waitForFunction((period) => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    return (state.closedPeriods || []).length === 1 && state.closedPeriods[0]?.label === period;
  }, historicalPeriod);
  const currentUnlockState = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    return {
      lockDisabled: document.getElementById("lockCurrentCycle")?.disabled,
      unlockDisabled: document.getElementById("unlockCurrentCycle")?.disabled,
      closedPeriodText: document.getElementById("closedPeriodList")?.textContent || "",
      auditMessages: (state.auditEvents || []).map((event) => event.message),
    };
  });
  assert(
    currentUnlockState.lockDisabled === false && currentUnlockState.unlockDisabled === true,
    "Unlock current cycle should leave only historical locks and re-enable Lock current cycle."
  );
  assert(
    currentUnlockState.closedPeriodText.includes(historicalPeriod),
    "Unlock current cycle must not silently remove a historical period lock."
  );
  assert(
    currentUnlockState.auditMessages.some(
      (message) => message.includes("Unlocked billing periods") &&
        message.includes(expectedRentPeriod) &&
        message.includes(expectedUtilityPeriod)
    ),
    "Current-cycle unlock audit copy should name the exact rent and utility periods."
  );

  const historicalUnlockSelector = `[data-unlock-period="${historicalPeriod.toLowerCase()}"]`;
  nextDialogAction = "dismiss";
  await page.click(historicalUnlockSelector);
  await page.waitForTimeout(100);
  const cancelledHistoricalUnlock = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    return state.closedPeriods || [];
  });
  assert(cancelledHistoricalUnlock.length === 1, "Cancelling a historical unlock should keep that period locked.");

  await page.click(historicalUnlockSelector);
  await page.waitForFunction(() => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    return (state.closedPeriods || []).length === 0;
  });
  assert(
    (await page.locator("#closedPeriodList").textContent()).includes("No billing periods are locked"),
    "Confirming a historical unlock should remove the exact listed period."
  );

  const synchronizedPage = await context.newPage();
  await synchronizedPage.addInitScript((version) => {
    window.__RENT_LEDGER_ENABLE_TEST_HOOKS__ = true;
    sessionStorage.setItem(`rent-ledger:splash-seen:${version}`, "true");
    sessionStorage.setItem(`rent-ledger:refreshed:${version}`, "1");
  }, appVersion);
  await synchronizedPage.route("**/sw.js", (route) => route.abort());
  await synchronizedPage.goto(`${baseUrl}#settings`, { waitUntil: "networkidle" });
  await synchronizedPage.fill("#landlordName", "UNSAVED CROSS-TAB LANDLORD");
  await synchronizedPage.click('[data-view="tenants"]');
  await synchronizedPage.fill("#tenantMemo", "Keep this unsaved tenant edit during lock sync.");
  await synchronizedPage.click('[data-view="rent"]');
  await synchronizedPage.fill("#invoiceNumber", "UNSAVED-CROSS-TAB-DRAFT");
  await synchronizedPage.fill("#billingPeriod", historicalPeriod);
  await synchronizedPage.fill("#invoiceNotes", "Keep this unsaved draft when another tab changes locks.");
  await page.click("#lockCurrentCycle");
  await synchronizedPage.waitForFunction(
    ({ rentPeriod, utilityPeriod }) => {
      const closedPeriods = JSON.parse(localStorage.getItem("rent-ledger:closed-periods:v1") || "[]");
      const text = document.getElementById("closedPeriodList")?.textContent || "";
      return (
        closedPeriods.length >= 2 && text.includes(rentPeriod) && text.includes(utilityPeriod)
      );
    },
    { rentPeriod: expectedRentPeriod, utilityPeriod: expectedUtilityPeriod }
  );
  const synchronizedLockState = await synchronizedPage.evaluate(() => ({
    lockDisabled: document.getElementById("lockCurrentCycle")?.disabled,
    unlockDisabled: document.getElementById("unlockCurrentCycle")?.disabled,
    invoiceNumber: document.getElementById("invoiceNumber")?.value,
    billingPeriod: document.getElementById("billingPeriod")?.value,
    invoiceNotes: document.getElementById("invoiceNotes")?.value,
    saveState: document.getElementById("saveState")?.textContent?.trim(),
    landlordName: document.getElementById("landlordName")?.value,
    tenantMemo: document.getElementById("tenantMemo")?.value,
  }));
  assert(
    synchronizedLockState.lockDisabled === true && synchronizedLockState.unlockDisabled === false,
    "A second open tab should refresh its period-lock controls after another tab locks the cycle."
  );
  assert(
    synchronizedLockState.invoiceNumber === "UNSAVED-CROSS-TAB-DRAFT" &&
      synchronizedLockState.billingPeriod === historicalPeriod &&
      synchronizedLockState.invoiceNotes === "Keep this unsaved draft when another tab changes locks." &&
      synchronizedLockState.saveState === "Draft",
    "A second tab must preserve its unsaved new invoice draft while applying an external lock update."
  );
  assert(
    synchronizedLockState.landlordName === "UNSAVED CROSS-TAB LANDLORD" &&
      synchronizedLockState.tenantMemo === "Keep this unsaved tenant edit during lock sync.",
    "Scoped lock synchronization must preserve unsaved landlord and tenant forms in another tab."
  );
  await page.click("#unlockCurrentCycle");
  await synchronizedPage.waitForFunction(() => {
    const closedPeriods = JSON.parse(localStorage.getItem("rent-ledger:closed-periods:v1") || "[]");
    return (
      closedPeriods.length === 0 &&
      (document.getElementById("closedPeriodList")?.textContent || "").includes("No billing periods are locked") &&
      document.getElementById("invoiceNumber")?.value === "UNSAVED-CROSS-TAB-DRAFT" &&
      document.getElementById("landlordName")?.value === "UNSAVED CROSS-TAB LANDLORD" &&
      document.getElementById("tenantMemo")?.value === "Keep this unsaved tenant edit during lock sync."
    );
  });

  const replacementFixture = await page.evaluate(() => {
    const replacement = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    replacement.landlord.name = "AUTHORITATIVE REPLACEMENT LANDLORD";
    if (replacement.tenants?.[0]) {
      replacement.tenants[0].memo = "Authoritative replacement tenant memo.";
    }
    const invoiceCount = replacement.invoices?.length || 0;
    const marker = JSON.stringify({ id: "smoke-full-replacement", replacedAt: new Date().toISOString() });
    localStorage.setItem("rent-ledger:v1", JSON.stringify(replacement));
    localStorage.setItem("rent-ledger:state-replacement:v1", marker);
    return { invoiceCount, marker };
  });
  await synchronizedPage.waitForFunction(
    (marker) =>
      localStorage.getItem("rent-ledger:state-replacement:v1") === marker &&
      (document.getElementById("toast")?.textContent || "").includes("Open forms are preserved"),
    replacementFixture.marker
  );
  const preservedAfterReplacement = await synchronizedPage.evaluate(() => ({
    invoiceNumber: document.getElementById("invoiceNumber")?.value,
    invoiceNotes: document.getElementById("invoiceNotes")?.value,
    landlordName: document.getElementById("landlordName")?.value,
    tenantMemo: document.getElementById("tenantMemo")?.value,
  }));
  assert(
    preservedAfterReplacement.invoiceNumber === "UNSAVED-CROSS-TAB-DRAFT" &&
      preservedAfterReplacement.invoiceNotes === "Keep this unsaved draft when another tab changes locks." &&
      preservedAfterReplacement.landlordName === "UNSAVED CROSS-TAB LANDLORD" &&
      preservedAfterReplacement.tenantMemo === "Keep this unsaved tenant edit during lock sync.",
    "A full replacement marker should preserve open form text until the stale tab attempts to save."
  );

  await synchronizedPage.click("#saveInvoice");
  await synchronizedPage.waitForFunction(() =>
    (document.getElementById("toast")?.textContent || "").includes("current saved state was reloaded")
  );
  const staleSaveBarrierState = await synchronizedPage.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    return {
      storedLandlord: stored.landlord?.name,
      storedTenantMemo: stored.tenants?.[0]?.memo,
      storedInvoiceCount: stored.invoices?.length || 0,
      formLandlord: document.getElementById("landlordName")?.value,
      formTenantMemo: document.getElementById("tenantMemo")?.value,
      formInvoiceNumber: document.getElementById("invoiceNumber")?.value,
    };
  });
  assert(
    staleSaveBarrierState.storedLandlord === "AUTHORITATIVE REPLACEMENT LANDLORD" &&
      staleSaveBarrierState.storedTenantMemo === "Authoritative replacement tenant memo." &&
      staleSaveBarrierState.storedInvoiceCount === replacementFixture.invoiceCount &&
      staleSaveBarrierState.formLandlord === "AUTHORITATIVE REPLACEMENT LANDLORD" &&
      staleSaveBarrierState.formTenantMemo === "Authoritative replacement tenant memo." &&
      staleSaveBarrierState.formInvoiceNumber !== "UNSAVED-CROSS-TAB-DRAFT",
    "A stale tab save must reload the authoritative replacement instead of overwriting it."
  );
  await synchronizedPage.close();

  await page.evaluate(
    ({ rentPeriod, utilityPeriod }) => {
      const resetState = {
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
        closedPeriods: [{ label: rentPeriod }, { label: utilityPeriod }],
        auditEvents: [],
      };
      localStorage.setItem("rent-ledger:closed-periods:v1", JSON.stringify(resetState.closedPeriods));
      localStorage.setItem("rent-ledger:v1", JSON.stringify(resetState));
    },
    { rentPeriod: expectedRentPeriod, utilityPeriod: expectedUtilityPeriod }
  );
  await page.reload({ waitUntil: "networkidle" });
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
  await page.click('[data-view="rent"]');
  const dialogsBeforeLockedCancel = dialogMessages.length;
  nextDialogAction = "dismiss";
  await page.click("#rentBatchList [data-create-rent-invoice]");
  await page.waitForTimeout(200);
  const lockedCancelState = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    return {
      rentInvoices: (state.invoices || []).filter((invoice) => invoice.invoiceType === "rent").length,
      saveState: document.getElementById("saveState")?.textContent?.trim(),
    };
  });
  const lockedCancelMessages = dialogMessages.slice(dialogsBeforeLockedCancel);
  assert(
    lockedCancelMessages.some(
      (message) => message.includes(`${expectedRentPeriod} is locked`) && message.includes("create this rent invoice")
    ),
    `Expected locked-period create confirmation, got: ${lockedCancelMessages.join(" | ")}.`
  );
  assert(
    lockedCancelState.rentInvoices === 0,
    `Cancelling locked-period invoice creation should leave zero rent invoices, got ${lockedCancelState.rentInvoices}.`
  );

  const dialogsBeforeLockedAccept = dialogMessages.length;
  await page.click("#rentBatchList [data-create-rent-invoice]");
  await page.waitForFunction(() => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    return state.invoices?.filter((invoice) => invoice.invoiceType === "rent").length === 1;
  });
  const lockedAcceptMessages = dialogMessages.slice(dialogsBeforeLockedAccept);
  assert(
    lockedAcceptMessages.some(
      (message) => message.includes(`${expectedRentPeriod} is locked`) && message.includes("create this rent invoice")
    ),
    `Expected accepted locked-period create confirmation, got: ${lockedAcceptMessages.join(" | ")}.`
  );

  await page.evaluate((sourcePeriod) => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    state.invoices.push({
      id: "locked-target-edit",
      tenantId: "brenda",
      invoiceType: "rent",
      invoiceNumber: "RNT-2000-01-0001",
      issueDate: "2000-01-01",
      dueDate: "2000-01-05",
      billingPeriod: sourcePeriod,
      lineItems: [{ type: "Rent", description: "Historical rent", amount: 900 }],
      previousBalance: 0,
      credits: 0,
      payments: [],
      status: "open",
      updatedAt: "2000-01-01T00:00:00.000Z",
    });
    localStorage.setItem("rent-ledger:v1", JSON.stringify(state));
  }, historicalPeriod);
  await page.reload({ waitUntil: "networkidle" });
  await page.click('[data-view="invoices"]');
  await page.locator('#invoiceHistory [data-load-invoice="locked-target-edit"]').click();
  await page.fill("#billingPeriod", expectedRentPeriod);

  const dialogsBeforeTargetCancel = dialogMessages.length;
  nextDialogAction = "dismiss";
  await page.click("#saveInvoice");
  await page.waitForTimeout(100);
  const cancelledTargetPeriod = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    return state.invoices.find((invoice) => invoice.id === "locked-target-edit")?.billingPeriod;
  });
  assert(
    cancelledTargetPeriod === historicalPeriod,
    `Cancelling a locked-target edit should retain ${historicalPeriod}, got ${cancelledTargetPeriod}.`
  );
  assert(
    dialogMessages
      .slice(dialogsBeforeTargetCancel)
      .some((message) => message.includes(`${expectedRentPeriod} is locked`) && message.includes("save changes")),
    "Moving an invoice from an unlocked source into a locked target period must require confirmation."
  );

  await page.click("#saveInvoice");
  await page.waitForFunction((targetPeriod) => {
    const state = JSON.parse(localStorage.getItem("rent-ledger:v1") || "{}");
    return state.invoices.find((invoice) => invoice.id === "locked-target-edit")?.billingPeriod === targetPeriod;
  }, expectedRentPeriod);

  await page.click('[data-view="settings"]');

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
  await page.waitForFunction(
    () => document.getElementById("driveStatus")?.textContent?.trim() === "Google Drive connection was cancelled or failed."
  );
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
  assert(pageErrors.length === 0, `Browser page errors were captured: ${pageErrors.join(" | ")}.`);
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
