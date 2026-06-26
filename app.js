(function () {
  const STORAGE_KEY = "rent-ledger:v1";
  const BACKUP_KEY = "rent-ledger:backups:v1";
  const MAX_LOCAL_BACKUPS = 25;

  const moneyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

  const today = new Date();
  const sampleDueDate = new Date(today);
  sampleDueDate.setDate(sampleDueDate.getDate() + 7);

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
        utilities: 185,
        memo: "Replace this sample with your tenant details.",
      },
    ],
    invoices: [],
  };

  let state = loadState();
  let selectedTenantId = state.tenants[0]?.id || "";
  let selectedInvoiceId = "";
  let tenantEditorId = selectedTenantId;
  let draft = createBlankInvoice(selectedTenantId);
  let toastTimer = 0;

  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bindElements();
    bindEvents();
    fillLandlordForm();
    fillTenantForm(selectedTenantId);
    renderAll();
    registerServiceWorker();
  }

  function bindElements() {
    [
      "tenantSelect",
      "invoiceNumber",
      "issueDate",
      "dueDate",
      "billingPeriod",
      "lineItems",
      "previousBalance",
      "credits",
      "invoiceNotes",
      "totalDue",
      "invoicePreview",
      "invoiceHistory",
      "invoiceStatus",
      "saveState",
      "addLineItem",
      "saveInvoice",
      "newInvoice",
      "markPaid",
      "printInvoice",
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
      "tenantUtilities",
      "tenantMemo",
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
      "exportBackup",
      "exportBackupSettings",
      "importBackup",
      "backupCount",
      "backupLatest",
      "restoreLatestBackup",
    ].forEach((id) => {
      els[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    document.querySelectorAll(".nav-tab").forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.view));
    });

    els.tenantSelect.addEventListener("change", () => {
      selectedTenantId = els.tenantSelect.value;
      draft.tenantId = selectedTenantId;
      const tenant = getTenant(selectedTenantId);
      if (tenant && !selectedInvoiceId) {
        draft.lineItems = defaultLineItems(tenant);
      }
      syncDraftFromForm();
      renderInvoiceEditor();
      renderInvoicePreview();
      markDirty();
    });

    [
      els.invoiceNumber,
      els.issueDate,
      els.dueDate,
      els.billingPeriod,
      els.previousBalance,
      els.credits,
      els.invoiceNotes,
    ].forEach((input) => {
      input.addEventListener("input", () => {
        syncDraftFromForm();
        renderInvoicePreview();
        renderTotals();
        markDirty();
      });
    });

    els.addLineItem.addEventListener("click", () => {
      syncDraftFromForm();
      draft.lineItems.push({ type: "Utility", description: "", amount: 0 });
      renderLineItems();
      renderInvoicePreview();
      renderTotals();
      markDirty();
    });

    els.lineItems.addEventListener("input", (event) => {
      if (!event.target.closest(".line-item")) return;
      syncDraftFromForm();
      renderInvoicePreview();
      renderTotals();
      markDirty();
    });

    els.lineItems.addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-remove-line]");
      if (!removeButton) return;
      syncDraftFromForm();
      const index = Number(removeButton.dataset.removeLine);
      draft.lineItems.splice(index, 1);
      if (!draft.lineItems.length) {
        draft.lineItems.push({ type: "Rent", description: "", amount: 0 });
      }
      renderLineItems();
      renderInvoicePreview();
      renderTotals();
      markDirty();
    });

    els.tenantForm.addEventListener("submit", saveTenant);
    els.addTenant.addEventListener("click", () => {
      tenantEditorId = "";
      fillTenantForm("");
      setView("tenants");
    });
    els.deleteTenant.addEventListener("click", deleteTenant);
    els.resetTenantForm.addEventListener("click", () => fillTenantForm(tenantEditorId));
    els.tenantList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-edit-tenant]");
      if (!button) return;
      tenantEditorId = button.dataset.editTenant;
      fillTenantForm(tenantEditorId);
    });

    els.landlordForm.addEventListener("submit", saveLandlord);

    document.getElementById("invoiceForm").addEventListener("submit", saveInvoice);
    els.newInvoice.addEventListener("click", startNewInvoice);
    els.markPaid.addEventListener("click", markInvoicePaid);
    els.printInvoice.addEventListener("click", () => window.print());
    els.clearPaid.addEventListener("click", clearPaidInvoices);
    els.invoiceHistory.addEventListener("click", handleInvoiceHistoryClick);
    els.exportBackup.addEventListener("click", exportBackup);
    els.exportBackupSettings.addEventListener("click", exportBackup);
    els.importBackup.addEventListener("change", importBackup);
    els.restoreLatestBackup.addEventListener("click", restoreLatestBackup);
  }

  function renderAll() {
    renderTenantOptions();
    renderInvoiceEditor();
    renderInvoicePreview();
    renderInvoiceHistory();
    renderTenants();
    renderMetrics();
    renderBackupStatus();
  }

  function setView(viewName) {
    document.querySelectorAll(".nav-tab").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.view === viewName);
    });
    document.querySelectorAll(".view").forEach((view) => {
      view.classList.toggle("is-active", view.id === `view-${viewName}`);
    });
    window.location.hash = viewName;
  }

  function renderTenantOptions() {
    if (!state.tenants.length) {
      els.tenantSelect.innerHTML = `<option value="">Add a tenant first</option>`;
      return;
    }

    els.tenantSelect.innerHTML = state.tenants
      .map((tenant) => {
        const label = [tenant.name, tenant.unit].filter(Boolean).join(" - ");
        return `<option value="${escapeAttr(tenant.id)}">${escapeHtml(label)}</option>`;
      })
      .join("");
    els.tenantSelect.value = selectedTenantId || state.tenants[0].id;
  }

  function renderInvoiceEditor() {
    renderTenantOptions();
    els.invoiceNumber.value = draft.invoiceNumber;
    els.issueDate.value = draft.issueDate;
    els.dueDate.value = draft.dueDate;
    els.billingPeriod.value = draft.billingPeriod;
    els.previousBalance.value = normalizeNumberInput(draft.previousBalance);
    els.credits.value = normalizeNumberInput(draft.credits);
    els.invoiceNotes.value = draft.notes;
    els.invoiceStatus.textContent = draft.status === "paid" ? "Paid" : selectedInvoiceId ? "Open" : "Draft";
    els.saveState.textContent = selectedInvoiceId ? "Saved" : "Unsaved";
    renderLineItems();
    renderTotals();
  }

  function renderLineItems() {
    els.lineItems.innerHTML = draft.lineItems
      .map(
        (item, index) => `
        <div class="line-item">
          <label>
            Type
            <select data-line-type="${index}">
              ${["Rent", "Electric", "Water", "Gas", "Trash", "Internet", "Utility", "Fee", "Other"]
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
    const totalDue = calculateTotal(invoice);

    const tenantAddress = tenant?.address || "";
    const landlordAddress = landlord.address || "";
    const paymentInstructions = invoice.paymentInstructions || landlord.paymentInstructions || "";

    els.invoicePreview.innerHTML = `
      <header class="invoice-doc-header">
        <div class="invoice-logo-row">
          <img class="invoice-logo" src="assets/rent-ledger-icon.svg" alt="" />
          <div>
            <h2>${escapeHtml(landlord.name || "Landlord")}</h2>
            <p class="doc-muted">${formatMultiline(landlordAddress)}</p>
            <p class="doc-muted">${escapeHtml([landlord.email, landlord.phone].filter(Boolean).join(" | "))}</p>
          </div>
        </div>
        <div class="invoice-title">
          <h2>Invoice</h2>
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
          ${docFact("Status", invoice.status === "paid" ? "Paid" : "Open")}
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
        ${summaryRow("Credits / payments", -Number(invoice.credits || 0))}
        <div class="doc-summary-row total">
          <span>Total due</span>
          <strong>${formatMoney(totalDue)}</strong>
        </div>
      </section>

      <section class="doc-notes">
        <div class="doc-grid">
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
        const paid = invoice.status === "paid";
        return `
          <article class="invoice-card">
            <div>
              <h3>${escapeHtml(invoice.invoiceNumber)} &middot; ${escapeHtml(tenant?.name || "Tenant")}</h3>
              <p>${escapeHtml(invoice.billingPeriod || "")} &middot; ${formatMoney(calculateTotal(invoice))} &middot; ${
          paid ? "Paid" : "Open"
        }</p>
            </div>
            <div class="card-actions">
              <button class="small-button" data-load-invoice="${escapeAttr(invoice.id)}" type="button">Open</button>
              <button class="small-button danger" data-delete-invoice="${escapeAttr(invoice.id)}" type="button">Delete</button>
            </div>
          </article>`;
      })
      .join("");
  }

  function renderTenants() {
    if (!state.tenants.length) {
      els.tenantList.innerHTML = `<div class="empty-state">No tenants saved.</div>`;
      return;
    }

    els.tenantList.innerHTML = state.tenants
      .map(
        (tenant) => `
        <article class="tenant-card">
          <div>
            <h3>${escapeHtml(tenant.name)}</h3>
            <p>${escapeHtml(tenant.unit || "No unit")} &middot; ${formatMoney(tenant.rent || 0)} rent</p>
          </div>
          <div class="card-actions">
            <button class="small-button" data-edit-tenant="${escapeAttr(tenant.id)}" type="button">Edit</button>
            <button class="small-button" data-create-tenant-invoice="${escapeAttr(
              tenant.id
            )}" type="button">Invoice</button>
          </div>
        </article>`
      )
      .join("");

    els.tenantList.querySelectorAll("[data-create-tenant-invoice]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedTenantId = button.dataset.createTenantInvoice;
        startNewInvoice();
        setView("invoice");
      });
    });
  }

  function renderMetrics() {
    const openInvoices = state.invoices.filter((invoice) => invoice.status !== "paid");
    const paidInvoices = state.invoices.filter((invoice) => invoice.status === "paid");
    const openBalance = openInvoices.reduce((total, invoice) => total + calculateTotal(invoice), 0);
    els.metricTenants.textContent = String(state.tenants.length);
    els.metricOpen.textContent = String(openInvoices.length);
    els.metricBalance.textContent = formatMoney(openBalance);
    els.metricPaid.textContent = String(paidInvoices.length);
  }

  function saveInvoice(event) {
    event.preventDefault();
    syncDraftFromForm();

    if (!draft.tenantId) {
      showToast("Add a tenant before saving an invoice.");
      setView("tenants");
      return;
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
    saveState("Saved invoice");
    renderAll();
    showToast("Invoice saved.");
  }

  function startNewInvoice() {
    selectedInvoiceId = "";
    draft = createBlankInvoice(selectedTenantId || state.tenants[0]?.id || "");
    renderInvoiceEditor();
    renderInvoicePreview();
    showToast("New invoice ready.");
  }

  function markInvoicePaid() {
    syncDraftFromForm();
    draft.status = "paid";

    if (selectedInvoiceId) {
      const invoice = state.invoices.find((item) => item.id === selectedInvoiceId);
      if (invoice) {
        Object.assign(invoice, getDraftSnapshot(), { status: "paid", updatedAt: new Date().toISOString() });
        saveState("Marked invoice paid");
      }
    }

    renderAll();
    showToast("Invoice marked paid.");
  }

  function handleInvoiceHistoryClick(event) {
    const loadButton = event.target.closest("[data-load-invoice]");
    const deleteButton = event.target.closest("[data-delete-invoice]");

    if (loadButton) {
      const invoice = state.invoices.find((item) => item.id === loadButton.dataset.loadInvoice);
      if (!invoice) return;
      selectedInvoiceId = invoice.id;
      selectedTenantId = invoice.tenantId;
      draft = clone(invoice);
      renderInvoiceEditor();
      renderInvoicePreview();
      window.scrollTo({ top: 0, behavior: "smooth" });
      showToast("Invoice opened.");
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
      showToast("No paid invoices to clear.");
      return;
    }
    if (!window.confirm(`Clear ${paidCount} paid invoice${paidCount === 1 ? "" : "s"}?`)) return;

    state.invoices = state.invoices.filter((invoice) => invoice.status !== "paid");
    if (selectedInvoiceId && !state.invoices.some((invoice) => invoice.id === selectedInvoiceId)) {
      startNewInvoice();
    }
    saveState("Cleared paid invoices");
    renderAll();
    showToast(`${paidCount} paid invoice${paidCount === 1 ? "" : "s"} cleared.`);
  }

  function saveTenant(event) {
    event.preventDefault();
    const id = els.tenantId.value || cryptoId();
    const tenant = {
      id,
      name: els.tenantName.value.trim(),
      unit: els.tenantUnit.value.trim(),
      address: els.tenantAddress.value.trim(),
      email: els.tenantEmail.value.trim(),
      phone: els.tenantPhone.value.trim(),
      rent: toNumber(els.tenantRent.value),
      utilities: toNumber(els.tenantUtilities.value),
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

    selectedTenantId = id;
    tenantEditorId = id;
    if (!draft.tenantId) draft.tenantId = id;
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
      utilities: "",
      memo: "",
    };
    tenantEditorId = tenant.id;
    els.tenantId.value = tenant.id;
    els.tenantName.value = tenant.name || "";
    els.tenantUnit.value = tenant.unit || "";
    els.tenantAddress.value = tenant.address || "";
    els.tenantEmail.value = tenant.email || "";
    els.tenantPhone.value = tenant.phone || "";
    els.tenantRent.value = normalizeNumberInput(tenant.rent);
    els.tenantUtilities.value = normalizeNumberInput(tenant.utilities);
    els.tenantMemo.value = tenant.memo || "";
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
    if (selectedTenantId === id) selectedTenantId = state.tenants[0]?.id || "";
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
    els.landlordPhone.value = state.landlord.phone || "";
    els.paymentInstructions.value = state.landlord.paymentInstructions || "";
  }

  function saveLandlord(event) {
    event.preventDefault();
    state.landlord = {
      name: els.landlordName.value.trim(),
      address: els.landlordAddress.value.trim(),
      email: els.landlordEmail.value.trim(),
      phone: els.landlordPhone.value.trim(),
      paymentInstructions: els.paymentInstructions.value.trim(),
    };
    saveState("Saved settings");
    renderInvoicePreview();
    showToast("Settings saved.");
  }

  function syncDraftFromForm() {
    draft.tenantId = els.tenantSelect.value;
    draft.invoiceNumber = els.invoiceNumber.value.trim();
    draft.issueDate = els.issueDate.value;
    draft.dueDate = els.dueDate.value;
    draft.billingPeriod = els.billingPeriod.value.trim();
    draft.previousBalance = toNumber(els.previousBalance.value);
    draft.credits = toNumber(els.credits.value);
    draft.notes = els.invoiceNotes.value.trim();
    draft.paymentInstructions = state.landlord.paymentInstructions;
    draft.lineItems = [...els.lineItems.querySelectorAll(".line-item")].map((row, index) => ({
      type: row.querySelector(`[data-line-type="${index}"]`)?.value || "Other",
      description: row.querySelector(`[data-line-description="${index}"]`)?.value.trim() || "",
      amount: toNumber(row.querySelector(`[data-line-amount="${index}"]`)?.value),
    }));
  }

  function getDraftSnapshot() {
    return {
      ...clone(draft),
      tenantId: draft.tenantId || selectedTenantId,
      status: draft.status || "open",
      lineItems: draft.lineItems.map((item) => ({
        type: item.type || "Other",
        description: item.description || "",
        amount: toNumber(item.amount),
      })),
      previousBalance: toNumber(draft.previousBalance),
      credits: toNumber(draft.credits),
    };
  }

  function createBlankInvoice(tenantId) {
    const tenant = getTenant(tenantId);
    const issueDate = toDateInput(new Date());
    const dueDate = toDateInput(addDays(new Date(), 7));
    const invoiceNumber = nextInvoiceNumber();
    return {
      id: "",
      tenantId,
      invoiceNumber,
      issueDate,
      dueDate,
      billingPeriod: monthLabel(new Date()),
      lineItems: tenant ? defaultLineItems(tenant) : [{ type: "Rent", description: "Rent", amount: 0 }],
      previousBalance: 0,
      credits: 0,
      notes: "",
      paymentInstructions: state.landlord.paymentInstructions,
      status: "open",
      updatedAt: new Date().toISOString(),
    };
  }

  function defaultLineItems(tenant) {
    const items = [];
    if (toNumber(tenant.rent) > 0) {
      items.push({ type: "Rent", description: `${tenant.unit ? tenant.unit + " " : ""}Monthly rent`, amount: tenant.rent });
    }
    if (toNumber(tenant.utilities) > 0) {
      items.push({ type: "Utility", description: "Utilities", amount: tenant.utilities });
    }
    return items.length ? items : [{ type: "Rent", description: "Rent", amount: 0 }];
  }

  function getTenant(id) {
    return state.tenants.find((tenant) => tenant.id === id);
  }

  function calculateTotal(invoice) {
    const total = sumLineItems(invoice.lineItems) + toNumber(invoice.previousBalance) - toNumber(invoice.credits);
    return Math.max(0, roundMoney(total));
  }

  function sumLineItems(lineItems) {
    return roundMoney((lineItems || []).reduce((total, item) => total + toNumber(item.amount), 0));
  }

  function markDirty() {
    els.saveState.textContent = "Unsaved";
    if (draft.status !== "paid") {
      els.invoiceStatus.textContent = "Draft";
    }
  }

  function loadState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return clone(defaultState);
      const parsed = JSON.parse(stored);
      return {
        landlord: { ...defaultState.landlord, ...(parsed.landlord || {}) },
        tenants: Array.isArray(parsed.tenants) ? parsed.tenants : clone(defaultState.tenants),
        invoices: Array.isArray(parsed.invoices) ? parsed.invoices : [],
      };
    } catch (error) {
      console.warn("Unable to load saved Rent Ledger data.", error);
      return clone(defaultState);
    }
  }

  function saveState(reason = "Saved data") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    recordLocalBackup(reason, state);
    renderBackupStatus();
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

  function importBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result || "{}"));
        if (!window.confirm("Import this backup and replace local Rent Ledger data?")) {
          event.target.value = "";
          return;
        }
        recordLocalBackup("Before import", state);
        state = normalizeState(imported);
        selectedTenantId = state.tenants[0]?.id || "";
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
    selectedTenantId = state.tenants[0]?.id || "";
    selectedInvoiceId = "";
    draft = createBlankInvoice(selectedTenantId);
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
    return {
      landlord: { ...defaultState.landlord, ...(value?.landlord || {}) },
      tenants: Array.isArray(value?.tenants) ? value.tenants : [],
      invoices: Array.isArray(value?.invoices) ? value.invoices : [],
    };
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
    navigator.serviceWorker.register("sw.js").catch((error) => {
      console.warn("Service worker registration failed.", error);
    });
  }

  function nextInvoiceNumber() {
    const year = new Date().getFullYear();
    const existingNumbers = state.invoices
      .map((invoice) => invoice.invoiceNumber || "")
      .filter((number) => number.startsWith(`INV-${year}-`))
      .map((number) => Number(number.split("-").pop()))
      .filter(Number.isFinite);
    const next = Math.max(0, ...existingNumbers) + 1;
    return `INV-${year}-${String(next).padStart(4, "0")}`;
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

  function monthLabel(date) {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
    }).format(date);
  }

  function formatMultiline(value) {
    const clean = escapeHtml(value || "");
    return clean.replace(/\n/g, "<br />");
  }

  function addDays(date, days) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
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
