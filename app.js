(function () {
  const STORAGE_KEY = "rent-ledger:v1";
  const BACKUP_KEY = "rent-ledger:backups:v1";
  const MAX_LOCAL_BACKUPS = 25;
  const APP_VERSION = "rent-ledger-v26";
  const APP_COMMIT_DATE = "July 1, 2026";
  const APP_REFRESH_KEY = `rent-ledger:refreshed:${APP_VERSION}`;
  const APP_SETTINGS_KEY = "rent-ledger:settings:v1";
  const SPLASH_SEEN_KEY = `rent-ledger:splash-seen:${APP_VERSION}`;
  const DEFAULT_GOOGLE_CLIENT_ID =
    "1053768686767-tjgtqui15pmh3q9blogtruftmo6lktfg.apps.googleusercontent.com";
  const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
  const DRIVE_FOLDER_NAME = "Rent Ledger";
  const DRIVE_INVOICE_FOLDER_NAME = "Invoices";
  const DRIVE_STATE_FILE_NAME = "rent-ledger-state.json";
  const DRIVE_SYNC_DEBOUNCE_MS = 1200;

  const moneyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

  const defaultState = {
    landlord: {
      name: "Your Rental Company",
      address: "123 Main Street\nVirginia Beach, VA 23451",
      email: "billing@example.com",
      phone: "(555) 010-2211",
      paymentInstructions:
        "Please pay by check, bank transfer, or your approved online payment method. Include the invoice number with your payment.",
    },
    tenants: [
      {
        id: cryptoId(),
        name: "Sample Tenant",
        unit: "Unit A",
        address: "456 Tenant Avenue\nVirginia Beach, VA 23451",
        email: "tenant@example.com",
        phone: "(555) 010-3344",
        rent: 1450,
        securityDeposit: 1450,
        utilityUnits: 1.5,
        memo: "Replace this sample with your tenant details.",
      },
    ],
    invoices: [],
  };

  let state = loadState();
  let appSettings = loadAppSettings();
  let selectedTenantId = firstActiveTenantId() || state.tenants[0]?.id || "";
  let selectedInvoiceId = "";
  let tenantEditorId = selectedTenantId;
  let draft = createBlankInvoice(selectedTenantId);
  let cycleUtilityCalculation = normalizeUtilityCalculation(draft.utilityCalculation);
  let currentWorkflow = workflowFromInvoiceType(draft.invoiceType);
  let paymentDialogInvoiceId = "";
  let toastTimer = 0;
  let driveAccessToken = "";
  let driveTokenClient = null;
  let driveSyncTimer = 0;
  let googleIdentityLoadPromise = null;

  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bindElements();
    bindEvents();
    fillLandlordForm();
    fillDriveSettingsForm();
    fillTenantForm(selectedTenantId);
    renderAll();
    registerServiceWorker();
    setInitialView();
    renderSplash();
  }

  function bindElements() {
    [
      "tenantSelect",
      "invoiceType",
      "invoiceNumber",
      "issueDate",
      "dueDate",
      "billingPeriod",
      "utilityCalculator",
      "utilityMethod",
      "utilityTenantUnits",
      "utilityTotalUnits",
      "utilityElectric",
      "utilityWaterSewer",
      "utilityGas",
      "utilityOther",
      "utilityCalcResult",
      "utilityBatchSummary",
      "applyUtilityCharge",
      "batchUtilityInvoices",
      "rentBatchPanel",
      "rentBatchHeading",
      "rentBatchCopy",
      "rentBatchList",
      "createAllRentInvoices",
      "securityDepositBatchPanel",
      "securityDepositBatchHeading",
      "securityDepositBatchCopy",
      "securityDepositBatchList",
      "createAllSecurityDepositInvoices",
      "utilityBatchPanel",
      "utilityBatchHeading",
      "utilityBatchCopy",
      "cycleUtilityMethod",
      "cycleUtilityTotalUnits",
      "cycleUtilityElectric",
      "cycleUtilityWaterSewer",
      "cycleUtilityGas",
      "cycleUtilityOther",
      "utilityAllocationList",
      "createAllUtilityInvoices",
      "advancedCharges",
      "lineItems",
      "previousBalance",
      "credits",
      "invoiceNotes",
      "totalDue",
      "invoicePreview",
      "invoiceHistory",
      "invoiceStatus",
      "invoiceHeading",
      "overviewCycleLabel",
      "overviewCycleStatus",
      "cycleExpectedRent",
      "cycleRentInvoiced",
      "cycleUtilityInvoiced",
      "cycleOpenBalance",
      "rentWorkflowCount",
      "utilityWorkflowCount",
      "securityDepositWorkflowCount",
      "cycleMissingRent",
      "cycleMissingUtilities",
      "cycleMissingSecurityDeposits",
      "overviewInvoiceList",
      "startRentWorkflow",
      "startUtilityWorkflow",
      "startSecurityDepositWorkflow",
      "reviewInvoicesWorkflow",
      "invoiceWorkflowCount",
      "workflowEyebrow",
      "workflowCopy",
      "saveState",
      "applyRentCharge",
      "addLineItem",
      "saveInvoice",
      "printInvoice",
      "togglePreview",
      "clearPaid",
      "tenantList",
      "addTenant",
      "deleteTenant",
      "tenantForm",
      "tenantFormHeading",
      "tenantId",
      "tenantName",
      "tenantUnit",
      "tenantAddress",
      "tenantEmail",
      "tenantPhone",
      "tenantRent",
      "tenantSecurityDeposit",
      "tenantUtilityUnits",
      "tenantMemo",
      "tenantActive",
      "tenantExcludeUtilities",
      "inactiveTenantList",
      "activeTenantCount",
      "inactiveTenantCount",
      "resetTenantForm",
      "landlordForm",
      "landlordName",
      "landlordAddress",
      "landlordEmail",
      "landlordPhone",
      "paymentInstructions",
      "metricTenants",
      "metricOpen",
      "metricBalance",
      "metricPaid",
      "toast",
      "exportBackupSettings",
      "importBackup",
      "backupCount",
      "backupLatest",
      "restoreLatestBackup",
      "googleClientId",
      "driveAutoSync",
      "driveStatus",
      "connectDrive",
      "loadDriveState",
      "saveDriveState",
      "splashScreen",
      "splashVersion",
      "splashCommitDate",
      "enterApp",
      "paymentDialog",
      "paymentDialogCopy",
      "paymentFull",
      "paymentPartial",
      "paymentCancel",
      "partialPaymentFields",
      "partialPaymentAmount",
      "paymentPartialSave",
    ].forEach((id) => {
      els[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    document.querySelectorAll(".nav-tab").forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.view));
    });
    window.addEventListener("hashchange", () => {
      setView(window.location.hash.replace("#", ""), { replaceHash: false, preserveDraft: true });
    });
    els.startRentWorkflow.addEventListener("click", () => setView("rent"));
    els.startUtilityWorkflow.addEventListener("click", () => setView("utility"));
    els.startSecurityDepositWorkflow.addEventListener("click", () => setView("security"));
    els.reviewInvoicesWorkflow.addEventListener("click", () => setView("invoices"));
    els.enterApp.addEventListener("click", dismissSplash);
    els.paymentFull.addEventListener("click", () => recordInvoicePayment(paymentDialogInvoiceId, "full"));
    els.paymentPartial.addEventListener("click", showPartialPaymentEntry);
    els.paymentPartialSave.addEventListener("click", () => recordInvoicePayment(paymentDialogInvoiceId, "partial"));
    els.paymentCancel.addEventListener("click", closePaymentDialog);
    els.paymentDialog.addEventListener("click", (event) => {
      if (event.target === els.paymentDialog) closePaymentDialog();
    });

    els.tenantSelect.addEventListener("change", () => {
      const currentUtilityCalculation = readUtilityCalculationFromForm(draft.utilityCalculation);
      syncDraftFromForm();
      draft.utilityCalculation = currentUtilityCalculation;
      applyTenantDefaultsToDraft(els.tenantSelect.value, {
        force: true,
        keepCurrentItems: true,
        currentUtilityCalculation,
      });
      renderInvoiceEditor();
      renderInvoicePreview();
      renderOverview();
      markDirty();
    });

    [
      els.invoiceNumber,
      els.issueDate,
      els.dueDate,
      els.billingPeriod,
      els.utilityMethod,
      els.utilityTenantUnits,
      els.utilityTotalUnits,
      els.utilityElectric,
      els.utilityWaterSewer,
      els.utilityGas,
      els.utilityOther,
      els.previousBalance,
      els.credits,
      els.invoiceNotes,
    ].forEach((input) => {
      input.addEventListener("input", () => {
        syncDraftFromForm();
        renderUtilityCalculation();
        renderInvoicePreview();
        renderTotals();
        renderOverview();
        markDirty();
      });
    });

    els.applyUtilityCharge.addEventListener("click", () => {
      syncDraftFromForm();
      applyUtilityCharge();
      renderLineItems();
      renderUtilityCalculation();
      renderInvoicePreview();
      renderTotals();
      renderOverview();
      markDirty();
    });
    if (els.batchUtilityInvoices) els.batchUtilityInvoices.addEventListener("click", batchCreateUtilityInvoices);
    els.createAllUtilityInvoices.addEventListener("click", batchCreateUtilityInvoices);
    [
      els.cycleUtilityMethod,
      els.cycleUtilityTotalUnits,
      els.cycleUtilityElectric,
      els.cycleUtilityWaterSewer,
      els.cycleUtilityGas,
      els.cycleUtilityOther,
    ].forEach((input) => {
      input.addEventListener("input", () => {
        cycleUtilityCalculation = readCycleUtilityCalculation();
        draft.utilityCalculation = utilityCalculationForTenant(getTenant(draft.tenantId), cycleUtilityCalculation);
        fillUtilityCalculationForm(draft.utilityCalculation);
        renderUtilityCalculation();
        renderUtilityBatchPanel();
        renderInvoicePreview();
        renderTotals();
      });
    });
    els.rentBatchList.addEventListener("click", handleCycleActionClick);
    els.securityDepositBatchList.addEventListener("click", handleCycleActionClick);
    els.utilityAllocationList.addEventListener("click", handleCycleActionClick);
    els.createAllRentInvoices.addEventListener("click", createAllRentInvoices);
    els.createAllSecurityDepositInvoices.addEventListener("click", createAllSecurityDepositInvoices);

    els.applyRentCharge.addEventListener("click", () => {
      syncDraftFromForm();
      applyRentCharge();
      renderLineItems();
      renderInvoicePreview();
      renderTotals();
      renderOverview();
      markDirty();
    });

    els.addLineItem.addEventListener("click", () => {
      syncDraftFromForm();
      draft.lineItems.push(defaultManualLineItem(draft.invoiceType));
      renderLineItems();
      renderInvoicePreview();
      renderTotals();
      renderOverview();
      markDirty();
    });

    els.lineItems.addEventListener("input", (event) => {
      if (!event.target.closest(".line-item")) return;
      syncDraftFromForm();
      renderInvoicePreview();
      renderTotals();
      renderOverview();
      markDirty();
    });

    els.lineItems.addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-remove-line]");
      if (!removeButton) return;
      syncDraftFromForm();
      const index = Number(removeButton.dataset.removeLine);
      draft.lineItems.splice(index, 1);
      renderLineItems();
      renderInvoicePreview();
      renderTotals();
      markDirty();
    });

    els.tenantForm.addEventListener("submit", saveTenant);
    els.tenantPhone.addEventListener("blur", () => {
      els.tenantPhone.value = formatPhoneNumber(els.tenantPhone.value);
    });
    els.addTenant.addEventListener("click", () => {
      tenantEditorId = "";
      fillTenantForm("");
      setView("tenants");
    });
    els.deleteTenant.addEventListener("click", deleteTenant);
    els.resetTenantForm.addEventListener("click", () => fillTenantForm(tenantEditorId));
    els.tenantList.addEventListener("click", handleTenantListClick);
    els.inactiveTenantList.addEventListener("click", handleTenantListClick);

    els.landlordForm.addEventListener("submit", saveLandlord);
    els.landlordPhone.addEventListener("blur", () => {
      els.landlordPhone.value = formatPhoneNumber(els.landlordPhone.value);
    });
    els.driveAutoSync.addEventListener("change", () => saveDriveSettings(false));
    els.connectDrive.addEventListener("click", connectDrive);
    els.loadDriveState.addEventListener("click", loadStateFromDrive);
    els.saveDriveState.addEventListener("click", () => saveStateToDrive("Manual upload"));

    document.getElementById("invoiceForm").addEventListener("submit", saveInvoice);
    els.printInvoice.addEventListener("click", () => window.print());
    els.togglePreview.addEventListener("click", togglePreview);
    els.clearPaid.addEventListener("click", clearPaidInvoices);
    els.invoiceHistory.addEventListener("click", handleInvoiceHistoryClick);
    els.overviewInvoiceList.addEventListener("click", handleInvoiceHistoryClick);
    if (els.exportBackupSettings) els.exportBackupSettings.addEventListener("click", exportBackup);
    if (els.importBackup) els.importBackup.addEventListener("change", importBackup);
    if (els.restoreLatestBackup) els.restoreLatestBackup.addEventListener("click", restoreLatestBackup);
  }

  function renderAll() {
    renderTenantOptions();
    renderInvoiceEditor();
    renderInvoicePreview();
    renderInvoiceHistory();
    renderWorkflowPanels();
    renderOverview();
    renderTenants();
    renderMetrics();
    renderBackupStatus();
  }

  function setInitialView() {
    const requestedView = normalizeViewName(window.location.hash.replace("#", ""));
    setView(requestedView || "overview", { replaceHash: false, preserveDraft: true });
  }

  function setView(viewName, options = {}) {
    const nextView = normalizeViewName(viewName);
    const workflowType = invoiceWorkflowFromView(nextView);
    if (workflowType) {
      setInvoiceWorkflow(workflowType, options);
    }
    const activeViewId = workflowType ? "view-invoice" : `view-${nextView}`;
    document.querySelectorAll(".nav-tab").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.view === nextView);
    });
    document.querySelectorAll(".view").forEach((view) => {
      view.classList.toggle("is-active", view.id === activeViewId);
    });
    if (options.replaceHash !== false) window.location.hash = nextView;
    if (workflowType) {
      renderWorkflowPanels();
      setPreviewVisible(false);
    }
    if (nextView === "overview") renderOverview();
    window.scrollTo({ top: 0, behavior: options.instant ? "auto" : "smooth" });
  }

  function normalizeViewName(viewName) {
    if (["overview", "rent", "utility", "security", "invoices", "tenants", "settings"].includes(viewName)) return viewName;
    if (viewName === "invoice") return currentWorkflow;
    return "overview";
  }

  function invoiceWorkflowFromView(viewName) {
    if (viewName === "rent") return "rent";
    if (viewName === "utility") return "utility";
    if (viewName === "security") return "security";
    return "";
  }

  function setInvoiceWorkflow(invoiceType, options = {}) {
    const nextType = workflowFromInvoiceType(invoiceType);
    currentWorkflow = nextType;
    if (normalizeInvoiceType(draft.invoiceType) !== nextType) {
      startNewInvoice(nextType, { silent: true });
      return;
    }
    draft.invoiceType = nextType;
    if (!selectedInvoiceId) {
      applyTenantDefaultsToDraft(draft.tenantId || selectedTenantId, { force: false });
    }
    renderInvoiceEditor();
    renderInvoicePreview();
    renderWorkflowPanels();
  }

  function renderSplash() {
    if (!els.splashScreen) return;
    els.splashVersion.textContent = APP_VERSION;
    els.splashCommitDate.textContent = APP_COMMIT_DATE;
    const seen = sessionStorage.getItem(SPLASH_SEEN_KEY) === "true";
    els.splashScreen.hidden = seen;
  }

  function dismissSplash() {
    sessionStorage.setItem(SPLASH_SEEN_KEY, "true");
    els.splashScreen.hidden = true;
  }

  function togglePreview() {
    const previewPanel = document.querySelector(".preview-panel");
    setPreviewVisible(!previewPanel?.classList.contains("is-preview-visible"));
    if (previewPanel?.classList.contains("is-preview-visible")) {
      previewPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function setPreviewVisible(visible) {
    const previewPanel = document.querySelector(".preview-panel");
    if (!previewPanel) return;
    previewPanel.classList.toggle("is-preview-visible", Boolean(visible));
    if (els.togglePreview) {
      els.togglePreview.textContent = visible ? "Hide preview" : "Preview";
    }
  }

  function renderTenantOptions() {
    let activeTenants = selectableTenantsForCurrentWorkflow();
    const savedInvoiceTenant = selectedInvoiceId ? getTenant(draft.tenantId || selectedTenantId) : null;
    if (!activeTenants.length && savedInvoiceTenant) {
      activeTenants = [savedInvoiceTenant];
    }
    if (!activeTenants.length) {
      els.tenantSelect.innerHTML =
        currentWorkflow === "utility"
          ? `<option value="">No utility-billable active tenants</option>`
          : currentWorkflow === "security"
            ? `<option value="">No active tenants with security deposits</option>`
          : `<option value="">Add an active tenant first</option>`;
      selectedTenantId = "";
      return;
    }

    const preferredTenantId = selectedTenantId || draft.tenantId;
    const selectedTenant = getTenant(preferredTenantId);
    const includeSelectedTenant =
      selectedTenant && selectedInvoiceId && !activeTenants.some((tenant) => tenant.id === selectedTenant.id);
    els.tenantSelect.innerHTML = activeTenants
      .map((tenant) => {
        const label = [tenant.name, tenant.unit].filter(Boolean).join(" - ");
        return `<option value="${escapeAttr(tenant.id)}">${escapeHtml(label)}</option>`;
      })
      .concat(
        includeSelectedTenant
          ? [
              `<option value="${escapeAttr(selectedTenant.id)}">${escapeHtml(
                [selectedTenant.name, selectedTenant.unit].filter(Boolean).join(" - ")
              )}${selectedTenant.active === false ? " (inactive)" : ""}</option>`,
            ]
          : []
      )
      .join("");
    const previousTenantId = draft.tenantId;
    if (activeTenants.some((tenant) => tenant.id === preferredTenantId) || includeSelectedTenant) {
      selectedTenantId = preferredTenantId;
      if (!selectedInvoiceId) draft.tenantId = preferredTenantId;
    } else {
      selectedTenantId = activeTenants[0].id;
      if (!selectedInvoiceId) draft.tenantId = selectedTenantId;
    }
    els.tenantSelect.value = selectedTenantId || draft.tenantId || activeTenants[0].id;
    if (!selectedInvoiceId && draft.tenantId && draft.tenantId !== previousTenantId) {
      applyTenantDefaultsToDraft(draft.tenantId, { force: true });
    }
  }

  function renderInvoiceEditor() {
    renderTenantOptions();
    draft.invoiceType = normalizeInvoiceType(draft.invoiceType);
    currentWorkflow = workflowFromInvoiceType(draft.invoiceType);
    renderWorkflowHeader(draft.invoiceType);
    els.invoiceType.value = draft.invoiceType;
    els.utilityCalculator.hidden = !invoiceAllowsUtility(draft.invoiceType);
    els.invoiceNumber.value = draft.invoiceNumber;
    els.issueDate.value = draft.issueDate;
    els.dueDate.value = draft.dueDate;
    els.billingPeriod.value = draft.billingPeriod;
    fillUtilityCalculationForm(draft.utilityCalculation || defaultUtilityCalculation(getTenant(draft.tenantId)));
    els.previousBalance.value = normalizeNumberInput(draft.previousBalance);
    els.credits.value = normalizeNumberInput(draft.credits);
    els.invoiceNotes.value = draft.notes;
    els.applyRentCharge.hidden = normalizeInvoiceType(draft.invoiceType) === "utility";
    els.invoiceStatus.textContent = invoiceStatusLabel();
    els.saveState.textContent = invoiceStatusLabel();
    renderLineItems();
    renderUtilityCalculation();
    renderTotals();
  }

  function invoiceStatusLabel() {
    if (draft.status === "partial") return "Partially paid";
    if (draft.status === "paid") return "Paid";
    return selectedInvoiceId ? "Saved locally" : "Draft";
  }

  function renderWorkflowHeader(invoiceType) {
    const type = normalizeInvoiceType(invoiceType);
    if (type === "utility") {
      els.workflowEyebrow.textContent = "Utility workflow";
      els.invoiceHeading.textContent = "Utility Invoice";
      els.workflowCopy.textContent = "Calculate shared utility bills and save a separate utility invoice.";
      return;
    }
    if (type === "security") {
      els.workflowEyebrow.textContent = "Security deposit workflow";
      els.invoiceHeading.textContent = "Security Deposit Invoice";
      els.workflowCopy.textContent = "Create separate invoices for tenant security deposits.";
      return;
    }
    els.workflowEyebrow.textContent = "Rent workflow";
    els.invoiceHeading.textContent = "Rent Invoice";
    els.workflowCopy.textContent = "Create monthly rent invoices for active tenants.";
  }

  function renderLineItems() {
    if (!draft.lineItems.length) {
      const message =
        normalizeInvoiceType(draft.invoiceType) === "rent"
          ? "No charges yet. Apply the rent charge or add an item."
          : normalizeInvoiceType(draft.invoiceType) === "security"
            ? "No charges yet. Apply the security deposit charge or add an item."
          : "No charges yet. Apply a utility charge or add an item.";
      els.lineItems.innerHTML = `<div class="empty-state">${message}</div>`;
      return;
    }

    els.lineItems.innerHTML = draft.lineItems
      .map(
        (item, index) => `
        <div class="line-item" data-generated-utility="${item.generatedUtility ? "true" : "false"}">
          <label>
            Type
            <select data-line-type="${index}">
              ${["Rent", "Security Deposit", "Electric", "Water", "Gas", "Trash", "Internet", "Utility", "Fee", "Other"]
                .map(
                  (type) =>
                    `<option value="${type}" ${item.type === type ? "selected" : ""}>${type}</option>`
                )
                .join("")}
            </select>
          </label>
          <label>
            Description
            <input data-line-description="${index}" type="text" value="${escapeAttr(item.description)}" />
          </label>
          <label>
            Amount
            <input data-line-amount="${index}" type="number" min="0" step="0.01" value="${normalizeNumberInput(
              item.amount
            )}" />
          </label>
          <button class="remove-line" data-remove-line="${index}" type="button" aria-label="Remove line item">&times;</button>
        </div>`
      )
      .join("");
  }

  function renderInvoicePreview() {
    const invoice = getDraftSnapshot();
    const tenant = getTenant(invoice.tenantId);
    const landlord = state.landlord;
    const subtotal = sumLineItems(invoice.lineItems);
    const paymentTotal = invoicePaymentTotal(invoice);
    const totalDue = calculateTotal(invoice);

    const tenantAddress = tenant?.address || "";
    const landlordAddress = landlord.address || "";
    const landlordPhone = formatPhoneNumber(landlord.phone);
    const paymentInstructions = invoice.paymentInstructions || landlord.paymentInstructions || "";
    const utilityDetails = utilityCalculationDetails(invoice.utilityCalculation);
    const invoiceType = normalizeInvoiceType(invoice.invoiceType);

    els.invoicePreview.innerHTML = `
      <header class="invoice-doc-header">
        <div class="invoice-logo-row">
          <img class="invoice-logo" src="assets/rent-ledger-icon.svg" alt="" />
          <div>
            <h2>${escapeHtml(landlord.name || "Landlord")}</h2>
            <p class="doc-muted">${formatMultiline(landlordAddress)}</p>
            <p class="doc-muted">${escapeHtml([landlord.email, landlordPhone].filter(Boolean).join(" | "))}</p>
          </div>
        </div>
        <div class="invoice-title">
          <h2>${escapeHtml(invoiceTypeLabel(invoiceType))}</h2>
          <p class="doc-muted">${escapeHtml(invoice.invoiceNumber || "")}</p>
        </div>
      </header>

      <section class="doc-grid">
        <div class="doc-block">
          <h3>Bill to</h3>
          <p><strong>${escapeHtml(tenant?.name || "Tenant")}</strong></p>
          <p>${escapeHtml(tenant?.unit || "")}</p>
          <p>${formatMultiline(tenantAddress)}</p>
          <p class="doc-muted">${escapeHtml(tenant?.email || "")}</p>
        </div>
        <div class="doc-facts">
          ${docFact("Issue date", formatDate(invoice.issueDate))}
          ${docFact("Due date", formatDate(invoice.dueDate))}
          ${docFact("Billing period", invoice.billingPeriod)}
          ${docFact("Invoice type", invoiceTypeLabel(invoiceType))}
          ${docFact("Status", invoiceStatusText(invoice))}
        </div>
      </section>

      <table class="doc-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Description</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${invoice.lineItems
            .map(
              (item) => `
              <tr>
                <td>${escapeHtml(item.type || "")}</td>
                <td>${escapeHtml(item.description || "")}</td>
                <td>${formatMoney(item.amount)}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>

      <section class="doc-summary" aria-label="Invoice totals">
        ${summaryRow("Subtotal", subtotal)}
        ${summaryRow("Previous balance", invoice.previousBalance)}
        ${summaryRow("Credits / adjustments", -Number(invoice.credits || 0))}
        ${paymentTotal ? summaryRow("Payments received", -paymentTotal) : ""}
        <div class="doc-summary-row total">
          <span>Balance due</span>
          <strong>${formatMoney(totalDue)}</strong>
        </div>
      </section>

      <section class="doc-notes">
        <div class="doc-grid">
          ${invoiceAllowsUtility(invoiceType) && utilityDetails.hasTotal ? `
          <div class="doc-block">
            <h3>Utility calculation</h3>
            <p>${escapeHtml(utilityDetails.explanation)}</p>
            <p class="doc-muted">${escapeHtml(utilityDetails.billSummary)}</p>
          </div>` : ""}
          <div class="doc-block">
            <h3>Payment</h3>
            <p>${formatMultiline(paymentInstructions)}</p>
          </div>
          <div class="doc-block">
            <h3>Notes</h3>
            <p>${formatMultiline(invoice.notes || "")}</p>
          </div>
        </div>
      </section>
    `;
  }

  function renderTotals() {
    const invoice = getDraftSnapshot();
    els.totalDue.textContent = formatMoney(calculateTotal(invoice));
  }

  function fillUtilityCalculationForm(calculation) {
    const current = normalizeUtilityCalculation(calculation);
    els.utilityMethod.value = current.method;
    els.utilityTenantUnits.value = normalizeNumberInput(current.tenantUnits);
    els.utilityTotalUnits.value = normalizeNumberInput(current.totalUnits);
    els.utilityElectric.value = normalizeNumberInput(current.electric);
    els.utilityWaterSewer.value = normalizeNumberInput(current.waterSewer);
    els.utilityGas.value = normalizeNumberInput(current.gas);
    els.utilityOther.value = normalizeNumberInput(current.other);
  }

  function renderUtilityCalculation() {
    if (!invoiceAllowsUtility(draft.invoiceType)) {
      els.utilityCalcResult.textContent = "Utility allocation is available for utility invoices.";
      renderUtilityBatchSummary();
      return;
    }
    const details = utilityCalculationDetails(draft.utilityCalculation || {});
    if (!details.hasTotal) {
      els.utilityCalcResult.textContent = "Enter bills and units to calculate a utility share.";
      renderUtilityBatchSummary();
      return;
    }
    els.utilityCalcResult.textContent = `${details.explanation} ${details.billSummary}`;
    renderUtilityBatchSummary();
  }

  function renderUtilityBatchSummary() {
    if (!els.utilityBatchSummary) return;
    if (!invoiceAllowsUtility(draft.invoiceType)) {
      els.utilityBatchSummary.textContent = "";
      return;
    }
    const summary = currentCycleSummary();
    const remaining = summary.missingUtilities.length;
    els.utilityBatchSummary.textContent = remaining
      ? `${remaining} utility-billable tenant${remaining === 1 ? "" : "s"} still need ${summary.utilityPeriod} invoices.`
      : `${summary.utilityPeriod} utility invoices are complete.`;
  }

  function applyUtilityCharge() {
    if (!invoiceAllowsUtility(draft.invoiceType)) {
      showToast("Switch to a utility invoice first.");
      return;
    }
    const details = utilityCalculationDetails(draft.utilityCalculation || {});
    if (!details.hasTotal || details.share <= 0) {
      showToast("Enter utility bills and allocation units first.");
      return;
    }

    const line = {
      type: "Utility",
      description: utilityLineDescription(draft.utilityCalculation),
      amount: details.share,
      generatedUtility: true,
    };
    const existingIndex = draft.lineItems.findIndex((item) => item.generatedUtility);
    if (existingIndex >= 0) {
      draft.lineItems[existingIndex] = line;
    } else {
      draft.lineItems.push(line);
    }
    showToast("Utility charge applied.");
  }

  async function batchCreateUtilityInvoices() {
    cycleUtilityCalculation = readCycleUtilityCalculation();
    draft.utilityCalculation = utilityCalculationForTenant(getTenant(draft.tenantId), cycleUtilityCalculation);
    fillUtilityCalculationForm(draft.utilityCalculation);
    if (!invoiceAllowsUtility(draft.invoiceType)) {
      showToast("Open the utility workflow first.");
      return;
    }

    const baseCalculation = normalizeUtilityCalculation(cycleUtilityCalculation);
    const baseDetails = utilityCalculationDetails(baseCalculation);
    if (!baseDetails.hasTotal || baseCalculation.totalUnits <= 0) {
      showToast("Enter utility bills and total units first.");
      return;
    }

    const summary = currentCycleSummary();
    const tenants = summary.missingUtilities;
    if (!tenants.length) {
      showToast(`${summary.utilityPeriod} utility invoices are already complete.`);
      return;
    }

    const confirmed = window.confirm(
      `Create ${tenants.length} utility invoice${tenants.length === 1 ? "" : "s"} for ${summary.utilityPeriod}?`
    );
    if (!confirmed) return;

    const createdInvoices = tenants.map((tenant) => createUtilityInvoiceForTenant(tenant.id, baseCalculation)).filter(Boolean);

    if (!createdInvoices.length) {
      showToast("No utility invoices were created. Check each tenant's utility units.");
      return;
    }

    selectedInvoiceId = createdInvoices[0].id;
    selectedTenantId = createdInvoices[0].tenantId;
    draft = clone(createdInvoices[0]);
    currentWorkflow = "utility";
    saveState(`Created ${createdInvoices.length} utility invoices`);
    renderAll();
    setView("utility", { preserveDraft: true });
    const driveSaved = await saveBatchInvoiceArtifactsToDrive(createdInvoices, "saving utility invoices");
    setSavedStateLabel(driveSaved);
    showToast(
      driveSaved
        ? `Created ${createdInvoices.length} utility invoices and uploaded PDFs.`
        : `Created ${createdInvoices.length} utility invoices locally. Drive save skipped.`
    );
  }

  function applyRentCharge() {
    const invoiceType = normalizeInvoiceType(draft.invoiceType);
    if (invoiceType === "utility") {
      showToast("Use the utility Apply charge button for utility invoices.");
      return;
    }

    const tenant = getTenant(draft.tenantId || selectedTenantId);
    if (!tenant) {
      showToast("Select a tenant before applying the charge.");
      return;
    }

    const systemLine = invoiceType === "security" ? securityDepositLineItems(tenant)[0] : rentLineItems(tenant)[0];
    const systemType = invoiceType === "security" ? "Security Deposit" : "Rent";
    const existingIndex = draft.lineItems.findIndex((item) => item.type === systemType);
    if (existingIndex >= 0) {
      draft.lineItems[existingIndex] = systemLine;
    } else {
      draft.lineItems.unshift(systemLine);
    }
    showToast(invoiceType === "security" ? "Security deposit charge applied." : "Rent charge applied.");
  }

  function renderInvoiceHistory() {
    if (!state.invoices.length) {
      els.invoiceHistory.innerHTML = `<div class="empty-state">No saved invoices yet.</div>`;
      return;
    }

    const sortedInvoices = [...state.invoices].sort((a, b) => {
      return `${b.issueDate || ""}${b.invoiceNumber}`.localeCompare(`${a.issueDate || ""}${a.invoiceNumber}`);
    });

    els.invoiceHistory.innerHTML = sortedInvoices
      .map((invoice) => {
        const tenant = getTenant(invoice.tenantId);
        const paid = isInvoicePaid(invoice);
        const invoiceType = normalizeInvoiceType(invoice.invoiceType);
        return `
          <article class="invoice-card">
            <div>
              <h3>${escapeHtml(invoice.invoiceNumber)} &middot; ${escapeHtml(tenant?.name || "Tenant")}</h3>
              <p>${escapeHtml(invoiceTypeLabel(invoiceType))} &middot; ${escapeHtml(invoice.billingPeriod || "")} &middot; ${formatMoney(calculateTotal(invoice))} &middot; ${escapeHtml(
          invoiceStatusText(invoice)
        )}</p>
            </div>
            <div class="card-actions">
              <button class="small-button" data-load-invoice="${escapeAttr(invoice.id)}" type="button">Open</button>
              <button class="small-button" data-toggle-paid-invoice="${escapeAttr(invoice.id)}" data-paid="${
          paid ? "false" : "true"
        }" type="button">${paid ? "Reopen" : "Mark paid"}</button>
              <button class="small-button danger" data-delete-invoice="${escapeAttr(invoice.id)}" type="button">Delete</button>
            </div>
          </article>`;
      })
      .join("");
  }

  function renderTenants() {
    const activeTenants = getActiveTenants();
    const inactiveTenants = getInactiveTenants();
    els.activeTenantCount.textContent = String(activeTenants.length);
    els.inactiveTenantCount.textContent = String(inactiveTenants.length);
    els.tenantList.innerHTML = activeTenants.length
      ? activeTenants.map(renderTenantCard).join("")
      : `<div class="empty-state">No active tenants saved.</div>`;
    els.inactiveTenantList.innerHTML = inactiveTenants.length
      ? inactiveTenants.map(renderTenantCard).join("")
      : `<div class="empty-state">No inactive tenants.</div>`;
  }

  function renderTenantCard(tenant) {
    const inactive = tenant.active === false;
    return `
        <article class="tenant-card${inactive ? " is-inactive" : ""}">
          <div>
            <h3>${escapeHtml(tenant.name)}</h3>
            <p>${escapeHtml(tenant.unit || "No unit")} &middot; ${formatMoney(tenant.rent || 0)} rent &middot; ${formatMoney(
      tenant.securityDeposit || 0
    )} deposit${
      inactive ? " &middot; Inactive" : ""
    }</p>
          </div>
          <div class="card-actions">
            <button class="small-button" data-edit-tenant="${escapeAttr(tenant.id)}" type="button">Edit</button>
            ${
              inactive
                ? `<button class="small-button" data-activate-tenant="${escapeAttr(tenant.id)}" type="button">Make active</button>`
                : `<button class="small-button" data-create-tenant-invoice="${escapeAttr(
                    tenant.id
                  )}" type="button">Invoice</button>
                   <button class="small-button" data-deactivate-tenant="${escapeAttr(
                     tenant.id
                   )}" type="button">Make inactive</button>`
            }
          </div>
        </article>`;
  }

  function handleTenantListClick(event) {
    const editButton = event.target.closest("[data-edit-tenant]");
    const invoiceButton = event.target.closest("[data-create-tenant-invoice]");
    const activateButton = event.target.closest("[data-activate-tenant]");
    const deactivateButton = event.target.closest("[data-deactivate-tenant]");

    if (editButton) {
      tenantEditorId = editButton.dataset.editTenant;
      fillTenantForm(tenantEditorId);
      return;
    }

    if (invoiceButton) {
      selectedTenantId = invoiceButton.dataset.createTenantInvoice;
      startNewInvoice("rent");
      setView("rent", { preserveDraft: true });
      return;
    }

    if (activateButton) {
      setTenantActive(activateButton.dataset.activateTenant, true);
      return;
    }

    if (deactivateButton) {
      setTenantActive(deactivateButton.dataset.deactivateTenant, false);
    }
  }

  function setTenantActive(id, active) {
    const tenant = state.tenants.find((item) => item.id === id);
    if (!tenant) return;
    tenant.active = active;
    if (!active && selectedTenantId === id && !selectedInvoiceId) {
      selectedTenantId = firstActiveTenantId() || "";
      draft = createBlankInvoice(selectedTenantId);
    }
    if (tenantEditorId === id) fillTenantForm(id);
    saveState(active ? "Activated tenant" : "Deactivated tenant");
    renderAll();
    showToast(`${tenant.name} marked ${active ? "active" : "inactive"}.`);
  }

  function getActiveTenants() {
    return state.tenants.filter((tenant) => tenant.active !== false);
  }

  function getUtilityBillableTenants() {
    return getActiveTenants().filter(isUtilityBillableTenant);
  }

  function getSecurityDepositTenants() {
    return getActiveTenants().filter((tenant) => toNumber(tenant.securityDeposit) > 0);
  }

  function isUtilityBillableTenant(tenant) {
    return tenant?.active !== false && !tenant.excludeUtilities;
  }

  function selectableTenantsForCurrentWorkflow() {
    if (currentWorkflow === "utility") return getUtilityBillableTenants();
    if (currentWorkflow === "security") return getSecurityDepositTenants();
    return getActiveTenants();
  }

  function getInactiveTenants() {
    return state.tenants.filter((tenant) => tenant.active === false);
  }

  function firstActiveTenantId() {
    return getActiveTenants()[0]?.id || "";
  }

  function firstUtilityBillableTenantId() {
    return getUtilityBillableTenants()[0]?.id || "";
  }

  function firstSecurityDepositTenantId() {
    return getSecurityDepositTenants()[0]?.id || "";
  }

  function applyTenantDefaultsToDraft(tenantId, options = {}) {
    selectedTenantId = tenantId || "";
    draft.tenantId = selectedTenantId;

    const tenant = getTenant(selectedTenantId);
    if (!tenant || selectedInvoiceId) return;

    const currentItems = options.keepCurrentItems ? draft.lineItems : [];
    if (options.force || !draft.lineItems.length) {
      draft.lineItems = lineItemsForInvoiceType(tenant, draft.invoiceType, currentItems);
      draft.utilityCalculation = options.keepCurrentItems
        ? utilityCalculationForTenant(tenant, options.currentUtilityCalculation || draft.utilityCalculation)
        : defaultUtilityCalculation(tenant);
    }
  }

  function utilityCalculationForTenant(tenant, currentCalculation) {
    const current = normalizeUtilityCalculation(currentCalculation);
    return {
      ...current,
      tenantUnits: defaultUtilityCalculation(tenant).tenantUnits,
    };
  }

  function renderWorkflowPanels() {
    if (!els.rentBatchPanel || !els.utilityBatchPanel || !els.securityDepositBatchPanel) return;
    const summary = currentCycleSummary();
    els.rentBatchPanel.hidden = currentWorkflow !== "rent";
    els.utilityBatchPanel.hidden = currentWorkflow !== "utility";
    els.securityDepositBatchPanel.hidden = currentWorkflow !== "security";

    if (currentWorkflow === "rent") {
      renderRentBatchPanel(summary);
    } else if (currentWorkflow === "utility") {
      fillCycleUtilityCalculationForm(cycleUtilityCalculation);
      renderUtilityBatchPanel(summary);
    } else {
      renderSecurityDepositBatchPanel(summary);
    }
  }

  function renderRentBatchPanel(summary = currentCycleSummary()) {
    els.rentBatchHeading.textContent = `${summary.period} Rent`;
    els.rentBatchCopy.textContent = `${summary.missingRent.length} active tenant${
      summary.missingRent.length === 1 ? "" : "s"
    } still need rent invoices due ${formatDate(summary.dueDate)}.`;
    els.createAllRentInvoices.disabled = summary.missingRent.length === 0;
    els.rentBatchList.innerHTML = getActiveTenants().length
      ? getActiveTenants().map((tenant) => renderRentCycleRow(tenant, summary)).join("")
      : `<div class="empty-state">No active tenants are available for rent billing.</div>`;
  }

  function renderRentCycleRow(tenant, summary) {
    const invoice = currentRentInvoiceForTenant(tenant.id, summary);
    const status = invoice ? invoiceStatusText(invoice) : "Not created";
    const detail = `${formatMoney(tenant.rent || 0)} monthly rent`;
    return renderCycleRow({
      tenant,
      title: [tenant.name, tenant.unit].filter(Boolean).join(" - "),
      detail,
      status,
      amount: formatMoney(tenant.rent || 0),
      invoice,
      createAction: `data-create-rent-invoice="${escapeAttr(tenant.id)}"`,
      createLabel: "Create",
    });
  }

  function renderSecurityDepositBatchPanel(summary = currentCycleSummary()) {
    els.securityDepositBatchHeading.textContent = `${summary.period} Security Deposits`;
    els.securityDepositBatchCopy.textContent = `${summary.missingSecurityDeposits.length} active tenant${
      summary.missingSecurityDeposits.length === 1 ? "" : "s"
    } with security deposits still need invoices due ${formatDate(summary.dueDate)}.`;
    els.createAllSecurityDepositInvoices.disabled = summary.missingSecurityDeposits.length === 0;
    const tenants = getSecurityDepositTenants();
    els.securityDepositBatchList.innerHTML = tenants.length
      ? tenants.map((tenant) => renderSecurityDepositCycleRow(tenant, summary)).join("")
      : `<div class="empty-state">No active tenants have a security deposit amount.</div>`;
  }

  function renderSecurityDepositCycleRow(tenant, summary) {
    const invoice = currentSecurityDepositInvoiceForTenant(tenant.id, summary);
    const status = invoice ? invoiceStatusText(invoice) : "Not created";
    const detail = `${formatMoney(tenant.securityDeposit || 0)} security deposit`;
    return renderCycleRow({
      tenant,
      title: [tenant.name, tenant.unit].filter(Boolean).join(" - "),
      detail,
      status,
      amount: formatMoney(tenant.securityDeposit || 0),
      invoice,
      createAction: `data-create-security-deposit-invoice="${escapeAttr(tenant.id)}"`,
      createLabel: "Create",
      createDisabled: toNumber(tenant.securityDeposit) <= 0,
    });
  }

  function renderUtilityBatchPanel(summary = currentCycleSummary()) {
    const details = utilityCalculationDetails(cycleUtilityCalculation);
    els.utilityBatchHeading.textContent = `${summary.utilityPeriod} Utilities`;
    els.utilityBatchCopy.textContent = `Rent cycle due ${formatDate(summary.dueDate)}. ${
      details.hasTotal ? `Total utility bills: ${formatMoney(details.totalCharges)}.` : "Enter utility bills to calculate tenant shares."
    }`;
    els.createAllUtilityInvoices.disabled =
      summary.missingUtilities.length === 0 || !details.hasTotal || cycleUtilityCalculation.totalUnits <= 0;
    renderUtilityAllocationList(summary);
  }

  function renderUtilityAllocationList(summary = currentCycleSummary()) {
    const tenants = getUtilityBillableTenants();
    if (!tenants.length) {
      els.utilityAllocationList.innerHTML = `<div class="empty-state">No active tenants are billable for utilities.</div>`;
      return;
    }
    els.utilityAllocationList.innerHTML = tenants.map((tenant) => renderUtilityAllocationRow(tenant, summary)).join("");
  }

  function renderUtilityAllocationRow(tenant, summary) {
    const invoice = currentUtilityInvoiceForTenant(tenant.id, summary);
    const calculation = utilityCalculationForTenant(tenant, cycleUtilityCalculation);
    const details = utilityCalculationDetails(calculation);
    const status = invoice ? invoiceStatusText(invoice) : "Not created";
    const amount = details.hasTotal && details.share > 0 ? formatMoney(details.share) : "$0.00";
    const detail =
      calculation.method === "equalSplit"
        ? `${formatNumber(calculation.totalUnits)} shares`
        : `${formatNumber(calculation.tenantUnits)} of ${formatNumber(calculation.totalUnits)} occupancy units`;
    return renderCycleRow({
      tenant,
      title: [tenant.name, tenant.unit].filter(Boolean).join(" - "),
      detail,
      status,
      amount,
      invoice,
      createAction: `data-create-utility-invoice="${escapeAttr(tenant.id)}"`,
      createLabel: "Create",
      createDisabled: !details.hasTotal || details.share <= 0,
    });
  }

  function renderCycleRow({ tenant, title, detail, status, amount, invoice, createAction, createLabel, createDisabled = false }) {
    const actions = invoice
      ? `
          <button class="small-button" data-load-invoice="${escapeAttr(invoice.id)}" type="button">Open</button>
          <button class="small-button" data-toggle-paid-invoice="${escapeAttr(invoice.id)}" data-paid="${
          isInvoicePaid(invoice) ? "false" : "true"
        }" type="button">${isInvoicePaid(invoice) ? "Reopen" : "Mark paid"}</button>`
      : `<button class="small-button" ${createAction} ${createDisabled ? "disabled" : ""} type="button">${createLabel}</button>`;
    return `
      <article class="cycle-row">
        <div>
          <h3>${escapeHtml(title || tenant.name || "Tenant")}</h3>
          <p>${escapeHtml(detail)} &middot; ${escapeHtml(status)}</p>
        </div>
        <strong>${escapeHtml(amount)}</strong>
        <div class="card-actions">${actions}</div>
      </article>`;
  }

  function currentRentInvoiceForTenant(tenantId, summary = currentCycleSummary()) {
    return summary.cycleInvoices.find((invoice) => invoice.tenantId === tenantId && invoiceIncludesRent(invoice));
  }

  function currentUtilityInvoiceForTenant(tenantId, summary = currentCycleSummary()) {
    return summary.cycleInvoices.find((invoice) => invoice.tenantId === tenantId && invoiceIncludesUtility(invoice));
  }

  function currentSecurityDepositInvoiceForTenant(tenantId, summary = currentCycleSummary()) {
    return summary.cycleInvoices.find(
      (invoice) => invoice.tenantId === tenantId && invoiceIncludesSecurityDeposit(invoice)
    );
  }

  function invoiceStatusText(invoice) {
    if (invoice.status === "paid") return "Paid";
    if (invoice.status === "partial") return "Partially paid";
    return "Open";
  }

  function isInvoicePaid(invoice) {
    return invoice?.status === "paid";
  }

  function fillCycleUtilityCalculationForm(calculation) {
    const current = normalizeUtilityCalculation(calculation);
    els.cycleUtilityMethod.value = current.method;
    els.cycleUtilityTotalUnits.value = normalizeNumberInput(current.totalUnits);
    els.cycleUtilityElectric.value = normalizeNumberInput(current.electric);
    els.cycleUtilityWaterSewer.value = normalizeNumberInput(current.waterSewer);
    els.cycleUtilityGas.value = normalizeNumberInput(current.gas);
    els.cycleUtilityOther.value = normalizeNumberInput(current.other);
  }

  function readCycleUtilityCalculation() {
    return {
      method: els.cycleUtilityMethod.value || "occupancyUnits",
      tenantUnits: toNumber(draft.utilityCalculation?.tenantUnits),
      totalUnits: toNumber(els.cycleUtilityTotalUnits.value),
      electric: toNumber(els.cycleUtilityElectric.value),
      waterSewer: toNumber(els.cycleUtilityWaterSewer.value),
      gas: toNumber(els.cycleUtilityGas.value),
      other: toNumber(els.cycleUtilityOther.value),
    };
  }

  async function handleCycleActionClick(event) {
    const paidButton = event.target.closest("[data-toggle-paid-invoice]");
    const loadButton = event.target.closest("[data-load-invoice]");
    const rentButton = event.target.closest("[data-create-rent-invoice]");
    const utilityButton = event.target.closest("[data-create-utility-invoice]");
    const securityButton = event.target.closest("[data-create-security-deposit-invoice]");

    if (paidButton || loadButton) {
      handleInvoiceHistoryClick(event);
      return;
    }

    if (rentButton) {
      const invoice = createRentInvoiceForTenant(rentButton.dataset.createRentInvoice);
      if (!invoice) return;
      selectedInvoiceId = invoice.id;
      selectedTenantId = invoice.tenantId;
      draft = clone(invoice);
      currentWorkflow = "rent";
      saveState("Created rent invoice");
      renderAll();
      setView("rent", { preserveDraft: true });
      const driveSaved = await saveInvoiceArtifactsToDrive(invoice);
      setSavedStateLabel(driveSaved);
      showToast(driveSaved ? "Rent invoice saved to browser and Drive." : "Rent invoice saved locally. Drive save skipped.");
      return;
    }

    if (utilityButton) {
      cycleUtilityCalculation = readCycleUtilityCalculation();
      const invoice = createUtilityInvoiceForTenant(utilityButton.dataset.createUtilityInvoice, cycleUtilityCalculation);
      if (!invoice) return;
      selectedInvoiceId = invoice.id;
      selectedTenantId = invoice.tenantId;
      draft = clone(invoice);
      currentWorkflow = "utility";
      saveState("Created utility invoice");
      renderAll();
      setView("utility", { preserveDraft: true });
      const driveSaved = await saveInvoiceArtifactsToDrive(invoice);
      setSavedStateLabel(driveSaved);
      showToast(
        driveSaved ? "Utility invoice saved to browser and Drive." : "Utility invoice saved locally. Drive save skipped."
      );
      return;
    }

    if (securityButton) {
      const invoice = createSecurityDepositInvoiceForTenant(securityButton.dataset.createSecurityDepositInvoice);
      if (!invoice) return;
      selectedInvoiceId = invoice.id;
      selectedTenantId = invoice.tenantId;
      draft = clone(invoice);
      currentWorkflow = "security";
      saveState("Created security deposit invoice");
      renderAll();
      setView("security", { preserveDraft: true });
      const driveSaved = await saveInvoiceArtifactsToDrive(invoice);
      setSavedStateLabel(driveSaved);
      showToast(
        driveSaved
          ? "Security deposit invoice saved to browser and Drive."
          : "Security deposit invoice saved locally. Drive save skipped."
      );
    }
  }

  async function createAllRentInvoices() {
    const summary = currentCycleSummary();
    const tenants = summary.missingRent;
    if (!tenants.length) {
      showToast(`${summary.period} rent invoices are already complete.`);
      return;
    }

    const confirmed = window.confirm(
      `Create ${tenants.length} rent invoice${tenants.length === 1 ? "" : "s"} for ${summary.period}?`
    );
    if (!confirmed) return;

    const createdInvoices = tenants.map((tenant) => createRentInvoiceForTenant(tenant.id)).filter(Boolean);
    if (!createdInvoices.length) {
      showToast("No rent invoices were created.");
      return;
    }

    selectedInvoiceId = createdInvoices[0].id;
    selectedTenantId = createdInvoices[0].tenantId;
    draft = clone(createdInvoices[0]);
    currentWorkflow = "rent";
    saveState(`Created ${createdInvoices.length} rent invoices`);
    renderAll();
    setView("rent", { preserveDraft: true });
    const driveSaved = await saveBatchInvoiceArtifactsToDrive(createdInvoices, "saving rent invoices");
    setSavedStateLabel(driveSaved);
    showToast(
      driveSaved
        ? `Created ${createdInvoices.length} rent invoices and uploaded PDFs.`
        : `Created ${createdInvoices.length} rent invoices locally. Drive save skipped.`
    );
  }

  function createRentInvoiceForTenant(tenantId) {
    const summary = currentCycleSummary();
    const tenant = getTenant(tenantId);
    if (!tenant || tenant.active === false) {
      showToast("Choose an active tenant before creating a rent invoice.");
      return null;
    }
    const existing = currentRentInvoiceForTenant(tenant.id, summary);
    if (existing) {
      openInvoiceById(existing.id, { message: "Rent invoice already exists." });
      return null;
    }

    const invoice = createBlankInvoice(tenant.id, "rent");
    invoice.id = cryptoId();
    invoice.dueDate = summary.dueDate;
    invoice.billingPeriod = summary.period;
    invoice.lineItems = rentLineItems(tenant);
    invoice.notes = normalizeInvoiceType(draft.invoiceType) === "rent" ? draft.notes || "" : "";
    invoice.paymentInstructions = state.landlord.paymentInstructions;
    invoice.status = "open";
    invoice.updatedAt = new Date().toISOString();
    state.invoices.push(invoice);
    return invoice;
  }

  async function createAllSecurityDepositInvoices() {
    const summary = currentCycleSummary();
    const tenants = summary.missingSecurityDeposits;
    if (!tenants.length) {
      showToast(`${summary.period} security deposit invoices are already complete.`);
      return;
    }

    const confirmed = window.confirm(
      `Create ${tenants.length} security deposit invoice${tenants.length === 1 ? "" : "s"} for ${summary.period}?`
    );
    if (!confirmed) return;

    const createdInvoices = tenants.map((tenant) => createSecurityDepositInvoiceForTenant(tenant.id)).filter(Boolean);
    if (!createdInvoices.length) {
      showToast("No security deposit invoices were created.");
      return;
    }

    selectedInvoiceId = createdInvoices[0].id;
    selectedTenantId = createdInvoices[0].tenantId;
    draft = clone(createdInvoices[0]);
    currentWorkflow = "security";
    saveState(`Created ${createdInvoices.length} security deposit invoices`);
    renderAll();
    setView("security", { preserveDraft: true });
    const driveSaved = await saveBatchInvoiceArtifactsToDrive(createdInvoices, "saving security deposit invoices");
    setSavedStateLabel(driveSaved);
    showToast(
      driveSaved
        ? `Created ${createdInvoices.length} security deposit invoices and uploaded PDFs.`
        : `Created ${createdInvoices.length} security deposit invoices locally. Drive save skipped.`
    );
  }

  function createSecurityDepositInvoiceForTenant(tenantId) {
    const summary = currentCycleSummary();
    const tenant = getTenant(tenantId);
    if (!tenant || tenant.active === false || toNumber(tenant.securityDeposit) <= 0) {
      showToast("Choose an active tenant with a security deposit before creating this invoice.");
      return null;
    }
    const existing = currentSecurityDepositInvoiceForTenant(tenant.id, summary);
    if (existing) {
      openInvoiceById(existing.id, { message: "Security deposit invoice already exists." });
      return null;
    }

    const invoice = createBlankInvoice(tenant.id, "security");
    invoice.id = cryptoId();
    invoice.dueDate = summary.dueDate;
    invoice.billingPeriod = summary.period;
    invoice.lineItems = securityDepositLineItems(tenant);
    invoice.notes = normalizeInvoiceType(draft.invoiceType) === "security" ? draft.notes || "" : "";
    invoice.paymentInstructions = state.landlord.paymentInstructions;
    invoice.status = "open";
    invoice.updatedAt = new Date().toISOString();
    state.invoices.push(invoice);
    return invoice;
  }

  function createUtilityInvoiceForTenant(tenantId, baseCalculation = cycleUtilityCalculation) {
    const summary = currentCycleSummary();
    const tenant = getTenant(tenantId);
    if (!tenant || !isUtilityBillableTenant(tenant)) {
      showToast("Choose a utility-billable tenant before creating a utility invoice.");
      return null;
    }
    const existing = currentUtilityInvoiceForTenant(tenant.id, summary);
    if (existing) {
      openInvoiceById(existing.id, { message: "Utility invoice already exists." });
      return null;
    }

    const tenantCalculation = utilityCalculationForTenant(tenant, baseCalculation);
    const tenantDetails = utilityCalculationDetails(tenantCalculation);
    if (!tenantDetails.hasTotal || tenantDetails.share <= 0) {
      showToast("Enter utility bills and allocation units first.");
      return null;
    }

    const invoice = createBlankInvoice(tenant.id, "utility");
    invoice.id = cryptoId();
    invoice.dueDate = summary.dueDate;
    invoice.billingPeriod = summary.utilityPeriod;
    invoice.utilityCalculation = tenantCalculation;
    invoice.notes = normalizeInvoiceType(draft.invoiceType) === "utility" ? draft.notes || "" : "";
    invoice.paymentInstructions = state.landlord.paymentInstructions;
    invoice.lineItems = [
      {
        type: "Utility",
        description: utilityLineDescription(tenantCalculation),
        amount: tenantDetails.share,
        generatedUtility: true,
      },
    ];
    invoice.status = "open";
    invoice.updatedAt = new Date().toISOString();
    state.invoices.push(invoice);
    return invoice;
  }

  function openInvoiceById(invoiceId, options = {}) {
    const invoice = state.invoices.find((item) => item.id === invoiceId);
    if (!invoice) return false;
    selectedInvoiceId = invoice.id;
    selectedTenantId = invoice.tenantId;
    draft = clone(invoice);
    currentWorkflow = workflowFromInvoiceType(invoice.invoiceType);
    if (currentWorkflow === "utility") {
      cycleUtilityCalculation = normalizeUtilityCalculation(invoice.utilityCalculation);
    }
    renderAll();
    setView(currentWorkflow, { preserveDraft: true });
    if (options.scrollToEditor) {
      document.querySelector(".editor-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    showToast(options.message || "Invoice opened.");
    return true;
  }

  function renderMetrics() {
    const openInvoices = state.invoices.filter((invoice) => invoice.status !== "paid");
    const paidInvoices = state.invoices.filter((invoice) => invoice.status === "paid");
    const openBalance = openInvoices.reduce((total, invoice) => total + calculateTotal(invoice), 0);
    els.metricTenants.textContent = String(getActiveTenants().length);
    els.metricOpen.textContent = String(openInvoices.length);
    els.metricBalance.textContent = formatMoney(openBalance);
    els.metricPaid.textContent = String(paidInvoices.length);
  }

  function renderOverview() {
    if (!els.overviewCycleLabel) return;
    const summary = currentCycleSummary();
    els.overviewCycleLabel.textContent = `Rent: ${summary.period} | Utilities: ${summary.utilityPeriod} | Due ${formatDate(summary.dueDate)}`;
    els.overviewCycleStatus.textContent = summary.openInvoices ? `${summary.openInvoices} open` : "Clear";
    els.cycleExpectedRent.textContent = formatMoney(summary.expectedRent);
    els.cycleRentInvoiced.textContent = formatMoney(summary.rentInvoiced);
    els.cycleUtilityInvoiced.textContent = formatMoney(summary.utilityInvoiced);
    els.cycleOpenBalance.textContent = formatMoney(summary.openBalance);
    els.rentWorkflowCount.textContent = `${summary.missingRent.length} remaining`;
    els.utilityWorkflowCount.textContent = `${summary.missingUtilities.length} remaining`;
    els.securityDepositWorkflowCount.textContent = `${summary.missingSecurityDeposits.length} remaining`;
    els.invoiceWorkflowCount.textContent = `${summary.cycleInvoices.length} saved this cycle`;
    els.cycleMissingRent.innerHTML = overviewTenantList(summary.missingRent, "Rent is complete for active tenants.");
    els.cycleMissingUtilities.innerHTML = overviewTenantList(
      summary.missingUtilities,
      "Utility invoices are complete for active tenants."
    );
    els.cycleMissingSecurityDeposits.innerHTML = overviewTenantList(
      summary.missingSecurityDeposits,
      "Security deposit invoices are complete for active tenants with deposit amounts."
    );
    els.overviewInvoiceList.innerHTML = overviewInvoiceList(summary.cycleInvoices);
  }

  function currentCycleSummary() {
    const rentCycleDate = currentRentCycleDate();
    const period = monthLabel(rentCycleDate);
    const utilityPeriod = monthLabel(previousMonthDate(rentCycleDate));
    const dueDate = toDateInput(firstDayOfMonth(rentCycleDate));
    const activeTenants = getActiveTenants();
    const utilityBillableTenants = getUtilityBillableTenants();
    const securityDepositTenants = getSecurityDepositTenants();
    const cycleInvoices = state.invoices.filter((invoice) => isCurrentCycleInvoice(invoice, period, utilityPeriod));
    const missingRent = activeTenants.filter((tenant) => {
      return !cycleInvoices.some((invoice) => invoice.tenantId === tenant.id && invoiceIncludesRent(invoice));
    });
    const missingUtilities = utilityBillableTenants.filter((tenant) => {
      return !cycleInvoices.some((invoice) => invoice.tenantId === tenant.id && invoiceIncludesUtility(invoice));
    });
    const missingSecurityDeposits = securityDepositTenants.filter((tenant) => {
      return !cycleInvoices.some((invoice) => invoice.tenantId === tenant.id && invoiceIncludesSecurityDeposit(invoice));
    });

    return {
      period,
      utilityPeriod,
      dueDate,
      cycleInvoices,
      expectedRent: activeTenants.reduce((total, tenant) => total + toNumber(tenant.rent), 0),
      rentInvoiced: cycleInvoices.reduce((total, invoice) => total + invoiceCategoryTotal(invoice, "rent"), 0),
      utilityInvoiced: cycleInvoices.reduce((total, invoice) => total + invoiceCategoryTotal(invoice, "utility"), 0),
      openBalance: cycleInvoices
        .filter((invoice) => invoice.status !== "paid")
        .reduce((total, invoice) => total + calculateTotal(invoice), 0),
      openInvoices: cycleInvoices.filter((invoice) => invoice.status !== "paid").length,
      missingRent,
      missingUtilities,
      missingSecurityDeposits,
    };
  }

  function sameCycle(invoicePeriod, currentPeriod) {
    return normalizeCycleLabel(invoicePeriod) === normalizeCycleLabel(currentPeriod);
  }

  function isCurrentCycleInvoice(invoice, rentPeriod, utilityPeriod) {
    if (invoiceIncludesUtility(invoice) && sameCycle(invoice.billingPeriod, utilityPeriod)) return true;
    if (invoiceIncludesRent(invoice) && sameCycle(invoice.billingPeriod, rentPeriod)) return true;
    if (invoiceIncludesSecurityDeposit(invoice) && sameCycle(invoice.billingPeriod, rentPeriod)) return true;
    return false;
  }

  function normalizeCycleLabel(value) {
    return String(value || monthLabel(new Date()))
      .trim()
      .toLowerCase()
      .replace(/^\d{1,2}\s*[-/]\s*/, "");
  }

  function invoiceIncludesRent(invoice) {
    const type = normalizeInvoiceType(invoice.invoiceType);
    if (type === "rent" || type === "combined") return true;
    if (type === "utility" || type === "security") return false;
    return (invoice.lineItems || []).some((item) => item.type === "Rent");
  }

  function invoiceIncludesUtility(invoice) {
    const type = normalizeInvoiceType(invoice.invoiceType);
    if (type === "utility" || type === "combined") return true;
    if (type === "rent" || type === "security") return false;
    return (invoice.lineItems || []).some((item) => item.type !== "Rent" && item.type !== "Security Deposit");
  }

  function invoiceIncludesSecurityDeposit(invoice) {
    const type = normalizeInvoiceType(invoice.invoiceType);
    if (type === "security") return true;
    return (invoice.lineItems || []).some((item) => item.type === "Security Deposit");
  }

  function invoiceCategoryTotal(invoice, category) {
    const lineTotal = (invoice.lineItems || []).reduce((total, item) => {
      const isRent = item.type === "Rent";
      const isSecurityDeposit = item.type === "Security Deposit";
      const isUtility = !isRent && !isSecurityDeposit;
      if (category === "rent" && isRent) return total + toNumber(item.amount);
      if (category === "utility" && isUtility) return total + toNumber(item.amount);
      if (category === "security" && isSecurityDeposit) return total + toNumber(item.amount);
      return total;
    }, 0);
    if (lineTotal) return lineTotal;
    const type = normalizeInvoiceType(invoice.invoiceType);
    if (
      (category === "rent" && type === "rent") ||
      (category === "utility" && type === "utility") ||
      (category === "security" && type === "security")
    ) {
      return calculateTotal(invoice);
    }
    return 0;
  }

  function overviewTenantList(tenants, completeMessage) {
    if (!tenants.length) return `<div class="empty-state">${escapeHtml(completeMessage)}</div>`;
    return tenants
      .map((tenant) => {
        const label = [tenant.name, tenant.unit].filter(Boolean).join(" - ");
        return `<div class="overview-list-item">${escapeHtml(label || "Tenant")}</div>`;
      })
      .join("");
  }

  function overviewInvoiceList(invoices) {
    if (!invoices.length) return `<div class="empty-state">No invoices saved for this billing period yet.</div>`;
    return [...invoices]
      .sort((a, b) => `${b.issueDate || ""}${b.invoiceNumber}`.localeCompare(`${a.issueDate || ""}${a.invoiceNumber}`))
      .slice(0, 8)
      .map((invoice) => {
        const tenant = getTenant(invoice.tenantId);
        return `
          <article class="invoice-card">
            <div>
              <h3>${escapeHtml(invoice.invoiceNumber)} &middot; ${escapeHtml(tenant?.name || "Tenant")}</h3>
              <p>${escapeHtml(invoiceTypeLabel(invoice.invoiceType))} &middot; ${formatMoney(calculateTotal(invoice))} &middot; ${
                escapeHtml(invoiceStatusText(invoice))
              }</p>
            </div>
            <div class="card-actions">
              <button class="small-button" data-load-invoice="${escapeAttr(invoice.id)}" type="button">Open</button>
              <button class="small-button" data-toggle-paid-invoice="${escapeAttr(invoice.id)}" data-paid="${
                isInvoicePaid(invoice) ? "false" : "true"
              }" type="button">${isInvoicePaid(invoice) ? "Reopen" : "Mark paid"}</button>
            </div>
          </article>`;
      })
      .join("");
  }

  async function saveInvoice(event) {
    event.preventDefault();
    const invoice = persistCurrentInvoice("Saved invoice");
    if (!invoice) return;
    renderAll();
    const driveSaved = await saveInvoiceArtifactsToDrive(invoice);
    setSavedStateLabel(driveSaved);
    showToast(driveSaved ? "Invoice saved to browser and Drive." : "Invoice saved locally. Drive save skipped.");
  }

  function persistCurrentInvoice(reason) {
    syncDraftFromForm();

    if (!draft.tenantId) {
      showToast("Add a tenant before saving an invoice.");
      setView("tenants");
      return null;
    }

    const invoice = getDraftSnapshot();
    invoice.id = selectedInvoiceId || cryptoId();
    invoice.updatedAt = new Date().toISOString();

    const existingIndex = state.invoices.findIndex((item) => item.id === invoice.id);
    if (existingIndex >= 0) {
      state.invoices[existingIndex] = invoice;
    } else {
      state.invoices.push(invoice);
    }

    selectedInvoiceId = invoice.id;
    draft = clone(invoice);
    saveState(reason);
    return invoice;
  }

  function startNewInvoice(invoiceType = currentWorkflow || draft?.invoiceType || "rent", options = {}) {
    selectedInvoiceId = "";
    const nextType = workflowFromInvoiceType(invoiceType);
    currentWorkflow = nextType;
    const currentTenant = getTenant(selectedTenantId);
    const fallbackTenantId =
      nextType === "utility"
        ? firstUtilityBillableTenantId()
        : nextType === "security"
          ? firstSecurityDepositTenantId()
          : firstActiveTenantId();
    const canKeepTenant =
      currentTenant &&
      currentTenant.active !== false &&
      (nextType !== "utility" || isUtilityBillableTenant(currentTenant)) &&
      (nextType !== "security" || toNumber(currentTenant.securityDeposit) > 0);
    const tenantId = canKeepTenant ? selectedTenantId : fallbackTenantId;
    selectedTenantId = tenantId || "";
    draft = createBlankInvoice(selectedTenantId, nextType);
    if (nextType === "utility") {
      draft.utilityCalculation = utilityCalculationForTenant(getTenant(selectedTenantId), cycleUtilityCalculation);
    }
    renderInvoiceEditor();
    renderInvoicePreview();
    renderOverview();
    if (!options.silent) showToast("Fresh invoice form ready.");
  }

  function setInvoicePaid(invoiceId, paid) {
    if (paid) {
      openPaymentDialog(invoiceId);
      return;
    }
    reopenInvoice(invoiceId);
  }

  function openPaymentDialog(invoiceId) {
    const invoice = state.invoices.find((item) => item.id === invoiceId);
    if (!invoice) return;
    const balance = calculateTotal(invoice);
    if (balance <= 0) {
      invoice.status = "paid";
      invoice.updatedAt = new Date().toISOString();
      saveState("Marked invoice paid");
      renderAll();
      showToast("Invoice marked paid.");
      return;
    }
    paymentDialogInvoiceId = invoice.id;
    els.partialPaymentFields.hidden = true;
    els.partialPaymentAmount.value = "";
    els.partialPaymentAmount.max = String(balance);
    els.paymentDialogCopy.textContent = `Balance due is ${formatMoney(balance)}. Choose Full or enter a partial amount.`;
    els.paymentDialog.hidden = false;
    els.paymentFull.focus();
  }

  function showPartialPaymentEntry() {
    const invoice = state.invoices.find((item) => item.id === paymentDialogInvoiceId);
    if (!invoice) return;
    const balance = calculateTotal(invoice);
    els.partialPaymentFields.hidden = false;
    els.partialPaymentAmount.value = "";
    els.partialPaymentAmount.max = String(balance);
    els.partialPaymentAmount.focus();
  }

  function closePaymentDialog() {
    paymentDialogInvoiceId = "";
    els.paymentDialog.hidden = true;
    els.partialPaymentFields.hidden = true;
    els.partialPaymentAmount.value = "";
  }

  function recordInvoicePayment(invoiceId, mode) {
    const invoice = state.invoices.find((item) => item.id === invoiceId);
    if (!invoice) return;
    const balance = calculateTotal(invoice);
    if (balance <= 0) {
      invoice.status = "paid";
      invoice.updatedAt = new Date().toISOString();
      saveState("Marked invoice paid");
      closePaymentDialog();
      renderAll();
      showToast("Invoice marked paid.");
      return;
    }
    const amount = mode === "full" ? balance : toNumber(els.partialPaymentAmount.value);
    if (amount <= 0) {
      showToast("Enter a payment amount greater than zero.");
      return;
    }
    if (amount > balance) {
      showToast(`Payment cannot exceed the ${formatMoney(balance)} balance.`);
      return;
    }

    invoice.payments = normalizeInvoicePayments(invoice.payments).concat({
      id: cryptoId(),
      date: toDateInput(new Date()),
      amount,
      method: mode === "full" ? "Full payment" : "Partial payment",
    });
    invoice.status = calculateTotal(invoice) <= 0 ? "paid" : "partial";
    invoice.updatedAt = new Date().toISOString();
    if (selectedInvoiceId === invoiceId) {
      draft = clone(invoice);
    }
    saveState(invoice.status === "paid" ? "Marked invoice paid" : "Recorded partial payment");
    closePaymentDialog();
    renderAll();
    showToast(invoice.status === "paid" ? "Invoice marked paid." : "Partial payment recorded.");
  }

  function reopenInvoice(invoiceId) {
    const invoice = state.invoices.find((item) => item.id === invoiceId);
    if (!invoice) return;
    invoice.status = "open";
    invoice.payments = [];
    invoice.updatedAt = new Date().toISOString();
    if (selectedInvoiceId === invoiceId) {
      draft = clone(invoice);
    }
    saveState("Reopened invoice");
    renderAll();
    showToast("Invoice reopened.");
  }

  function handleInvoiceHistoryClick(event) {
    const paidButton = event.target.closest("[data-toggle-paid-invoice]");
    const loadButton = event.target.closest("[data-load-invoice]");
    const deleteButton = event.target.closest("[data-delete-invoice]");

    if (paidButton) {
      setInvoicePaid(paidButton.dataset.togglePaidInvoice, paidButton.dataset.paid === "true");
      return;
    }

    if (loadButton) {
      openInvoiceById(loadButton.dataset.loadInvoice);
      return;
    }

    if (deleteButton) {
      const id = deleteButton.dataset.deleteInvoice;
      if (!window.confirm("Delete this saved invoice?")) return;
      state.invoices = state.invoices.filter((invoice) => invoice.id !== id);
      if (selectedInvoiceId === id) startNewInvoice();
      saveState("Deleted invoice");
      renderAll();
      showToast("Invoice deleted.");
    }
  }

  function clearPaidInvoices() {
    const paidCount = state.invoices.filter((invoice) => invoice.status === "paid").length;
    if (!paidCount) {
      showToast("No paid invoices to delete.");
      return;
    }
    if (!window.confirm(`Delete ${paidCount} paid invoice${paidCount === 1 ? "" : "s"}? This cannot be undone.`)) return;

    state.invoices = state.invoices.filter((invoice) => invoice.status !== "paid");
    if (selectedInvoiceId && !state.invoices.some((invoice) => invoice.id === selectedInvoiceId)) {
      startNewInvoice();
    }
    saveState("Deleted paid invoices");
    renderAll();
    showToast(`${paidCount} paid invoice${paidCount === 1 ? "" : "s"} deleted.`);
  }

  function saveTenant(event) {
    event.preventDefault();
    const id = els.tenantId.value || cryptoId();
    const existingTenant = state.tenants.find((item) => item.id === id);
    const tenant = {
      id,
      name: els.tenantName.value.trim(),
      unit: els.tenantUnit.value.trim(),
      address: els.tenantAddress.value.trim(),
      email: els.tenantEmail.value.trim(),
      phone: formatPhoneNumber(els.tenantPhone.value),
      rent: toNumber(els.tenantRent.value),
      securityDeposit: toNumber(els.tenantSecurityDeposit.value),
      utilityUnits: toNumber(els.tenantUtilityUnits.value),
      active: els.tenantActive.checked,
      excludeUtilities: els.tenantExcludeUtilities.checked,
      payments: existingTenant?.payments || [],
      memo: els.tenantMemo.value.trim(),
    };

    if (!tenant.name) {
      showToast("Tenant name is required.");
      return;
    }

    const existingIndex = state.tenants.findIndex((item) => item.id === id);
    if (existingIndex >= 0) {
      state.tenants[existingIndex] = tenant;
    } else {
      state.tenants.push(tenant);
    }

    tenantEditorId = id;
    if (tenant.active) {
      if (!selectedInvoiceId) {
        applyTenantDefaultsToDraft(id, { force: true });
      } else {
        selectedTenantId = id;
      }
    } else {
      selectedTenantId = firstActiveTenantId() || "";
      if (!selectedInvoiceId && draft.tenantId === id) {
        draft = createBlankInvoice(selectedTenantId);
      }
    }
    saveState("Saved tenant");
    fillTenantForm(id);
    renderAll();
    showToast("Tenant saved.");
  }

  function fillTenantForm(id) {
    const tenant = getTenant(id) || {
      id: "",
      name: "",
      unit: "",
      address: "",
      email: "",
      phone: "",
      rent: "",
      securityDeposit: "",
      utilityUnits: 1,
      active: true,
      excludeUtilities: false,
      memo: "",
    };
    tenantEditorId = tenant.id;
    els.tenantId.value = tenant.id;
    els.tenantName.value = tenant.name || "";
    els.tenantUnit.value = tenant.unit || "";
    els.tenantAddress.value = tenant.address || "";
    els.tenantEmail.value = tenant.email || "";
    els.tenantPhone.value = formatPhoneNumber(tenant.phone);
    els.tenantRent.value = normalizeNumberInput(tenant.rent);
    els.tenantSecurityDeposit.value = normalizeNumberInput(tenant.securityDeposit);
    els.tenantUtilityUnits.value = normalizeNumberInput(tenant.utilityUnits || 1);
    els.tenantMemo.value = tenant.memo || "";
    els.tenantActive.checked = tenant.active !== false;
    els.tenantExcludeUtilities.checked = Boolean(tenant.excludeUtilities);
    els.tenantFormHeading.textContent = tenant.id ? "Tenant Profile" : "New Tenant";
    els.deleteTenant.disabled = !tenant.id;
  }

  function deleteTenant() {
    const id = els.tenantId.value;
    if (!id) return;
    const invoiceCount = state.invoices.filter((invoice) => invoice.tenantId === id).length;
    if (invoiceCount) {
      showToast("Delete related invoices before deleting this tenant.");
      return;
    }
    if (!window.confirm("Delete this tenant?")) return;
    state.tenants = state.tenants.filter((tenant) => tenant.id !== id);
    if (selectedTenantId === id) selectedTenantId = firstActiveTenantId() || "";
    tenantEditorId = selectedTenantId;
    if (draft.tenantId === id) draft = createBlankInvoice(selectedTenantId);
    saveState("Deleted tenant");
    fillTenantForm(selectedTenantId);
    renderAll();
    showToast("Tenant deleted.");
  }

  function fillLandlordForm() {
    els.landlordName.value = state.landlord.name || "";
    els.landlordAddress.value = state.landlord.address || "";
    els.landlordEmail.value = state.landlord.email || "";
    els.landlordPhone.value = formatPhoneNumber(state.landlord.phone);
    els.paymentInstructions.value = state.landlord.paymentInstructions || "";
  }

  function saveLandlord(event) {
    event.preventDefault();
    state.landlord = {
      name: els.landlordName.value.trim(),
      address: els.landlordAddress.value.trim(),
      email: els.landlordEmail.value.trim(),
      phone: formatPhoneNumber(els.landlordPhone.value),
      paymentInstructions: els.paymentInstructions.value.trim(),
    };
    saveState("Saved settings");
    renderInvoicePreview();
    showToast("Settings saved.");
  }

  function fillDriveSettingsForm() {
    els.googleClientId.value = appSettings.googleClientId || "";
    els.driveAutoSync.checked = Boolean(appSettings.driveAutoSync);
    renderDriveStatus();
  }

  function saveDriveSettings(showMessage) {
    const previousClientId = appSettings.googleClientId;
    const nextClientId = cleanGoogleClientId(els.googleClientId.value) || DEFAULT_GOOGLE_CLIENT_ID;
    els.googleClientId.value = nextClientId;
    appSettings = {
      ...appSettings,
      googleClientId: nextClientId,
      driveAutoSync: els.driveAutoSync.checked,
    };
    if (previousClientId !== nextClientId) {
      driveAccessToken = "";
      driveTokenClient = null;
      appSettings.driveFolderId = "";
      appSettings.driveInvoiceFolderId = "";
      appSettings.driveStateFileId = "";
      appSettings.driveRemembered = false;
    }
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(appSettings));
    renderDriveStatus();
    if (!appSettings.driveAutoSync) clearTimeout(driveSyncTimer);
    if (appSettings.driveAutoSync && driveAccessToken) queueDriveSync("Enabled Drive auto-sync");
    if (showMessage) showToast("Drive settings saved.");
  }

  function renderDriveStatus(message) {
    if (!els.driveStatus) return;
    const hasClientId = Boolean(appSettings.googleClientId);
    const hasValidClientId = isValidGoogleClientId(appSettings.googleClientId);
    const connected = Boolean(driveAccessToken);
    const driveActionReady = connected || (hasValidClientId && appSettings.driveRemembered);
    els.connectDrive.disabled = !hasValidClientId;
    els.loadDriveState.disabled = !driveActionReady;
    els.saveDriveState.disabled = !driveActionReady;
    if (message) {
      els.driveStatus.textContent = message;
    } else if (!hasClientId) {
      els.driveStatus.textContent = "Setup needed: add the Drive client ID in Advanced Drive setup.";
    } else if (!hasValidClientId) {
      els.driveStatus.textContent = "Setup needed: Drive client ID is invalid.";
    } else if (connected) {
      els.driveStatus.textContent = appSettings.driveAutoSync
        ? "Connected. Saves upload to Drive automatically."
        : "Connected. Save and Upload to Drive are available.";
    } else if (appSettings.driveRemembered) {
      els.driveStatus.textContent = "Previously connected. Upload or Download may ask Google to confirm.";
    } else {
      els.driveStatus.textContent = "Not connected. Click Connect Drive.";
    }
  }

  function syncDraftFromForm() {
    draft.tenantId = els.tenantSelect.value;
    draft.invoiceType = normalizeInvoiceType(els.invoiceType.value);
    draft.invoiceNumber = els.invoiceNumber.value.trim();
    draft.issueDate = els.issueDate.value;
    draft.dueDate = els.dueDate.value;
    draft.billingPeriod = els.billingPeriod.value.trim();
    draft.utilityCalculation = readUtilityCalculationFromForm();
    draft.previousBalance = toNumber(els.previousBalance.value);
    draft.credits = toNumber(els.credits.value);
    draft.notes = els.invoiceNotes.value.trim();
    draft.paymentInstructions = state.landlord.paymentInstructions;
    draft.lineItems = [...els.lineItems.querySelectorAll(".line-item")].map((row, index) => ({
      type: row.querySelector(`[data-line-type="${index}"]`)?.value || "Other",
      description: row.querySelector(`[data-line-description="${index}"]`)?.value.trim() || "",
      amount: toNumber(row.querySelector(`[data-line-amount="${index}"]`)?.value),
      generatedUtility: row.dataset.generatedUtility === "true",
    }));
  }

  function readUtilityCalculationFromForm(fallbackCalculation = null) {
    const fallback = fallbackCalculation ? normalizeUtilityCalculation(fallbackCalculation) : null;
    const readUtilityNumber = (input, fallbackValue) => {
      if (input.value === "" && fallback) return toNumber(fallbackValue);
      return toNumber(input.value);
    };
    return {
      method: els.utilityMethod.value || "occupancyUnits",
      tenantUnits: readUtilityNumber(els.utilityTenantUnits, fallback?.tenantUnits),
      totalUnits: readUtilityNumber(els.utilityTotalUnits, fallback?.totalUnits),
      electric: readUtilityNumber(els.utilityElectric, fallback?.electric),
      waterSewer: readUtilityNumber(els.utilityWaterSewer, fallback?.waterSewer),
      gas: readUtilityNumber(els.utilityGas, fallback?.gas),
      other: readUtilityNumber(els.utilityOther, fallback?.other),
    };
  }

  function getDraftSnapshot() {
    return {
      ...clone(draft),
      tenantId: draft.tenantId || selectedTenantId,
      invoiceType: normalizeInvoiceType(draft.invoiceType),
      status: draft.status || "open",
      lineItems: draft.lineItems.map((item) => ({
        type: item.type || "Other",
        description: item.description || "",
        amount: toNumber(item.amount),
        generatedUtility: Boolean(item.generatedUtility),
      })),
      utilityCalculation: normalizeUtilityCalculation(draft.utilityCalculation),
      previousBalance: toNumber(draft.previousBalance),
      credits: toNumber(draft.credits),
      payments: normalizeInvoicePayments(draft.payments),
    };
  }

  function createBlankInvoice(tenantId, invoiceType = "rent") {
    const tenant = getTenant(tenantId);
    const normalizedType = normalizeInvoiceType(invoiceType);
    const issueDate = toDateInput(new Date());
    const rentCycleDate = currentRentCycleDate();
    const dueDate = toDateInput(firstDayOfMonth(rentCycleDate));
    const invoiceNumber = nextInvoiceNumber(normalizedType, rentCycleDate);
    return {
      id: "",
      tenantId,
      invoiceType: normalizedType,
      invoiceNumber,
      issueDate,
      dueDate,
      billingPeriod: billingPeriodForInvoiceType(normalizedType, rentCycleDate),
      lineItems: tenant ? defaultLineItems(tenant, normalizedType) : defaultLineItems(null, normalizedType),
      utilityCalculation: defaultUtilityCalculation(tenant),
      previousBalance: 0,
      credits: 0,
      payments: [],
      notes: "",
      paymentInstructions: state.landlord.paymentInstructions,
      status: "open",
      updatedAt: new Date().toISOString(),
    };
  }

  function defaultLineItems(tenant, invoiceType = "rent") {
    const normalizedType = normalizeInvoiceType(invoiceType);
    if (normalizedType === "utility") return [];
    if (normalizedType === "security") return securityDepositLineItems(tenant);
    return rentLineItems(tenant);
  }

  function rentLineItems(tenant) {
    const items = [];
    if (toNumber(tenant?.rent) > 0) {
      items.push({ type: "Rent", description: `${tenant.unit ? tenant.unit + " " : ""}Monthly rent`, amount: tenant.rent });
    }
    return items.length ? items : [{ type: "Rent", description: "Rent", amount: 0 }];
  }

  function securityDepositLineItems(tenant) {
    const items = [];
    if (toNumber(tenant?.securityDeposit) > 0) {
      items.push({
        type: "Security Deposit",
        description: `${tenant.unit ? tenant.unit + " " : ""}Security deposit`,
        amount: tenant.securityDeposit,
      });
    }
    return items.length ? items : [{ type: "Security Deposit", description: "Security deposit", amount: 0 }];
  }

  function lineItemsForInvoiceType(tenant, invoiceType, currentItems = []) {
    const normalizedType = normalizeInvoiceType(invoiceType);
    const nonSystemItems = (currentItems || []).filter(
      (item) => item.type !== "Rent" && item.type !== "Security Deposit"
    );
    if (normalizedType === "rent") return rentLineItems(tenant);
    if (normalizedType === "security") return securityDepositLineItems(tenant);
    if (normalizedType === "utility") return nonSystemItems;
    return [...rentLineItems(tenant), ...nonSystemItems];
  }

  function defaultManualLineItem(invoiceType) {
    const normalizedType = normalizeInvoiceType(invoiceType);
    if (normalizedType === "rent") return { type: "Fee", description: "", amount: 0 };
    if (normalizedType === "security") return { type: "Security Deposit", description: "", amount: 0 };
    return { type: "Utility", description: "", amount: 0 };
  }

  function normalizeInvoiceType(value) {
    return ["rent", "utility", "security", "combined"].includes(value) ? value : "rent";
  }

  function invoiceAllowsUtility(invoiceType) {
    const normalizedType = normalizeInvoiceType(invoiceType);
    return normalizedType === "utility" || normalizedType === "combined";
  }

  function invoiceTypeLabel(invoiceType) {
    const normalizedType = normalizeInvoiceType(invoiceType);
    if (normalizedType === "utility") return "Utility Invoice";
    if (normalizedType === "security") return "Security Deposit Invoice";
    if (normalizedType === "combined") return "Combined Invoice";
    return "Rent Invoice";
  }

  function inferInvoiceType(invoice) {
    if (["rent", "utility", "security", "combined"].includes(invoice?.invoiceType)) return invoice.invoiceType;
    const lineItems = Array.isArray(invoice?.lineItems) ? invoice.lineItems : [];
    const hasRent = lineItems.some((item) => item?.type === "Rent");
    const hasSecurityDeposit = lineItems.some((item) => item?.type === "Security Deposit");
    const hasUtility = lineItems.some((item) =>
      item?.generatedUtility || utilityLineTypes().includes(item?.type)
    );
    if (hasRent && hasUtility) return "combined";
    if (hasUtility) return "utility";
    if (hasSecurityDeposit) return "security";
    return "rent";
  }

  function workflowFromInvoiceType(invoiceType) {
    const normalizedType = normalizeInvoiceType(invoiceType);
    if (normalizedType === "utility") return "utility";
    if (normalizedType === "security") return "security";
    return "rent";
  }

  function utilityLineTypes() {
    return ["Electric", "Water", "Gas", "Trash", "Internet", "Utility"];
  }

  function defaultUtilityCalculation(tenant) {
    return {
      method: "occupancyUnits",
      tenantUnits: toNumber(tenant?.utilityUnits || 1),
      totalUnits: 0,
      electric: 0,
      waterSewer: 0,
      gas: 0,
      other: 0,
    };
  }

  function normalizeUtilityCalculation(calculation) {
    return {
      method: calculation?.method === "equalSplit" ? "equalSplit" : "occupancyUnits",
      tenantUnits: toNumber(calculation?.tenantUnits),
      totalUnits: toNumber(calculation?.totalUnits),
      electric: toNumber(calculation?.electric),
      waterSewer: toNumber(calculation?.waterSewer),
      gas: toNumber(calculation?.gas),
      other: toNumber(calculation?.other),
    };
  }

  function utilityCalculationDetails(calculation) {
    const current = normalizeUtilityCalculation(calculation);
    const totalCharges = roundMoney(current.electric + current.waterSewer + current.gas + current.other);
    const hasTotal = totalCharges > 0;
    let share = 0;
    let explanation = "";

    if (current.method === "equalSplit") {
      share = current.totalUnits > 0 ? roundMoneyUp(totalCharges / current.totalUnits) : 0;
      explanation = `Utility share = ${formatMoney(totalCharges)} / ${formatNumber(current.totalUnits)} shares = ${formatMoney(share)}.`;
    } else {
      share = current.totalUnits > 0
        ? roundMoney((current.tenantUnits / current.totalUnits) * totalCharges)
        : 0;
      explanation = `Utility share = ${formatNumber(current.tenantUnits)} / ${formatNumber(current.totalUnits)} x ${formatMoney(totalCharges)} = ${formatMoney(share)}.`;
    }

    return {
      ...current,
      totalCharges,
      hasTotal,
      share,
      explanation,
      billSummary: `Bills: Dominion/electric ${formatMoney(current.electric)}, HRSD/water ${formatMoney(current.waterSewer)}, gas ${formatMoney(current.gas)}, other ${formatMoney(current.other)}.`,
    };
  }

  function utilityLineDescription(calculation) {
    const details = utilityCalculationDetails(calculation);
    if (details.method === "equalSplit") {
      return `Utilities - equal split of ${formatMoney(details.totalCharges)} across ${formatNumber(details.totalUnits)} shares`;
    }
    return `Utilities - ${formatNumber(details.tenantUnits)} of ${formatNumber(details.totalUnits)} occupancy units`;
  }

  function getTenant(id) {
    return state.tenants.find((tenant) => tenant.id === id);
  }

  function calculateTotal(invoice) {
    const total =
      sumLineItems(invoice.lineItems) +
      toNumber(invoice.previousBalance) -
      toNumber(invoice.credits) -
      invoicePaymentTotal(invoice);
    return Math.max(0, roundMoney(total));
  }

  function invoicePaymentTotal(invoice) {
    return roundMoney(normalizeInvoicePayments(invoice?.payments).reduce((total, payment) => total + payment.amount, 0));
  }

  function sumLineItems(lineItems) {
    return roundMoney((lineItems || []).reduce((total, item) => total + toNumber(item.amount), 0));
  }

  function markDirty() {
    els.saveState.textContent = selectedInvoiceId ? "Unsaved changes" : "Draft";
    if (draft.status !== "paid") {
      els.invoiceStatus.textContent = selectedInvoiceId ? "Unsaved changes" : "Draft";
    }
  }

  function setSavedStateLabel(driveSaved) {
    if (!els.invoiceStatus || !els.saveState) return;
    const label =
      draft.status === "paid" ? "Paid" : draft.status === "partial" ? "Partially paid" : driveSaved ? "Saved to Drive" : "Saved locally";
    els.invoiceStatus.textContent = label;
    els.saveState.textContent = label;
  }

  function loadState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return clone(defaultState);
      const parsed = JSON.parse(stored);
      return normalizeState({
        landlord: { ...defaultState.landlord, ...(parsed.landlord || {}) },
        tenants: Array.isArray(parsed.tenants) ? parsed.tenants : clone(defaultState.tenants),
        invoices: Array.isArray(parsed.invoices) ? parsed.invoices : [],
      });
    } catch (error) {
      console.warn("Unable to load saved Rent Ledger data.", error);
      return clone(defaultState);
    }
  }

  function loadAppSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(APP_SETTINGS_KEY) || "{}");
      const storedClientId = cleanGoogleClientId(parsed.googleClientId);
      const driveRemembered =
        "driveRemembered" in parsed
          ? Boolean(parsed.driveRemembered)
          : Boolean(parsed.driveFolderId || parsed.driveInvoiceFolderId || parsed.driveStateFileId);
      return {
        googleClientId: isValidGoogleClientId(storedClientId)
          ? storedClientId
          : DEFAULT_GOOGLE_CLIENT_ID,
        driveAutoSync: Boolean(parsed.driveAutoSync),
        driveRemembered,
        driveFolderId: String(parsed.driveFolderId || "").trim(),
        driveInvoiceFolderId: String(parsed.driveInvoiceFolderId || "").trim(),
        driveStateFileId: String(parsed.driveStateFileId || "").trim(),
      };
    } catch (error) {
      console.warn("Unable to load Rent Ledger settings.", error);
      return {
        googleClientId: DEFAULT_GOOGLE_CLIENT_ID,
        driveAutoSync: false,
        driveRemembered: false,
        driveFolderId: "",
        driveInvoiceFolderId: "",
        driveStateFileId: "",
      };
    }
  }

  function saveState(reason = "Saved data") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    recordLocalBackup(reason, state);
    renderBackupStatus();
    queueDriveSync(reason);
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rent-ledger-backup-${timestampForFile(new Date())}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Backup exported.");
  }

  async function connectDrive() {
    saveDriveSettings(false);
    if (!appSettings.googleClientId) {
      renderDriveStatus("Setup needed: add the Drive client ID in Advanced Drive setup.");
      showToast("Add the Drive client ID first.");
      return;
    }
    if (!isValidGoogleClientId(appSettings.googleClientId)) {
      renderDriveStatus("Setup needed: Drive client ID is invalid.");
      showToast("Use the full OAuth client ID.");
      return;
    }

    try {
      renderDriveStatus("Opening Google Drive connection...");
      await requestDriveAccessToken(appSettings.driveRemembered ? "" : "consent");
      rememberDriveConnection();
      renderDriveStatus();
      showToast("Google Drive connected.");
      if (appSettings.driveAutoSync) {
        queueDriveSync("Initial state");
      }
    } catch (error) {
      console.error(error);
      driveAccessToken = "";
      renderDriveStatus("Google Drive connection was cancelled or failed.");
      showToast("Google Drive connection failed.");
    }
  }

  function rememberDriveConnection() {
    appSettings.driveRemembered = true;
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(appSettings));
  }

  async function ensureDriveAccess(actionLabel) {
    if (driveAccessToken) return true;
    if (!isValidGoogleClientId(appSettings.googleClientId)) {
      renderDriveStatus("Setup needed: Drive client ID is invalid.");
      showToast("Use the full OAuth client ID.");
      return false;
    }

    try {
      renderDriveStatus(`Google confirmation needed for ${actionLabel}...`);
      await requestDriveAccessToken(appSettings.driveRemembered ? "" : "consent");
      rememberDriveConnection();
      renderDriveStatus();
      return true;
    } catch (error) {
      console.error(error);
      driveAccessToken = "";
      renderDriveStatus("Google Drive confirmation was cancelled or expired.");
      showToast("Google Drive connection needed.");
      return false;
    }
  }

  function queueDriveSync(reason) {
    if (!appSettings.driveAutoSync) return;
    if (!driveAccessToken) {
      renderDriveStatus(
        appSettings.driveRemembered
          ? "Auto-sync paused after refresh: click Upload to Drive or Connect Drive."
          : "Auto-sync needs Drive connection."
      );
      return;
    }
    clearTimeout(driveSyncTimer);
    driveSyncTimer = window.setTimeout(() => {
      saveStateToDrive(reason).catch((error) => {
        console.error(error);
        renderDriveStatus("Drive sync failed. Local save kept.");
      });
    }, DRIVE_SYNC_DEBOUNCE_MS);
  }

  async function saveStateToDrive(reason = "Saved") {
    saveDriveSettings(false);
    if (!(await ensureDriveAccess("saving"))) return;

    try {
      renderDriveStatus("Uploading app data to Drive...");
      await uploadDriveState();
      renderDriveStatus(`${reason}: app data uploaded to Drive.`);
      showToast("Saved to Google Drive.");
    } catch (error) {
      if (String(error.message || error).includes("404")) {
        appSettings.driveStateFileId = "";
        localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(appSettings));
        try {
          await uploadDriveState();
          renderDriveStatus(`${reason}: app data uploaded to Drive.`);
          showToast("Saved to Google Drive.");
        } catch (retryError) {
          console.error(retryError);
          renderDriveStatus("Drive save failed. Local save kept.");
          showToast("Google Drive save failed.");
        }
        return;
      }
      console.error(error);
      renderDriveStatus("Drive save failed. Local save kept.");
      showToast("Google Drive save failed.");
    }
  }

  async function saveInvoiceArtifactsToDrive(invoice) {
    saveDriveSettings(false);
    if (!appSettings.googleClientId) {
      renderDriveStatus("Setup needed: add the Drive client ID in Advanced Drive setup.");
      return false;
    }
    if (!isValidGoogleClientId(appSettings.googleClientId)) {
      renderDriveStatus("Setup needed: Drive client ID is invalid.");
      return false;
    }

    try {
      if (!(await ensureDriveAccess("saving invoice"))) return false;
      renderDriveStatus("Uploading app data and invoice PDF to Drive...");
      await uploadDriveState();
      const pdfBlob = createInvoicePdfBlob(invoice);
      const file = await uploadInvoicePdf(invoice, pdfBlob);
      renderDriveStatus(`Saved to Drive: ${file.name || "invoice PDF"}.`);
      return true;
    } catch (error) {
      console.error(error);
      renderDriveStatus("Drive upload failed. Local invoice stayed saved.");
      return false;
    }
  }

  async function saveBatchInvoiceArtifactsToDrive(invoices, actionLabel = "saving invoices") {
    saveDriveSettings(false);
    if (!invoices.length) return false;
    if (!appSettings.googleClientId) {
      renderDriveStatus("Setup needed: add the Drive client ID in Advanced Drive setup.");
      return false;
    }
    if (!isValidGoogleClientId(appSettings.googleClientId)) {
      renderDriveStatus("Setup needed: Drive client ID is invalid.");
      return false;
    }

    try {
      if (!(await ensureDriveAccess(actionLabel))) return false;
      renderDriveStatus("Uploading app data and invoice PDFs to Drive...");
      await uploadDriveState();
      for (const invoice of invoices) {
        await uploadInvoicePdf(invoice, createInvoicePdfBlob(invoice));
      }
      renderDriveStatus(`Saved ${invoices.length} invoice PDF${invoices.length === 1 ? "" : "s"} to Drive.`);
      return true;
    } catch (error) {
      console.error(error);
      renderDriveStatus("Drive upload failed. Local invoices stayed saved.");
      return false;
    }
  }

  async function loadStateFromDrive() {
    saveDriveSettings(false);
    if (!window.confirm("Load Rent Ledger data from Google Drive and replace this browser's local data?")) {
      return;
    }

    if (!(await ensureDriveAccess("loading"))) return;

    try {
      renderDriveStatus("Loading from Google Drive...");
      const folderId = await ensureDriveFolder();
      const file = await findDriveFile(DRIVE_STATE_FILE_NAME, "application/json", folderId);
      if (!file) {
        renderDriveStatus("No Drive state file found.");
        showToast("No Drive backup found.");
        return;
      }

      appSettings.driveStateFileId = file.id;
      localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(appSettings));
      const imported = await driveApi(`/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`);
      recordLocalBackup("Before Drive load", state);
      state = normalizeState(imported);
      selectedTenantId = firstActiveTenantId() || "";
      selectedInvoiceId = "";
      draft = createBlankInvoice(selectedTenantId);
      cycleUtilityCalculation = normalizeUtilityCalculation(draft.utilityCalculation);
      saveState("Loaded from Google Drive");
      fillLandlordForm();
      fillTenantForm(selectedTenantId);
      renderAll();
      renderDriveStatus("Loaded from Google Drive.");
      showToast("Loaded from Google Drive.");
    } catch (error) {
      console.error(error);
      renderDriveStatus("Drive load failed.");
      showToast("Google Drive load failed.");
    }
  }

  async function uploadDriveState() {
    const folderId = await ensureDriveFolder();
    let fileId = appSettings.driveStateFileId;
    if (!fileId) {
      const existing = await findDriveFile(DRIVE_STATE_FILE_NAME, "application/json", folderId);
      fileId = existing?.id || "";
    }

    const body = JSON.stringify(state, null, 2);
    if (fileId) {
      await driveApi(`/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,modifiedTime`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body,
      });
      appSettings.driveStateFileId = fileId;
      localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(appSettings));
      return;
    }

    const upload = multipartDriveBody(
      {
        name: DRIVE_STATE_FILE_NAME,
        mimeType: "application/json",
        parents: [folderId],
      },
      body
    );
    const created = await driveApi("/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime", {
      method: "POST",
      headers: { "Content-Type": upload.contentType },
      body: upload.body,
    });
    appSettings.driveStateFileId = created.id || "";
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(appSettings));
  }

  async function uploadInvoicePdf(invoice, pdfBlob) {
    const folderId = await ensureDriveInvoiceFolder();
    const tenant = getTenant(invoice.tenantId);
    const fileName = invoicePdfFileName(invoice, tenant);
    const existing = await findDriveFile(fileName, "application/pdf", folderId);

    if (existing?.id) {
      const updated = await driveApi(
        `/upload/drive/v3/files/${encodeURIComponent(existing.id)}?uploadType=media&fields=id,name,modifiedTime`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/pdf" },
          body: pdfBlob,
        }
      );
      return updated;
    }

    const upload = multipartDriveBody(
      {
        name: fileName,
        mimeType: "application/pdf",
        parents: [folderId],
      },
      pdfBlob,
      "application/pdf"
    );
    return driveApi("/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime", {
      method: "POST",
      headers: { "Content-Type": upload.contentType },
      body: upload.body,
    });
  }

  async function ensureDriveFolder() {
    if (appSettings.driveFolderId) return appSettings.driveFolderId;

    const existing = await findDriveFile(DRIVE_FOLDER_NAME, "application/vnd.google-apps.folder");
    if (existing?.id) {
      appSettings.driveFolderId = existing.id;
      localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(appSettings));
      return existing.id;
    }

    const created = await driveApi("/drive/v3/files?fields=id,name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: DRIVE_FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
      }),
    });
    appSettings.driveFolderId = created.id || "";
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(appSettings));
    return appSettings.driveFolderId;
  }

  async function ensureDriveInvoiceFolder() {
    if (appSettings.driveInvoiceFolderId) return appSettings.driveInvoiceFolderId;

    const rootId = await ensureDriveFolder();
    const existing = await findDriveFile(DRIVE_INVOICE_FOLDER_NAME, "application/vnd.google-apps.folder", rootId);
    if (existing?.id) {
      appSettings.driveInvoiceFolderId = existing.id;
      localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(appSettings));
      return existing.id;
    }

    const created = await driveApi("/drive/v3/files?fields=id,name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: DRIVE_INVOICE_FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
        parents: [rootId],
      }),
    });
    appSettings.driveInvoiceFolderId = created.id || "";
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(appSettings));
    return appSettings.driveInvoiceFolderId;
  }

  async function findDriveFile(name, mimeType, parentId = "") {
    const clauses = [`name = ${driveQueryLiteral(name)}`, "trashed = false"];
    if (mimeType) clauses.push(`mimeType = ${driveQueryLiteral(mimeType)}`);
    if (parentId) clauses.push(`${driveQueryLiteral(parentId)} in parents`);
    const params = new URLSearchParams({
      q: clauses.join(" and "),
      spaces: "drive",
      pageSize: "1",
      fields: "files(id,name,mimeType,modifiedTime)",
    });
    const result = await driveApi(`/drive/v3/files?${params.toString()}`);
    return result.files?.[0] || null;
  }

  function driveQueryLiteral(value) {
    return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  }

  function cleanGoogleClientId(value) {
    return String(value || "").trim().replace(/^["']|["']$/g, "");
  }

  function isValidGoogleClientId(value) {
    return /^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(cleanGoogleClientId(value));
  }

  async function requestDriveAccessToken(prompt = "") {
    await loadGoogleIdentityServices();
    return new Promise((resolve, reject) => {
      if (!driveTokenClient) {
        driveTokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: appSettings.googleClientId,
          scope: DRIVE_SCOPE,
          callback: () => {},
          error_callback: reject,
        });
      }

      driveTokenClient.callback = (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        driveAccessToken = response.access_token || "";
        resolve(driveAccessToken);
      };
      driveTokenClient.requestAccessToken({ prompt });
    });
  }

  function loadGoogleIdentityServices() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (googleIdentityLoadPromise) return googleIdentityLoadPromise;

    googleIdentityLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (window.google?.accounts?.oauth2) resolve();
        else reject(new Error("Google Identity Services did not load."));
      };
      script.onerror = () => reject(new Error("Unable to load Google Identity Services."));
      document.head.appendChild(script);
    });
    return googleIdentityLoadPromise;
  }

  async function driveApi(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${driveAccessToken}`);
    const response = await fetch(`https://www.googleapis.com${path}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      driveAccessToken = "";
      renderDriveStatus("Drive connection expired. Click Connect Drive.");
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Drive API ${response.status}: ${body}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) return response.json();
    return response.text();
  }

  function multipartDriveBody(metadata, media, mediaType = "application/json") {
    const boundary = `rent-ledger-${Date.now()}`;
    const contentType = `multipart/related; boundary=${boundary}`;
    const body = new Blob(
      [
        `--${boundary}\r\n`,
        "Content-Type: application/json; charset=UTF-8\r\n\r\n",
        JSON.stringify(metadata),
        `\r\n--${boundary}\r\n`,
        `Content-Type: ${mediaType}\r\n\r\n`,
        media instanceof Blob ? media : String(media),
        `\r\n--${boundary}--\r\n`,
      ],
      { type: contentType }
    );
    return {
      contentType,
      body,
    };
  }

  function createInvoicePdfBlob(invoice) {
    const tenant = getTenant(invoice.tenantId) || {};
    const landlord = state.landlord;
    const invoiceType = normalizeInvoiceType(invoice.invoiceType);
    const utilityDetails = utilityCalculationDetails(invoice.utilityCalculation);
    const subtotal = sumLineItems(invoice.lineItems);
    const paymentTotal = invoicePaymentTotal(invoice);
    const totalDue = calculateTotal(invoice);
    const commands = [];

    pdfText(commands, 36, 748, landlord.name || "Landlord", 14, "F2");
    let headerY = 730;
    headerY = pdfWrappedText(commands, landlord.address || "", 36, headerY, 240, 9, "F1", 12, 3);
    const contact = [landlord.email, formatPhoneNumber(landlord.phone)].filter(Boolean).join(" | ");
    if (contact) pdfText(commands, 36, headerY - 2, contact, 9, "F1", [0.31, 0.36, 0.35]);

    pdfTextRight(commands, 576, 748, invoiceTypeLabel(invoiceType), 20, "F2");
    pdfTextRight(commands, 576, 726, invoice.invoiceNumber || "", 10, "F1", [0.31, 0.36, 0.35]);
    pdfLine(commands, 36, 690, 576, 690, 1.5, [0.12, 0.2, 0.18]);

    pdfText(commands, 36, 664, "BILL TO", 8, "F2", [0.75, 0.39, 0.21]);
    pdfText(commands, 36, 646, tenant.name || "Tenant", 10, "F2");
    let billY = 630;
    if (tenant.unit) {
      pdfText(commands, 36, billY, tenant.unit, 9);
      billY -= 13;
    }
    billY = pdfWrappedText(commands, tenant.address || "", 36, billY, 220, 9, "F1", 12, 4);
    if (tenant.email) pdfText(commands, 36, billY - 1, tenant.email, 9, "F1", [0.31, 0.36, 0.35]);

    let factY = 664;
    factY = pdfFact(commands, 350, factY, "Issue date", formatDate(invoice.issueDate));
    factY = pdfFact(commands, 350, factY, "Due date", formatDate(invoice.dueDate));
    factY = pdfFact(commands, 350, factY, "Billing period", invoice.billingPeriod);
    factY = pdfFact(commands, 350, factY, "Invoice type", invoiceTypeLabel(invoiceType));
    pdfFact(commands, 350, factY, "Status", invoiceStatusText(invoice));

    let tableY = 560;
    pdfText(commands, 36, tableY, "TYPE", 7.5, "F2", [0.38, 0.44, 0.42]);
    pdfText(commands, 130, tableY, "DESCRIPTION", 7.5, "F2", [0.38, 0.44, 0.42]);
    pdfTextRight(commands, 576, tableY, "AMOUNT", 7.5, "F2", [0.38, 0.44, 0.42]);
    pdfLine(commands, 36, tableY - 9, 576, tableY - 9, 0.7, [0.82, 0.84, 0.82]);
    tableY -= 28;

    (invoice.lineItems || []).forEach((item) => {
      pdfText(commands, 36, tableY, item.type || "", 9);
      const wrapped = pdfWrapLines(item.description || "", 310, 9, 2);
      wrapped.forEach((line, index) => pdfText(commands, 130, tableY - index * 11, line, 9));
      pdfTextRight(commands, 576, tableY, formatMoney(item.amount), 9);
      tableY -= Math.max(22, wrapped.length * 11 + 10);
      pdfLine(commands, 36, tableY + 9, 576, tableY + 9, 0.5, [0.86, 0.88, 0.86]);
    });

    let summaryY = tableY - 12;
    summaryY = pdfSummary(commands, 390, summaryY, "Subtotal", formatMoney(subtotal), false);
    summaryY = pdfSummary(commands, 390, summaryY, "Previous balance", formatMoney(invoice.previousBalance), false);
    summaryY = pdfSummary(commands, 390, summaryY, "Credits / adjustments", formatMoney(-Number(invoice.credits || 0)), false);
    if (paymentTotal) {
      summaryY = pdfSummary(commands, 390, summaryY, "Payments received", formatMoney(-paymentTotal), false);
    }
    pdfLine(commands, 390, summaryY + 4, 576, summaryY + 4, 1.2, [0.12, 0.2, 0.18]);
    pdfSummary(commands, 390, summaryY - 18, "Balance due", formatMoney(totalDue), true);

    const notesY = 222;
    const footerBlocks = [];
    if (invoiceAllowsUtility(invoiceType) && utilityDetails.hasTotal) {
      footerBlocks.push({
        title: "UTILITY CALCULATION",
        body: `${utilityDetails.explanation}\n${utilityDetails.billSummary}`,
      });
    }
    const paymentInstructions = invoice.paymentInstructions || landlord.paymentInstructions || "";
    if (paymentInstructions) footerBlocks.push({ title: "PAYMENT", body: paymentInstructions });
    if (invoice.notes) footerBlocks.push({ title: "NOTES", body: invoice.notes });

    if (footerBlocks.length) {
      pdfLine(commands, 36, notesY + 18, 576, notesY + 18, 0.7, [0.82, 0.84, 0.82]);
      const columns = pdfFooterColumns(footerBlocks.length);
      footerBlocks.forEach((block, index) => {
        pdfFooterBlock(commands, columns[index].x, notesY, columns[index].width, block.title, block.body);
      });
    }

    return new Blob([assemblePdf(commands)], { type: "application/pdf" });
  }

  function invoicePdfFileName(invoice, tenant) {
    const number = sanitizeFileName(invoice.invoiceNumber || "invoice");
    const tenantName = sanitizeFileName(tenant?.name || "tenant");
    return `${number}-${tenantName}.pdf`;
  }

  function pdfFooterColumns(count) {
    if (count === 1) return [{ x: 36, width: 260 }];
    if (count === 2)
      return [
        { x: 36, width: 240 },
        { x: 336, width: 240 },
      ];
    return [
      { x: 36, width: 160 },
      { x: 230, width: 160 },
      { x: 424, width: 152 },
    ];
  }

  function sanitizeFileName(value) {
    const clean = toPdfText(value)
      .replace(/[^A-Za-z0-9._ -]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
    return clean || "invoice";
  }

  function pdfFooterBlock(commands, x, y, width, title, body) {
    pdfText(commands, x, y, title, 7.5, "F2", [0.75, 0.39, 0.21]);
    pdfWrappedText(commands, body, x, y - 17, width, 8.5, "F1", 11, 7);
  }

  function pdfFact(commands, x, y, label, value) {
    pdfText(commands, x, y, label, 9, "F2", [0.38, 0.44, 0.42]);
    pdfText(commands, x + 90, y, value || "", 9, "F2");
    return y - 17;
  }

  function pdfSummary(commands, x, y, label, value, total) {
    pdfText(commands, x, y, label, total ? 12 : 9, total ? "F2" : "F1");
    pdfTextRight(commands, 576, y, value, total ? 12 : 9, "F2");
    return y - (total ? 18 : 16);
  }

  function pdfWrappedText(commands, value, x, y, width, size, font = "F1", lineHeight = size + 3, maxLines = 99) {
    const lines = pdfWrapLines(value, width, size, maxLines);
    lines.forEach((line, index) => {
      pdfText(commands, x, y - index * lineHeight, line, size, font);
    });
    return y - lines.length * lineHeight;
  }

  function pdfWrapLines(value, width, size, maxLines = 99) {
    const maxChars = Math.max(8, Math.floor(width / (size * 0.52)));
    const paragraphs = toPdfText(value).split(/\n/);
    const lines = [];

    paragraphs.forEach((paragraph) => {
      const words = paragraph.trim().split(/\s+/).filter(Boolean);
      if (!words.length) {
        lines.push("");
        return;
      }
      let line = "";
      words.forEach((word) => {
        const next = line ? `${line} ${word}` : word;
        if (next.length > maxChars && line) {
          lines.push(line);
          line = word;
        } else {
          line = next;
        }
      });
      if (line) lines.push(line);
    });

    if (lines.length > maxLines) {
      const clipped = lines.slice(0, maxLines);
      clipped[clipped.length - 1] = `${clipped[clipped.length - 1].slice(0, Math.max(0, maxChars - 3))}...`;
      return clipped;
    }
    return lines;
  }

  function pdfText(commands, x, y, value, size = 9, font = "F1", color = [0.1, 0.15, 0.14]) {
    commands.push(
      `${pdfColor(color, false)} BT /${font} ${size} Tf ${pdfNumber(x)} ${pdfNumber(y)} Td (${escapePdfString(
        value
      )}) Tj ET`
    );
  }

  function pdfTextRight(commands, x, y, value, size = 9, font = "F1", color = [0.1, 0.15, 0.14]) {
    const text = toPdfText(value);
    pdfText(commands, x - estimatePdfTextWidth(text, size, font), y, text, size, font, color);
  }

  function pdfLine(commands, x1, y1, x2, y2, width = 1, color = [0.1, 0.15, 0.14]) {
    commands.push(
      `q ${pdfColor(color, true)} ${pdfNumber(width)} w ${pdfNumber(x1)} ${pdfNumber(y1)} m ${pdfNumber(
        x2
      )} ${pdfNumber(y2)} l S Q`
    );
  }

  function pdfColor(color, stroke) {
    return `${color.map((item) => pdfNumber(item)).join(" ")} ${stroke ? "RG" : "rg"}`;
  }

  function pdfNumber(value) {
    return Number(value).toFixed(3).replace(/\.?0+$/, "");
  }

  function estimatePdfTextWidth(value, size, font) {
    return toPdfText(value).length * size * (font === "F2" ? 0.56 : 0.52);
  }

  function escapePdfString(value) {
    return toPdfText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }

  function toPdfText(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7E\n]/g, " ")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  function assemblePdf(commands) {
    const content = `${commands.join("\n")}\n`;
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
      `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    ];

    let pdf = "%PDF-1.4\n% Rent Ledger\n";
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => {
      pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    return pdf;
  }

  function importBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result || "{}"));
        const tenantImport = extractTenantImport(imported);

        if (tenantImport) {
          if (!window.confirm(`Import ${tenantImport.length} tenant${tenantImport.length === 1 ? "" : "s"} from this JSON? Existing tenants with matching names will be updated. Settings and invoices will be kept.`)) {
            event.target.value = "";
            return;
          }
          recordLocalBackup("Before tenant import", state);
          state = normalizeState({
            ...state,
            tenants: mergeImportedTenants(currentImportBaseTenants(), tenantImport),
          });
          selectedTenantId = firstActiveTenantId() || "";
          selectedInvoiceId = "";
          draft = createBlankInvoice(selectedTenantId);
          saveState("Imported tenants");
          fillLandlordForm();
          fillTenantForm(selectedTenantId);
          renderAll();
          showToast(`Imported ${tenantImport.length} tenant${tenantImport.length === 1 ? "" : "s"}.`);
          return;
        }

        if (!window.confirm("Import this backup and replace local Rent Ledger data?")) {
          event.target.value = "";
          return;
        }
        recordLocalBackup("Before import", state);
        state = normalizeState(imported);
        selectedTenantId = firstActiveTenantId() || "";
        selectedInvoiceId = "";
        draft = createBlankInvoice(selectedTenantId);
        saveState("Imported backup");
        fillLandlordForm();
        fillTenantForm(selectedTenantId);
        renderAll();
        showToast("Backup imported.");
      } catch (error) {
        console.error(error);
        showToast("Backup import failed.");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  function extractTenantImport(value) {
    if (isFullStateBackup(value)) return null;

    if (Array.isArray(value)) {
      const tenants = value.map((tenant) => importedTenantFromObject(tenant?.name || "", tenant)).filter(Boolean);
      return tenants.length ? tenants : null;
    }

    if (Array.isArray(value?.tenants)) {
      const tenants = value.tenants.map((tenant) => importedTenantFromObject(tenant?.name || "", tenant)).filter(Boolean);
      return tenants.length ? tenants : null;
    }

    if (!value || typeof value !== "object") return null;

    const entries = Object.entries(value).filter(([, tenant]) => looksLikeTenantRecord(tenant));
    if (!entries.length || entries.length !== Object.keys(value).length) return null;

    return entries.map(([name, tenant]) => importedTenantFromObject(name, tenant)).filter(Boolean);
  }

  function isFullStateBackup(value) {
    return Boolean(value?.landlord || value?.invoices);
  }

  function looksLikeTenantRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    return ["rent", "securityDeposit", "address", "payments", "active", "utilityUnits", "occupancyUnits", "excludeUtilities"].some((key) =>
      Object.prototype.hasOwnProperty.call(value, key)
    );
  }

  function importedTenantFromObject(name, value) {
    if (!value || typeof value !== "object") return null;
    const tenantName = String(value.name || name || "").trim();
    if (!tenantName) return null;
    const hasExcludeUtilities = Object.prototype.hasOwnProperty.call(value, "excludeUtilities");
    const payments = Array.isArray(value.payments) ? value.payments.map(normalizeImportedPayment).filter(Boolean) : [];
    return {
      id: value.id || cryptoId(),
      name: tenantName,
      unit: value.unit || "",
      address: value.address || "",
      email: value.email || "",
      phone: formatPhoneNumber(value.phone),
      rent: toNumber(value.rent),
      securityDeposit: toNumber(value.securityDeposit),
      utilityUnits: toNumber(value.utilityUnits || value.occupancyUnits || 1),
      excludeUtilities: hasExcludeUtilities ? Boolean(value.excludeUtilities) : undefined,
      active: Object.prototype.hasOwnProperty.call(value, "active") ? Boolean(value.active) : true,
      payments,
      memo: importedTenantMemo(value, payments),
    };
  }

  function normalizeImportedPayment(value) {
    if (!value || typeof value !== "object") return null;
    return {
      amount: toNumber(value.amount),
      date: String(value.date || "").trim(),
      method: String(value.method || "").trim(),
    };
  }

  function importedTenantMemo(value, payments) {
    const parts = [];
    if (value.memo) parts.push(String(value.memo).trim());
    if (Object.prototype.hasOwnProperty.call(value, "active")) {
      parts.push(`Imported status: ${value.active ? "Active" : "Inactive"}.`);
    }
    if (payments.length) {
      parts.push(`Imported payments: ${payments.map(formatImportedPayment).join("; ")}.`);
    }
    return parts.filter(Boolean).join("\n");
  }

  function formatImportedPayment(payment) {
    return `${payment.date || "undated"} ${payment.method || "payment"} ${formatMoney(payment.amount)}`;
  }

  function mergeImportedTenants(existingTenants, importedTenants) {
    const merged = [...existingTenants];
    const indexByName = new Map(merged.map((tenant, index) => [tenant.name.trim().toLowerCase(), index]));

    importedTenants.forEach((tenant) => {
      const key = tenant.name.trim().toLowerCase();
      if (indexByName.has(key)) {
        const index = indexByName.get(key);
        const existing = merged[index];
        const hasImportedUtilityExclusion =
          Object.prototype.hasOwnProperty.call(tenant, "excludeUtilities") && tenant.excludeUtilities !== undefined;
        merged[index] = {
          ...existing,
          ...tenant,
          id: existing.id,
          email: tenant.email || existing.email || "",
          phone: tenant.phone || formatPhoneNumber(existing.phone) || "",
          unit: tenant.unit || existing.unit || "",
          securityDeposit: tenant.securityDeposit || existing.securityDeposit || 0,
          excludeUtilities: hasImportedUtilityExclusion ? tenant.excludeUtilities : Boolean(existing.excludeUtilities),
        };
      } else {
        indexByName.set(key, merged.length);
        merged.push(tenant);
      }
    });

    return merged;
  }

  function currentImportBaseTenants() {
    return hasOnlyDefaultSampleTenant(state.tenants) ? [] : state.tenants;
  }

  function hasOnlyDefaultSampleTenant(tenants) {
    if (!Array.isArray(tenants) || tenants.length !== 1) return false;
    const tenant = tenants[0];
    return tenant?.name === "Sample Tenant" && tenant?.email === "tenant@example.com" && toNumber(tenant?.rent) === 1450;
  }

  function restoreLatestBackup() {
    const backups = loadLocalBackups();
    const latest = backups[0];
    if (!latest) {
      showToast("No local backup is available.");
      return;
    }
    const label = formatDateTime(latest.timestamp);
    if (!window.confirm(`Restore the latest local backup from ${label}?`)) return;
    recordLocalBackup("Before local restore", state);
    state = normalizeState(latest.data);
    selectedTenantId = firstActiveTenantId() || "";
    selectedInvoiceId = "";
    draft = createBlankInvoice(selectedTenantId);
    cycleUtilityCalculation = normalizeUtilityCalculation(draft.utilityCalculation);
    saveState("Restored local backup");
    fillLandlordForm();
    fillTenantForm(selectedTenantId);
    renderAll();
    setView("settings");
    showToast("Latest local backup restored.");
  }

  function loadLocalBackups() {
    try {
      const parsed = JSON.parse(localStorage.getItem(BACKUP_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter((item) => item?.data) : [];
    } catch (error) {
      console.warn("Unable to load Rent Ledger backup history.", error);
      return [];
    }
  }

  function recordLocalBackup(reason, snapshot) {
    try {
      const backups = loadLocalBackups();
      const data = normalizeState(snapshot);
      const latestData = backups[0]?.data ? JSON.stringify(normalizeState(backups[0].data)) : "";
      const currentData = JSON.stringify(data);
      if (latestData === currentData && backups[0]?.reason === reason) return;
      backups.unshift({
        id: cryptoId(),
        timestamp: new Date().toISOString(),
        reason,
        data,
      });
      localStorage.setItem(BACKUP_KEY, JSON.stringify(backups.slice(0, MAX_LOCAL_BACKUPS)));
    } catch (error) {
      console.warn("Unable to write Rent Ledger backup history.", error);
    }
  }

  function renderBackupStatus() {
    if (!els.backupCount || !els.backupLatest) return;
    const backups = loadLocalBackups();
    els.backupCount.textContent = `${backups.length} local backup${backups.length === 1 ? "" : "s"}`;
    els.backupLatest.textContent = backups[0]
      ? `${backups[0].reason || "Saved"} - ${formatDateTime(backups[0].timestamp)}`
      : "No backup yet";
    if (els.restoreLatestBackup) {
      els.restoreLatestBackup.disabled = backups.length === 0;
    }
  }

  function normalizeState(value) {
    const landlord = { ...defaultState.landlord, ...(value?.landlord || {}) };
    landlord.phone = formatPhoneNumber(landlord.phone);
    return {
      landlord,
      tenants: Array.isArray(value?.tenants) ? value.tenants.map(normalizeTenant) : [],
      invoices: Array.isArray(value?.invoices) ? value.invoices.map(normalizeInvoice) : [],
    };
  }

  function normalizeTenant(tenant) {
    return {
      ...tenant,
      phone: formatPhoneNumber(tenant?.phone),
      active: tenant?.active === false ? false : true,
      excludeUtilities: Boolean(tenant?.excludeUtilities),
      securityDeposit: toNumber(tenant?.securityDeposit),
      utilityUnits: toNumber(tenant?.utilityUnits || 1),
      utilities: toNumber(tenant?.utilities),
    };
  }

  function normalizeInvoice(invoice) {
    return {
      ...invoice,
      invoiceType: normalizeInvoiceType(inferInvoiceType(invoice)),
      status: normalizeInvoiceStatus(invoice?.status),
      utilityCalculation: normalizeUtilityCalculation(invoice?.utilityCalculation),
      lineItems: Array.isArray(invoice?.lineItems)
        ? invoice.lineItems.map((item) => ({
            ...item,
            amount: toNumber(item?.amount),
            generatedUtility: Boolean(item?.generatedUtility),
          }))
        : [],
      payments: normalizeInvoicePayments(invoice?.payments),
    };
  }

  function normalizeInvoiceStatus(status) {
    return ["open", "partial", "paid"].includes(status) ? status : "open";
  }

  function normalizeInvoicePayments(payments) {
    if (!Array.isArray(payments)) return [];
    return payments
      .map((payment) => ({
        id: payment?.id || cryptoId(),
        date: String(payment?.date || "").trim(),
        amount: toNumber(payment?.amount),
        method: String(payment?.method || "Payment").trim(),
      }))
      .filter((payment) => payment.amount > 0);
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
    let isRefreshing = false;

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (isRefreshing) return;
      isRefreshing = true;
      try {
        if (sessionStorage.getItem(APP_REFRESH_KEY)) return;
        sessionStorage.setItem(APP_REFRESH_KEY, "1");
      } catch (error) {
        console.warn("Unable to record app refresh state.", error);
      }
      window.location.reload();
    });

    navigator.serviceWorker
      .register("sw.js", { updateViaCache: "none" })
      .then((registration) => {
        activateWaitingServiceWorker(registration.waiting);
        registration.update().catch((error) => {
          console.warn("Service worker update check failed.", error);
        });
        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;
          installingWorker.addEventListener("statechange", () => {
            if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
              activateWaitingServiceWorker(installingWorker);
            }
          });
        });
      })
      .catch((error) => {
        console.warn("Service worker registration failed.", error);
      });
  }

  function activateWaitingServiceWorker(worker) {
    if (!worker) return;
    worker.postMessage({ type: "SKIP_WAITING" });
  }

  function nextInvoiceNumber(invoiceType = "rent", rentCycleDate = currentRentCycleDate()) {
    const invoicePeriodDate = invoiceNumberPeriodDate(invoiceType, rentCycleDate);
    const year = invoicePeriodDate.getFullYear();
    const month = String(invoicePeriodDate.getMonth() + 1).padStart(2, "0");
    const prefix = invoiceNumberPrefix(invoiceType);
    const existingNumbers = state.invoices
      .map((invoice) => invoice.invoiceNumber || "")
      .filter((number) => number.startsWith(`${prefix}-${year}-`))
      .map((number) => Number(number.split("-").pop()))
      .filter(Number.isFinite);
    const next = Math.max(0, ...existingNumbers) + 1;
    return `${prefix}-${year}-${month}-${String(next).padStart(4, "0")}`;
  }

  function invoiceNumberPeriodDate(invoiceType, rentCycleDate = currentRentCycleDate()) {
    return normalizeInvoiceType(invoiceType) === "utility" ? previousMonthDate(rentCycleDate) : rentCycleDate;
  }

  function invoiceNumberPrefix(invoiceType) {
    const normalizedType = normalizeInvoiceType(invoiceType);
    if (normalizedType === "utility") return "UTL";
    if (normalizedType === "security") return "DEP";
    if (normalizedType === "combined") return "INV";
    return "RNT";
  }

  function isGeneratedInvoiceNumber(value) {
    return /^(INV|RNT|UTL|DEP)-\d{4}-(\d{2}-)?\d{4}$/.test(value || "");
  }

  function docFact(label, value) {
    return `
      <div class="doc-fact">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value || "")}</strong>
      </div>`;
  }

  function summaryRow(label, value) {
    return `
      <div class="doc-summary-row">
        <span>${escapeHtml(label)}</span>
        <strong>${formatMoney(value)}</strong>
      </div>`;
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => els.toast.classList.remove("is-visible"), 2600);
  }

  function formatMoney(value) {
    return moneyFormatter.format(roundMoney(toNumber(value)));
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function formatNumber(value) {
    const number = toNumber(value);
    return Number.isInteger(number) ? String(number) : String(roundMoney(number));
  }

  function formatPhoneNumber(value) {
    const raw = String(value || "").trim();
    const digits = raw.replace(/\D/g, "");
    const tenDigits = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    if (tenDigits.length !== 10) return raw;
    return `(${tenDigits.slice(0, 3)}) ${tenDigits.slice(3, 6)}-${tenDigits.slice(6)}`;
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

  function firstDayOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function billingPeriodForInvoiceType(invoiceType, rentCycleDate = currentRentCycleDate()) {
    return normalizeInvoiceType(invoiceType) === "utility" ? monthLabel(previousMonthDate(rentCycleDate)) : monthLabel(rentCycleDate);
  }

  function formatMultiline(value) {
    const clean = escapeHtml(value || "");
    return clean.replace(/\n/g, "<br />");
  }

  function toDateInput(date) {
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60 * 1000);
    return local.toISOString().slice(0, 10);
  }

  function timestampForFile(date) {
    const local = toDateInput(date);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${local}-${hours}${minutes}${seconds}`;
  }

  function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  function roundMoneyUp(value) {
    return Math.ceil((toNumber(value) - 1e-9) * 100) / 100;
  }

  function normalizeNumberInput(value) {
    const number = toNumber(value);
    return number ? String(roundMoney(number)) : "";
  }

  function cryptoId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
