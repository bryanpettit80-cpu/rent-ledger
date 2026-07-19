import { readFileSync } from "node:fs";

const files = {
  app: readFileSync("app.js", "utf8"),
  html: readFileSync("index.html", "utf8"),
  serviceWorker: readFileSync("sw.js", "utf8"),
  readme: readFileSync("README.md", "utf8"),
  deployment: readFileSync("DEPLOYMENT.md", "utf8"),
  mobileLauncher: readFileSync("Start-Rent-Ledger-Mobile.ps1", "utf8"),
  bumpVersion: readFileSync(".github/scripts/bump-version.mjs", "utf8"),
  smokeTest: readFileSync(".github/scripts/smoke-test.mjs", "utf8"),
};

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert(start >= 0, `app.js must define ${name}.`);
  if (start < 0) return "";

  const openBrace = source.indexOf("{", start);
  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }

  assert(false, `Unable to extract ${name} from app.js.`);
  return "";
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
const cycleInvoiceSource = extractFunction(files.app, "createCycleInvoiceForTenant");
assert(
  cycleInvoiceSource.includes("const duplicateCheckSummary = currentCycleSummary();") &&
    cycleInvoiceSource.includes("options.findExisting(tenant.id, duplicateCheckSummary)"),
  "Cycle invoice creation must refresh duplicate checks so batch-created invoices block duplicate tenant IDs."
);
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
assert(
  files.html.includes("Locks are workflow safeguards, not access controls"),
  "Settings must explain that closed periods are confirmation safeguards rather than access controls."
);
assert(!files.html.includes("Save connection settings"), "Settings must not include the removed Save connection settings button.");
assert(!files.html.includes('id="markPaid"'), "Invoice editor must not include the old header Mark paid button.");
assert(!files.html.includes('id="newInvoice"'), "Invoice editor must not include the old Start new button.");
assert(!files.html.includes("Start new"), "Invoice editor must not include Start new copy.");

assert(files.app.includes("function applyRentCharge"), "app.js must define applyRentCharge.");
assert(files.app.includes("async function createAllRentInvoices"), "app.js must define the rent batch flow.");
assert(files.app.includes("async function batchCreateUtilityInvoices"), "app.js must define the utility batch flow.");
assert(files.app.includes("async function createAllSecurityDepositInvoices"), "app.js must define the security deposit batch flow.");
assert(files.app.includes("function securityDepositInvoiceForTenant"), "Security deposit issuance must search saved invoice history.");
assert(
  files.app.includes("sortInvoicesByNewest(state.invoices).forEach((invoice) =>") &&
    files.app.includes("securityDepositInvoiceByTenantId.set(invoice.tenantId, invoice)"),
  "Current-cycle summary must index security deposit issuance from all saved invoices."
);
assert(
  files.app.includes("securityDepositInvoiceForTenant(invoice.tenantId, currentCycleSummary(), invoice.id)"),
  "Manual invoice saves must prevent repeated security deposit issuance."
);
assert(
  files.app.includes("Paid security deposit invoices are retained as one-time issuance records."),
  "Bulk paid-invoice cleanup must retain security deposit issuance records."
);
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
assert(files.app.includes("data-unlock-period"), "Each locked billing period must expose an individual unlock action.");
assert(
  files.app.includes('const CLOSED_PERIODS_KEY = "rent-ledger:closed-periods:v1"') &&
  files.app.includes('const STATE_REPLACEMENT_KEY = "rent-ledger:state-replacement:v1"') &&
  files.app.includes('window.addEventListener("storage", handleStorageChange)') &&
    files.app.includes("function handleStorageChange"),
  "Open tabs must synchronize a dedicated canonical closed-period record."
);
assert(
  files.app.includes("confirmLockedInvoiceChange(invoice, `create this ${invoiceTypeLabel(invoice.invoiceType).toLowerCase()} invoice`)"),
  "Generated current-cycle invoices must require locked-period confirmation before they are saved."
);
assert(files.app.includes("data-copy-invoice-message"), "Saved invoice rows must expose message draft actions.");
assert(files.app.includes("closedPeriods: normalizeClosedPeriods"), "State normalization must retain closed periods.");
assert(files.app.includes("auditEvents: normalizeAuditEvents"), "State normalization must retain audit events.");
assert(files.serviceWorker.includes("async function networkFirst"), "sw.js should keep network-first HTML/CSS/JS handling.");
assert(files.serviceWorker.includes('fetch(request, { cache: "no-store" })'), "sw.js network-first requests should bypass stale HTTP cache.");
assert(
  files.app.includes("markInvoiceDriveSaved(artifact.id, artifact.file, { write: false, updateDraft: false })") &&
    files.app.includes('writeLocalState(invoiceList.length === 1 ? "Saved invoice to Drive" : "Saved invoices to Drive")'),
  "Drive state should be updated after invoice PDF metadata is recorded."
);

const csvHarness = new Function(`
${extractFunction(files.app, "neutralizeCsvFormulaCell")}
${extractFunction(files.app, "csvCell")}
return { csvCell };
`)();
const createCycleInvoiceSource = extractFunction(files.app, "createCycleInvoiceForTenant");
const lockedConfirmationIndex = createCycleInvoiceSource.indexOf("confirmLockedInvoiceChange");
const invoicePushIndex = createCycleInvoiceSource.indexOf("state.invoices.push(invoice)");
assert(
  lockedConfirmationIndex >= 0 && invoicePushIndex > lockedConfirmationIndex,
  "Generated invoice creation must confirm locked periods before pushing invoices into state."
);
const persistInvoiceSource = extractFunction(files.app, "persistCurrentInvoice");
assert(
  persistInvoiceSource.includes("[existingInvoice, invoice]") &&
    persistInvoiceSource.indexOf("confirmLockedInvoiceChange") < persistInvoiceSource.indexOf("state.invoices[existingIndex] = invoice"),
  "Invoice edits must confirm locks on both the saved period and the submitted target period before mutation."
);
const storageHandlerSource = extractFunction(files.app, "handleStorageChange");
assert(
  storageHandlerSource.includes("event.key !== CLOSED_PERIODS_KEY") &&
    storageHandlerSource.includes("refreshCanonicalClosedPeriods()") &&
    storageHandlerSource.includes("renderPeriodLocks(summary)") &&
    storageHandlerSource.includes("renderOverview(summary)") &&
    !storageHandlerSource.includes("stateFromStorageValue") &&
    !storageHandlerSource.includes("fillTenantForm") &&
    !storageHandlerSource.includes("fillLandlordForm"),
  "Cross-tab lock updates must refresh only closed periods and their UI without replacing general state or forms."
);
assert(
  files.app.includes("state.closedPeriods = options.persistClosedPeriods") &&
    files.app.includes("persistCanonicalClosedPeriods(state.closedPeriods)") &&
    files.app.includes(": refreshCanonicalClosedPeriods();"),
  "Ordinary state writes must merge canonical locks while explicit replacements may persist their lock snapshot."
);
assert(
  files.app.includes('saveState("Loaded from Google Drive", { persistClosedPeriods: true, stateReplacement: true })') &&
    files.app.includes('saveState("Imported backup", { persistClosedPeriods: true, stateReplacement: true })') &&
    files.app.includes('saveState("Restored local backup", { persistClosedPeriods: true, stateReplacement: true })'),
  "Drive load, full import, and local restore must replace locks and publish a state-replacement marker."
);
const saveStateSource = files.app.slice(
  files.app.indexOf("function saveState"),
  files.app.indexOf("function writeLocalState")
);
assert(
  saveStateSource.includes("stateReplacementIsPending()") &&
    saveStateSource.indexOf("stateReplacementIsPending()") < saveStateSource.indexOf("writeLocalState(reason, options)") &&
    saveStateSource.includes("reloadAfterExternalStateReplacement()") &&
    saveStateSource.includes("return false"),
  "Ordinary saves must refuse a stale write after another tab fully replaces state."
);
assert(
  storageHandlerSource.includes("event.key === STATE_REPLACEMENT_KEY") &&
    storageHandlerSource.includes("externalReplacementPending = true") &&
    !storageHandlerSource.includes("reloadAfterExternalStateReplacement"),
  "Replacement events must preserve open forms while marking the tab stale."
);
const initialStateSource = files.app.slice(files.app.indexOf("let state;"), files.app.indexOf("let appSettings"));
assert(
  initialStateSource.includes('window.addEventListener("storage", handleStorageChange)') &&
    initialStateSource.indexOf('window.addEventListener("storage", handleStorageChange)') <
      initialStateSource.indexOf("readConsistentStateSnapshot()") &&
    initialStateSource.includes("observedStateReplacementToken = initialStateSnapshot.token") &&
    extractFunction(files.app, "reloadAfterExternalStateReplacement").includes("readConsistentStateSnapshot()"),
  "Startup and stale-state reloads must sample state with its replacement marker after registering the storage listener."
);
const writeLocalStateSource = files.app.slice(
  files.app.indexOf("function writeLocalState"),
  files.app.indexOf("function mergeLatestAuditEvents")
);
assert(
  writeLocalStateSource.includes("mergeLatestAuditEvents()") &&
    writeLocalStateSource.includes("stateReplacementIsPending()") &&
    writeLocalStateSource.includes("reloadAfterExternalStateReplacement()") &&
    writeLocalStateSource.includes("publishStateReplacement(reason)") &&
    writeLocalStateSource.indexOf('localStorage.setItem(STORAGE_KEY, JSON.stringify(state))') <
      writeLocalStateSource.indexOf("publishStateReplacement(reason)"),
  "Ordinary writes must merge audit history, and full replacement markers must publish after the authoritative state."
);
const driveUploadSource = files.app.slice(
  files.app.indexOf("async function uploadDriveState"),
  files.app.indexOf("async function uploadInvoicePdf")
);
assert(
  driveUploadSource.includes("return withDriveStateLock(upload)") &&
    driveUploadSource.includes('navigator.locks.request("rent-ledger-drive-state", callback)') &&
    driveUploadSource.includes("prepareCurrentStateForDriveUpload()") &&
    driveUploadSource.includes("finishDriveStateUpload(replacementRetry, uploadedStateRevision, options)") &&
    driveUploadSource.includes("stateWriteRevision !== uploadedStateRevision") &&
    driveUploadSource.includes("uploadDriveStateWithCurrentData(replacementRetry + 1, options)"),
  "Drive state uploads must serialize across tabs and retry after replacement or same-tab state changes."
);
const driveArtifactSource = files.app.slice(
  files.app.indexOf("async function saveInvoiceArtifactsToDrive"),
  files.app.indexOf("async function loadStateFromDrive")
);
assert(
  driveArtifactSource.includes("withDriveStateLock(saveArtifacts)") &&
    driveArtifactSource.includes("uploadDriveStateWithCurrentData()") &&
    driveArtifactSource.includes("for (const invoice of invoiceList)") &&
    driveArtifactSource.includes("invoiceArtifactFingerprint(currentInvoice)") &&
    driveArtifactSource.includes("stateWriteRevision !== transactionRevision") &&
    driveArtifactSource.indexOf("uploadedArtifacts.push") < driveArtifactSource.indexOf("markInvoiceDriveSaved") &&
    driveArtifactSource.includes("if (!prepareCurrentStateForDriveUpload()) return null;") &&
    driveArtifactSource.indexOf("await uploadInvoicePdf") <
      driveArtifactSource.lastIndexOf("if (!prepareCurrentStateForDriveUpload()) return null;"),
  "Invoice PDF batches must lock, verify source revisions around each upload, and delay metadata until the batch stays current."
);
const saveInvoiceSource = extractFunction(files.app, "saveInvoice");
assert(
  saveInvoiceSource.includes("uploadDraftRevision") &&
    saveInvoiceSource.includes("draftEditRevision !== uploadDraftRevision") &&
    driveArtifactSource.includes("updateDraft: false") &&
    driveArtifactSource.includes("draftEditRevision === startingDraftRevision"),
  "An asynchronous Drive upload must preserve newer unsaved invoice-form edits instead of relabeling or replacing the draft."
);
const driveSettingsSource = files.app.slice(
  files.app.indexOf("function saveDriveSettings"),
  files.app.indexOf("function renderDriveStatus")
);
assert(
  driveSettingsSource.includes("const previousAutoSync = Boolean(appSettings.driveAutoSync)") &&
    driveSettingsSource.includes("!previousAutoSync && appSettings.driveAutoSync && driveAccessToken"),
  "Saving Drive fields must queue auto-sync only when auto-sync is newly enabled, not after every upload."
);
const driveLoadSource = files.app.slice(
  files.app.indexOf("async function loadStateFromDrive"),
  files.app.indexOf("async function uploadDriveState")
);
assert(
  driveLoadSource.includes("clearTimeout(driveSyncTimer)") &&
    driveLoadSource.includes("withDriveStateLock(load)"),
  "Drive download must cancel queued uploads and share the cross-tab Drive-state lock."
);
const driveImportSource = extractFunction(files.app, "importDriveStateFile");
assert(
  driveImportSource.includes("const imported = await fetchDriveState") &&
    driveImportSource.includes("if (!stateSaved) return false") &&
    driveImportSource.indexOf("const imported = await fetchDriveState") <
      driveImportSource.indexOf('saveState("Loaded from Google Drive"') &&
    driveImportSource.indexOf('saveState("Loaded from Google Drive"') <
      driveImportSource.indexOf("appSettings.driveStateModifiedTime") &&
    driveImportSource.indexOf("appSettings.driveStateModifiedTime") <
      driveImportSource.indexOf("localStorage.setItem(APP_SETTINGS_KEY"),
  "Drive download metadata must be trusted only after the remote state is fetched and saved locally."
);
const fullImportSource = extractFunction(files.app, "importBackup");
const localRestoreSource = extractFunction(files.app, "restoreLatestBackup");
assert(
  fullImportSource.includes("await withDriveStateLock") && localRestoreSource.includes("await withDriveStateLock"),
  "Full backup imports and local restores must share the Drive-state lock with artifact uploads."
);
const canonicalReadSource = files.app.slice(
  files.app.indexOf("function readCanonicalClosedPeriods"),
  files.app.indexOf("function persistCanonicalClosedPeriods")
);
assert(
  canonicalReadSource.includes('localStorage.setItem(CLOSED_PERIODS_KEY, JSON.stringify(closedPeriods))') &&
    canonicalReadSource.includes("Unable to repair canonical closed periods"),
  "Malformed canonical lock data must self-heal from the normalized state fallback."
);
assert(
  files.app.includes('`Locked billing period${added.length === 1 ? "" : "s"} ${added.join(" and ")}`') &&
    files.app.includes('`Unlocked billing period${removedPeriods.length === 1 ? "" : "s"}'),
  "Current-cycle lock audit entries must include the exact affected billing-period labels."
);
const lockedChangeSource = extractFunction(files.app, "confirmLockedInvoiceChange");
assert(
  lockedChangeSource.indexOf("refreshCanonicalClosedPeriods()") < lockedChangeSource.indexOf("lockedInvoicePeriods(invoices)"),
  "Locked invoice confirmation must synchronously refresh canonical locks before evaluating source and target periods."
);
const paymentSource = extractFunction(files.app, "recordInvoicePayment");
assert(
  paymentSource.indexOf("confirmLockedInvoiceChange") < paymentSource.indexOf("invoice.payments ="),
  "Payment recording must refresh and confirm canonical locks immediately before mutation."
);
const invoiceHistoryClickSource = extractFunction(files.app, "handleInvoiceHistoryClick");
assert(
  invoiceHistoryClickSource.indexOf("window.confirm(deleteMessage)") <
    invoiceHistoryClickSource.indexOf('confirmLockedInvoiceChange(invoice, "delete this invoice")') &&
    invoiceHistoryClickSource.indexOf('confirmLockedInvoiceChange(invoice, "delete this invoice")') <
      invoiceHistoryClickSource.indexOf("state.invoices = state.invoices.filter"),
  "Single-invoice deletion must make the refreshed lock safeguard the final confirmation before mutation."
);
const clearPaidSource = extractFunction(files.app, "clearPaidInvoices");
assert(
  clearPaidSource.indexOf("window.confirm") <
    clearPaidSource.indexOf('confirmLockedInvoiceChange(deletablePaidInvoices, "delete these paid invoices")') &&
    clearPaidSource.indexOf('confirmLockedInvoiceChange(deletablePaidInvoices, "delete these paid invoices")') <
      clearPaidSource.indexOf("state.invoices = state.invoices.filter"),
  "Bulk paid deletion must refresh locks after its destructive confirmation and before mutation."
);
assert(csvHarness.csvCell("=2+2") === "'=2+2", "CSV export must neutralize equals-led formula cells.");
assert(csvHarness.csvCell("+SUM(1)") === "'+SUM(1)", "CSV export must neutralize plus-led formula cells.");
assert(csvHarness.csvCell("-10+20") === "'-10+20", "CSV export must neutralize minus-led formula cells.");
assert(csvHarness.csvCell("@HYPERLINK") === "'@HYPERLINK", "CSV export must neutralize at-led formula cells.");
assert(csvHarness.csvCell("\t=2+2") === "'\t=2+2", "CSV export must neutralize tab-prefixed formula cells.");
assert(csvHarness.csvCell("  =2+2") === "'  =2+2", "CSV export must neutralize space-prefixed formula cells.");
assert(csvHarness.csvCell("\r=2+2") === `"'\r=2+2"`, "CSV export must neutralize carriage-return-prefixed formula cells.");
assert(csvHarness.csvCell("plain text") === "plain text", "CSV export must preserve plain text.");
assert(csvHarness.csvCell("needs,quote") === '"needs,quote"', "CSV export must keep standard CSV quoting.");

assert(
  files.mobileLauncher.includes('$PublishRoot = Join-Path $StateDir "mobile-public"'),
  "Mobile launcher must publish from a dedicated public app directory."
);
assert(
  files.mobileLauncher.includes("-WorkingDirectory $PublishRoot"),
  "Mobile launcher must serve the public app directory."
);
assert(
  !files.mobileLauncher.includes("-WorkingDirectory $AppRoot"),
  "Mobile launcher must not serve the repository root."
);
assert(
  files.mobileLauncher.includes("[switch]$PreparePublicRoot"),
  "Mobile launcher must support public-root preparation for validation."
);
assert(
  files.mobileLauncher.includes('"index.html", "styles.css", "app.js", "manifest.webmanifest", "sw.js"') &&
    files.mobileLauncher.includes('$RuntimeDirectories = @("assets")'),
  "Mobile launcher must copy only runtime app files into the public serving directory."
);

assert(files.readme.includes("Drive actions save the current OAuth client ID"), "README must explain Drive settings auto-save.");
assert(
  files.readme.includes("prefilled Google OAuth web client ID works only on an origin") &&
    files.readme.includes("OAuth 2.0 client of type `Web application`") &&
    files.readme.includes("Settings > Advanced Drive setup"),
  "README must explain that each hosted origin needs an authorized Web application OAuth client."
);
assert(
  files.deployment.includes("Upload to Drive") &&
    files.deployment.includes("stop entering or editing data on the old origin") &&
    files.deployment.includes("both the old origin and the new dedicated origin") &&
    files.deployment.includes("same OAuth client ID") &&
    files.deployment.includes("Download from Drive") &&
    files.deployment.includes("tenants, saved invoices, balances, closed periods, and period locks"),
  "Deployment guide must document the old-origin to new-origin Drive migration and verification sequence."
);
assert(files.readme.includes("Create all rent invoices"), "README must document the rent batch flow.");
assert(files.readme.includes("Create all utilities"), "README must document the utility batch flow.");
assert(files.readme.includes("Create all security deposits"), "README must document the security deposit batch flow.");
assert(
  files.readme.includes("issuance is one-time per tenant across all periods"),
  "README must document one-time historical security deposit issuance."
);
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
assert(files.readme.includes("workflow safeguard, not a password"), "README must explain the lock security boundary.");
assert(files.readme.includes("Unlock this period"), "README must document historical per-period unlocks.");
assert(files.readme.includes("both its saved billing period and the newly selected billing period"), "README must document locked-target edit protection.");
assert(files.readme.includes("dedicated browser lock record"), "README must document scoped cross-tab lock synchronization.");
assert(files.readme.includes("invoice drafts, tenant forms, and landlord settings"), "README must explain which open-tab forms lock synchronization preserves.");
assert(files.readme.includes("full Drive/import/restore replacement"), "README must explain stale-tab protection after full state replacement.");
assert(
  files.readme.includes("invoice PDF batches share one cross-tab operation lock"),
  "README must explain Drive artifact and full-replacement serialization."
);
assert(files.readme.includes("CSV Exports"), "README must document report exports.");
assert(files.readme.includes("Local Audit Trail"), "README must document the audit trail.");
assert(files.readme.includes("Release Checklist"), "README must include the static release checklist.");
assert(files.bumpVersion.includes("incrementVersion"), "Version bump helper must increment APP_VERSION.");
assert(files.smokeTest.includes("long invoice PDF to paginate"), "Smoke test must cover multi-page invoice PDFs.");
assert(files.smokeTest.includes("billingHealthScore"), "Smoke test must cover the operations dashboard.");
assert(
  files.smokeTest.includes("Prior-period paid and partial deposit invoices should leave 0 remaining"),
  "Smoke test must cover paid and partial security deposit invoices from a prior period."
);
assert(
  files.smokeTest.includes("Bulk paid cleanup must retain the paid security deposit invoice"),
  "Smoke test must cover preservation of paid security deposit issuance records."
);
assert(
  files.smokeTest.includes("A stale tab save must reload the authoritative replacement instead of overwriting it"),
  "Smoke test must cover the stale-tab state-replacement save barrier."
);
assert(
  files.smokeTest.includes("Drive operation lock should serialize replacement and artifact work across tabs"),
  "Smoke test must cover cross-tab Drive operation serialization."
);
assert(
  files.smokeTest.includes("Invoice artifact fingerprint should change when PDF source data changes"),
  "Smoke test must cover invoice artifact source fingerprints."
);

if (failures.length) {
  console.error("Static validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Static validation passed for ${appVersion}.`);
