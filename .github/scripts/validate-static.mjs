import { readFileSync } from "node:fs";

const files = {
  app: readFileSync("app.js", "utf8"),
  html: readFileSync("index.html", "utf8"),
  serviceWorker: readFileSync("sw.js", "utf8"),
  readme: readFileSync("README.md", "utf8"),
  bumpVersion: readFileSync(".github/scripts/bump-version.mjs", "utf8"),
  smokeTest: readFileSync(".github/scripts/smoke-test.mjs", "utf8"),
};

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const appVersionMatch = files.app.match(/const APP_VERSION = "([^"]+)"/);
assert(appVersionMatch, "app.js must define APP_VERSION.");

const appVersion = appVersionMatch?.[1] || "";
assert(/^rent-ledger-v\d+$/.test(appVersion), `APP_VERSION must look like rent-ledger-vNN, got ${appVersion || "missing"}.`);

const appCommitDateMatch = files.app.match(/const APP_COMMIT_DATE = "([^"]+)"/);
assert(appCommitDateMatch, "app.js must define APP_COMMIT_DATE.");
const appCommitDate = appCommitDateMatch?.[1] || "";

const versionedFiles = {
  "app.js": files.app,
  "index.html": files.html,
  "sw.js": files.serviceWorker,
};

for (const [name, content] of Object.entries(versionedFiles)) {
  const versions = [...content.matchAll(/rent-ledger-v\d+/g)].map((match) => match[0]);
  const staleVersions = [...new Set(versions.filter((version) => version !== appVersion))];
  assert(!staleVersions.length, `${name} has stale app version(s): ${staleVersions.join(", ")}.`);
}

assert(files.html.includes(`<strong id="splashVersion">${appVersion}</strong>`), "index.html splash version must match APP_VERSION.");
assert(
  files.html.includes(`<strong id="splashCommitDate">${appCommitDate}</strong>`),
  "index.html splash commit date must match APP_COMMIT_DATE."
);
assert(files.html.includes(`app.js?v=${appVersion}`), "index.html script URL must use APP_VERSION.");
assert(files.html.includes(`styles.css?v=${appVersion}`), "index.html stylesheet URL must use APP_VERSION.");
assert(files.html.includes(`manifest.webmanifest?v=${appVersion}`), "index.html manifest URL must use APP_VERSION.");

assert(files.serviceWorker.includes(`const CACHE_NAME = "${appVersion}"`), "sw.js CACHE_NAME must match APP_VERSION.");
assert(files.serviceWorker.includes(`./app.js?v=${appVersion}`), "sw.js must cache the versioned app.js URL.");
assert(files.serviceWorker.includes(`./styles.css?v=${appVersion}`), "sw.js must cache the versioned styles.css URL.");
assert(files.serviceWorker.includes(`./manifest.webmanifest?v=${appVersion}`), "sw.js must cache the versioned manifest URL.");

assert(files.html.includes('id="applyRentCharge"'), "Rent workflow must include the Apply charge button.");
assert(files.html.includes('data-view="invoices"'), "Navigation must include the Invoices page.");
assert(files.html.includes('id="rentBatchPanel"'), "Rent workflow must include the rent cycle panel.");
assert(files.html.includes('id="createAllRentInvoices"'), "Rent workflow must include the rent batch button.");
assert(files.html.includes('id="utilityBatchPanel"'), "Utility workflow must include the utility cycle panel.");
assert(files.html.includes('id="createAllUtilityInvoices"'), "Utility workflow must include the utility batch button.");
assert(files.html.includes('data-view="security"'), "Navigation must include the Security Deposits page.");
assert(files.html.includes('id="securityDepositBatchPanel"'), "Security Deposits workflow must include the deposit cycle panel.");
assert(files.html.includes('id="createAllSecurityDepositInvoices"'), "Security Deposits workflow must include the deposit batch button.");
assert(files.html.includes('id="tenantSecurityDeposit"'), "Tenant profile must include a security deposit field.");
assert(files.html.includes('id="paymentDialog"'), "Saved invoices must use a payment popup for full or partial payments.");
assert(files.html.includes('id="paymentPartial"'), "Payment popup must include a Partial button.");
assert(files.html.includes('id="advancedCharges"'), "Manual charge editing should live behind the advanced charge control.");
assert(files.html.includes('id="togglePreview"'), "Mobile workflow must include the preview toggle.");
assert(files.html.includes('placeholder="July 2026"'), "Billing period placeholder should use month and year.");
assert(files.html.includes("Connect Drive"), "Settings must include Connect Drive.");
assert(files.html.includes("Download from Drive"), "Settings must include Download from Drive.");
assert(files.html.includes("Upload to Drive"), "Settings must include Upload to Drive.");
assert(files.html.includes('id="billingHealthList"'), "Overview must include billing health checks.");
assert(files.html.includes('id="delinquencyList"'), "Overview must include overdue balance follow-up.");
assert(files.html.includes('id="communicationDraftList"'), "Overview must include communication drafts.");
assert(files.html.includes('id="auditTrailList"'), "Settings must include the local audit trail.");
assert(files.html.includes('id="exportInvoiceCsv"'), "Settings must include invoice CSV export.");
assert(files.html.includes('id="lockCurrentCycle"'), "Settings must include current-cycle lock controls.");
assert(files.html.includes('id="closedPeriodList"'), "Settings must show closed periods.");
assert(!files.html.includes("Save connection settings"), "Settings must not include the removed Save connection settings button.");
assert(!files.html.includes('id="markPaid"'), "Invoice editor must not include the old header Mark paid button.");
assert(!files.html.includes('id="newInvoice"'), "Invoice editor must not include the old Start new button.");
assert(!files.html.includes("Start new"), "Invoice editor must not include Start new copy.");

assert(files.app.includes("function applyRentCharge"), "app.js must define applyRentCharge.");
assert(files.app.includes("async function createAllRentInvoices"), "app.js must define the rent batch flow.");
assert(files.app.includes("async function batchCreateUtilityInvoices"), "app.js must define the utility batch flow.");
assert(files.app.includes("async function createAllSecurityDepositInvoices"), "app.js must define the security deposit batch flow.");
assert(files.app.includes("function recordInvoicePayment"), "app.js must define invoice payment recording.");
assert(files.app.includes("function openPaymentDialog"), "app.js must open the payment dialog from Mark paid.");
assert(files.app.includes("function paymentDialogCopy"), "Payment dialog must explain charges, credits, payments, and balance.");
assert(files.app.includes("function invoiceCycleAmount"), "Workflow rows must show current invoice balance when an invoice exists.");
assert(files.app.includes("function invoiceCycleDetail"), "Workflow rows must show applied credits or payments.");
assert(!files.app.includes(".slice(0, 8)"), "Overview cycle invoice list must not be capped at eight invoices.");
assert(files.app.includes("Payment cannot exceed the current balance due"), "Overpayment errors must reference current balance due.");
assert(files.app.includes("function markInvoiceDriveSaved"), "app.js must persist invoice Drive PDF metadata.");
assert(files.app.includes("invoiceSavedToDrive(draft)"), "Saved invoice labels must use persisted Drive metadata.");
assert(files.app.includes("drivePdfFileId"), "Invoices must store the Drive PDF file id after upload.");
assert(files.app.includes("function createRenderContext"), "Render flow must keep a shared render context.");
assert(files.app.includes("rentInvoiceByTenantId = new Map"), "Cycle summary must index rent invoices by tenant.");
assert(files.app.includes("utilityInvoiceByTenantId = new Map"), "Cycle summary must index utility invoices by tenant.");
assert(
  files.app.includes("securityDepositInvoiceByTenantId = new Map"),
  "Cycle summary must index security deposit invoices by tenant."
);
assert(files.app.includes("function ensurePdfSpace"), "PDF generation must guard page space before drawing content.");
assert(files.app.includes("function addPdfPage"), "PDF generation must support multi-page invoices.");
assert(files.app.includes("assemblePdf(doc.pages)"), "Invoice PDF creation must pass all generated pages to the assembler.");
assert(files.app.includes("/Count ${pageCount}"), "PDF page tree count must be generated from the actual page count.");
assert(files.app.includes("__RENT_LEDGER_ENABLE_TEST_HOOKS__"), "Smoke tests must have gated access to PDF generation hooks.");
assert(files.app.includes("function setPreviewVisible"), "app.js must define mobile preview visibility handling.");
assert(files.app.includes("function setInvoicePaid"), "Saved invoices must support mark-paid/reopen actions.");
assert(files.app.includes('invoice.status = calculateTotal(invoice) <= 0 ? "paid" : "partial";'), "Partial payments must leave invoices in partial status.");
assert(files.app.includes("function utilityCalculationForTenant"), "Utility billing should preserve shared bill totals when switching tenants.");
assert(files.app.includes("function invoiceNumberPeriodDate"), "Generated invoice numbers must use the invoice billing month.");
assert(files.app.includes("return `${prefix}-${year}-${month}-${String(next).padStart(4, \"0\")}`;"), "Generated invoice numbers must include the two-digit billing month.");
assert(files.app.includes(".replace(/^\\d{1,2}\\s*[-/]\\s*/, \"\")"), "Cycle matching must handle old labels without month numbers.");
assert(files.app.includes("/^(INV|RNT|UTL|DEP)-\\d{4}-(\\d{2}-)?\\d{4}$/"), "Generated invoice detection must accept old and month-coded invoice numbers.");
assert(files.app.includes("saveDriveSettings(false);"), "Drive actions must save connection fields before running.");
assert(files.app.includes("function renderOperationsDashboard"), "app.js must render the billing health dashboard.");
assert(files.app.includes("function getOverdueInvoices"), "app.js must calculate overdue balances.");
assert(files.app.includes("function copyInvoiceMessage"), "app.js must generate copyable tenant message drafts.");
assert(files.app.includes("function exportInvoiceCsv"), "app.js must include invoice CSV export.");
assert(files.app.includes("function exportTenantStatementCsv"), "app.js must include tenant balance CSV export.");
assert(files.app.includes("function recordAuditEvent"), "app.js must record a local audit trail.");
assert(files.app.includes("function normalizeClosedPeriods"), "app.js must persist closed billing periods.");
assert(files.app.includes("function confirmLockedInvoiceChange"), "app.js must guard locked-period invoice changes.");
assert(files.app.includes("data-copy-invoice-message"), "Saved invoice rows must expose message draft actions.");
assert(files.app.includes("closedPeriods: normalizeClosedPeriods"), "State normalization must retain closed periods.");
assert(files.app.includes("auditEvents: normalizeAuditEvents"), "State normalization must retain audit events.");
assert(files.serviceWorker.includes("async function networkFirst"), "sw.js should keep network-first HTML/CSS/JS handling.");
assert(files.serviceWorker.includes('fetch(request, { cache: "no-store" })'), "sw.js network-first requests should bypass stale HTTP cache.");
assert(
  files.app.includes("markInvoiceDriveSaved(invoice.id, file, { write: false });") &&
    files.app.includes('writeLocalState("Saved invoice to Drive");'),
  "Drive state should be updated after invoice PDF metadata is recorded."
);

assert(files.readme.includes("Drive actions save the current OAuth client ID"), "README must explain Drive settings auto-save.");
assert(files.readme.includes("Create all rent invoices"), "README must document the rent batch flow.");
assert(files.readme.includes("Create all utilities"), "README must document the utility batch flow.");
assert(files.readme.includes("Create all security deposits"), "README must document the security deposit batch flow.");
assert(files.readme.includes("RNT-2026-07-"), "README must document month-coded rent invoice numbers.");
assert(files.readme.includes("UTL-2026-06-"), "README must document month-coded utility invoice numbers.");
assert(files.readme.includes("DEP-2026-07-"), "README must document month-coded deposit invoice numbers.");
assert(files.readme.includes("Invoice States"), "README must document invoice states.");
assert(files.readme.includes("Partially paid"), "README must document partial invoice payment state.");
assert(files.readme.includes("Saved locally"), "README must document the saved-local state.");
assert(files.readme.includes("Saved to Drive"), "README must document the saved-to-Drive state.");
assert(files.readme.includes("Drive PDF metadata"), "README must explain saved-to-Drive metadata.");
assert(files.readme.includes("Credits or adjustments reduce the balance"), "README must explain credit and payment balance handling.");
assert(files.readme.includes("Operations Dashboard"), "README must document the operations dashboard.");
assert(files.readme.includes("Closed Periods"), "README must document closed-period controls.");
assert(files.readme.includes("CSV Exports"), "README must document report exports.");
assert(files.readme.includes("Local Audit Trail"), "README must document the audit trail.");
assert(files.readme.includes("Release Checklist"), "README must include the static release checklist.");
assert(files.bumpVersion.includes("incrementVersion"), "Version bump helper must increment APP_VERSION.");
assert(files.smokeTest.includes("long invoice PDF to paginate"), "Smoke test must cover multi-page invoice PDFs.");
assert(files.smokeTest.includes("billingHealthScore"), "Smoke test must cover the operations dashboard.");

if (failures.length) {
  console.error("Static validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Static validation passed for ${appVersion}.`);
