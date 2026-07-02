# Rent Ledger

Rent Ledger is a local-first invoice app for landlords who need to create rent invoices and utility reimbursement invoices for tenants. It runs in desktop and mobile browsers and can be hosted as a static site.

Live app:

```text
https://bryanpettit80-cpu.github.io/rent-ledger/
```

## What It Does

- Creates separate `Rent invoice`, `Utility invoice`, and `Security Deposit invoice` records.
- Stores tenant profiles, landlord contact details, and payment instructions.
- Calculates utility reimbursements from actual utility bills.
- Starts on a current-cycle overview that shows what still needs to be billed.
- Shows an Operations Dashboard with billing health checks, overdue balances, and next actions.
- Creates all remaining rent invoices for the current cycle from the Rent workflow.
- Creates all remaining utility invoices for the current cycle from one utility calculation.
- Creates security deposit invoices for active tenants with saved deposit amounts.
- Supports lease-based occupancy-unit allocation and older equal-split utility invoices.
- Shows a live invoice preview before printing or saving.
- Prints invoices to paper or PDF through the browser.
- Generates invoice PDFs and saves them to Google Drive when Drive is connected.
- Records full and partial invoice payments from the saved-invoice lists without adding payment fields to the invoice editor.
- Creates copyable tenant message drafts for open balances.
- Saves invoice history in the current browser.
- Keeps a Local Audit Trail of local saves, payments, imports, Drive writes, and period locks.
- Exports invoice, tenant balance, and audit CSV reports.
- Locks reviewed billing periods so invoice changes require confirmation.
- Keeps local browser state and can sync that state to Google Drive.
- Separates active and inactive tenants.
- Optionally syncs the app state to Google Drive after Google Drive is connected.
- Works on mobile and desktop screen sizes.
- Installs service-worker offline support when served over HTTP or HTTPS.

## Quick Start

Open the hosted app:

```text
https://bryanpettit80-cpu.github.io/rent-ledger/
```

Or run it locally on this computer:

```text
Start-Rent-Ledger.cmd
```

Use this when you are done with the local server:

```text
Stop-Rent-Ledger.cmd
```

## Run On A Phone Locally

To use the app from a phone on the same Wi-Fi network:

```text
Start-Rent-Ledger-Mobile.cmd
```

The launcher starts the app on the local network, opens it on the desktop, prints a phone URL, and copies that URL to the clipboard.

If the phone cannot connect, run `Start-Rent-Ledger-Mobile.cmd` as Administrator once so it can add the Private-network firewall rule. Guest Wi-Fi, VPNs, cellular data, and router client isolation can still block phone-to-PC access.

## Invoice Workflow

### Current Billing Cycle

The app sets the current rent cycle automatically:

- From the 1st through the 10th of a month, the current rent cycle is the current calendar month.
- Beginning on the 11th, the current rent cycle moves to the next calendar month.
- Rent invoices use the current rent cycle as the billing period.
- Utility invoices use the immediately preceding rent cycle as the billing period.
- Security deposit invoices use the current rent cycle as the billing period.
- Rent and utility invoices are due on the 1st day of the rent cycle month.
- Generated invoice numbers include the two-digit billing month.

Example: on June 28, 2026, the rent billing period is `July 2026`, the rent invoice number starts with `RNT-2026-07-`, the utility billing period is `June 2026`, the utility invoice number starts with `UTL-2026-06-`, the security deposit invoice number starts with `DEP-2026-07-`, and all three invoice types are due `July 1, 2026`.

### Rent Invoice

Use the Rent workflow for monthly rent charges.

Rent invoices:

- Use invoice numbers like `RNT-2026-07-0001`.
- Include the tenant's monthly rent line.
- Hide the utility calculator.
- Show active tenants first so you can create one missing rent invoice or use `Create all rent invoices`.
- Keep `Apply charge` inside `Edit charges` for the rare case where you need to refresh the rent line from the selected tenant's current monthly rent.
- Are the preferred way to bill predictable monthly rent.

### Utility Invoice

Use the Utility workflow after the actual utility bills are available.

Utility invoices:

- Use invoice numbers like `UTL-2026-06-0001`.
- Do not include rent.
- Show the shared Utility Allocation inputs first.
- Add the calculated utility reimbursement as a generated charge line.
- Use `Create all utilities` to generate utility invoices for every utility-billable tenant who is still missing one for the current utility period.
- Show the allocation math on the invoice preview.
- Let you open an individual utility invoice afterward if you need a one-off adjustment.

### Security Deposit Invoice

Use the Security Deposits workflow for tenant deposit charges.

Security deposit invoices:

- Use invoice numbers like `DEP-2026-07-0001`.
- Use the tenant's saved security deposit amount.
- Hide the utility calculator.
- Show active tenants with a saved deposit amount first so you can create one missing deposit invoice or use `Create all security deposits`.
- Keep `Apply charge` inside `Edit charges` for the rare case where you need to refresh the deposit line from the selected tenant's current profile.

### Editing Charges And Preview

Normal rent, utility, and security deposit invoices should not require manual charge editing. The raw line-item editor is behind `Edit charges` so the primary workflow stays focused on tenant, period, amount, save, and print.

On mobile, the invoice document preview is hidden until you tap `Preview`. Desktop screens continue to show the editor and preview side by side.

### Invoice States

The invoice header uses these states:

- `Draft`: the current invoice is a working draft in the browser and has not been saved as an invoice record.
- `Saved locally`: the invoice is saved in the browser.
- `Saved to Drive`: the invoice is saved in the browser and has Drive PDF metadata from a completed PDF/state upload.
- `Unsaved changes`: a saved invoice was edited after its last save.
- `Partially paid`: one or more partial payments have been recorded and a balance remains.
- `Paid`: the saved invoice has been fully paid from the Invoices page, overview invoice list, or workflow row.

Use `Mark paid` from a saved invoice card or workflow row to open the payment popup. Choose `Full` to record the remaining balance, or choose `Partial` and enter the amount received. Fully paid invoices can be reopened, which clears the recorded invoice payments and returns the invoice to `Open`. Editing, marking paid, or reopening an invoice clears its prior Drive PDF metadata until the changed invoice is saved to Drive again.

Credits or adjustments reduce the balance before payment recording. If a $200 tenant payment is entered as a credit, do not also record that same $200 through `Mark paid`; the payment popup only accepts amounts up to the remaining balance due.

## Operations Dashboard

The Overview screen includes an operations section for day-to-day review:

- Billing Health checks active tenants, missing emails, zero rent amounts, utility allocation setup, duplicate tenant/type/period invoices, paid invoices with remaining balances, overdue open balances, and whether reviewed periods are locked.
- Next actions routes directly to Rent, Utilities, Security Deposits, Invoices, or the current-cycle lock action.
- Open Balances lists overdue invoices with quick access to open the invoice, copy a tenant message, or record payment.
- Communication drafts generate local message text for open invoices. The app prepares the draft, but it does not send email.

## Closed Periods

Use `Settings` > `Closed Periods` after a billing cycle has been reviewed.

- `Lock current cycle` locks the current rent/security period and the related utility period.
- Editing, deleting, marking paid, or reopening invoices in a locked period requires confirmation.
- `Unlock current cycle` removes the confirmation guard for the current rent/security and utility periods.
- Closed periods are stored in the local app state, included in JSON backups, and included when the state is uploaded to Google Drive.

## CSV Exports

Use `Settings` > `Reports` to download:

- `Invoice CSV` for invoice-level accounting review.
- `Tenant balances CSV` for open balances by tenant.
- `Audit CSV` for local activity review.

These exports are generated in the browser from the current local data. They do not require a cloud database.

## Local Audit Trail

The Settings screen shows recent local activity, including invoice saves, tenant changes, imports, Drive metadata writes, payment actions, deletes, restores, and period locks. The audit trail is stored with the local app state, capped to the most recent activity, and included in Drive state sync when Drive is connected.

## Utility Calculations

Open the Utility Allocation section on a `Utility invoice`.

### Occupancy Units

This follows the lease formula:

```text
Tenant utility share = tenant occupancy units / total property occupancy units x actual utility charges
```

Example:

```text
1.5 / 4.5 x $400.00 = $133.33
```

### Equal Split

This supports older invoices that split utility charges evenly across tenants or shares.

Example:

```text
$381.29 / 4 shares = $95.33
```

The equal-split method rounds up to the next cent to match the prior utility invoice format.

## Printing And PDFs

Use `Print` from the invoice screen.

In the browser print dialog:

- Choose a printer for paper output.
- Choose `Save as PDF` or `Microsoft Print to PDF` for a PDF file.

The preview shown in the app is the document intended for printing.
The print layout is compact and targets one letter-size page for normal rent and utility invoices.

## Tenants

The Tenants screen has separate active and inactive lists.

Active tenants:

- Appear in the invoice tenant selector.
- Have an `Invoice` action in the tenant directory.
- Can be excluded from utility billing while remaining active for rent invoices.
- Can store a security deposit amount for the Security Deposits workflow.

Inactive tenants:

- Stay in the app for history and old invoices.
- Do not appear in the active tenant list.
- Can be restored with `Make active`.

## Google Drive Sync

Google Drive sync is optional. The hosted app is preconfigured with a Google OAuth web client ID, and `Settings` lets you replace it if you create a new Google Cloud project later.

The OAuth client must allow this JavaScript origin:

```text
https://bryanpettit80-cpu.github.io
```

The client ID must look like:

```text
1234567890-abc123.apps.googleusercontent.com
```

Do not paste a Google account email, project ID, API key, or client secret. Those values cause Google to reject the sign-in with `Error 401: invalid_client`.

In `Settings`:

1. Leave the prefilled Google OAuth client ID in place unless you created a replacement.
2. Use `Connect Drive` to grant Google Drive access.
3. Use `Download from Drive` to replace this browser's data with the Drive copy.
4. Use `Upload to Drive` to upload this browser's current data to Drive.
5. Open `Advanced Drive setup` only when you need to change the OAuth client ID or auto-upload setting.

Drive actions save the current OAuth client ID and auto-sync setting before they run, so there is no separate connection-settings save step.

When connected, the app creates a visible `Rent Ledger` folder and stores `rent-ledger-state.json` in that folder. Saved invoices, tenant edits, settings changes, imports, restores, and paid/deleted invoice changes continue to save locally first, then can sync the JSON state to Drive.

The invoice screen has one `Save` button. It saves the current invoice to the browser, updates the Drive state JSON when Drive is available, generates a PDF, and uploads the PDF to:

```text
Rent Ledger/Invoices/
```

The Rent workflow's `Create all rent invoices` button, the Utility workflow's `Create all utilities` button, and the Security Deposits workflow's `Create all security deposits` button create all missing invoices locally first, then upload the updated state and each generated PDF to Drive when Drive is connected.

After Drive has been connected once, the app remembers that connection after a refresh. It does not permanently store the Google access token, and it does not ask Google for a new token just because the page refreshed.

When you click a Drive action such as `Save`, `Upload to Drive`, `Download from Drive`, or `Connect Drive`, the app asks Google for a new short-lived token only if one is needed. Browser security can still require account selection or consent at that point.

Important:

- Browser storage is not a permanent accounting archive.
- Clearing browser data can remove saved tenants and invoices.
- Google Drive sync is unavailable until a valid OAuth client ID is configured and Drive is connected.

## Data And Privacy

This app is local-first. Tenant and invoice data stays in the browser unless you connect Google Drive sync or print/save invoice PDFs.

The operations dashboard, closed periods, CSV exports, and local audit trail also run in the browser and stay in the same local state file.

The current static version does not include:

- User accounts
- Cloud database sync
- Email sending
- Online payment collection
- Multi-user access control

A production synced version should add authentication, a database, encrypted transport, access controls, and a retention/backup policy.

## Deployment

The app is deployed with GitHub Pages.

More deployment notes are in:

```text
DEPLOYMENT.md
```

The app is a static site. The core files are:

```text
index.html
styles.css
app.js
manifest.webmanifest
sw.js
assets/
```

No build step is required for the current app.

## Release Checklist

For browser-visible changes, bump the static app version before pushing:

```text
node .github/scripts/bump-version.mjs
```

That helper updates `APP_VERSION`, the splash-screen version, service-worker cache names, and versioned asset URLs together. It can also take an explicit version:

```text
node .github/scripts/bump-version.mjs rent-ledger-v32 --date "July 2, 2026"
```

Before merging or pushing a release, run:

```text
node --check app.js
node --check sw.js
node .github/scripts/validate-static.mjs
```

GitHub CI also installs Playwright and runs `.github/scripts/smoke-test.mjs`, including the browser workflow checks and multi-page invoice PDF coverage.

## Refreshing The App

The app uses a service worker for offline support. New deployments use versioned assets and a network-first service worker so browsers pick up updates more reliably.

If a phone or desktop still shows an old layout:

1. Close the app tab.
2. Reopen the live URL.
3. Wait for one automatic refresh if it happens.
4. Confirm the splash screen shows the current version.

## Troubleshooting

### I see both rent and utility boxes on a rent invoice

Open the `Rent` tab from the top navigation.

- `Rent invoice` should show only rent.
- `Utility invoice` should show only utility charges.

If the type is correct but the layout is stale, close and reopen the app.

### My phone cannot open the local URL

Use the hosted GitHub Pages URL for access anywhere:

```text
https://bryanpettit80-cpu.github.io/rent-ledger/
```

For local phone access, make sure:

- Phone and computer are on the same Wi-Fi.
- VPN is off.
- Guest Wi-Fi is not isolating devices.
- The Windows Private-network firewall rule exists.

### My data is missing on another device

Without Google Drive sync, that is expected. Data is stored in each browser separately.

With Google Drive sync, connect Drive on the second device and use `Download from Drive`.

## Development Notes

The app is dependency-free and currently does not require Node, npm, or a build tool.

For local testing, serve the folder over HTTP instead of opening `index.html` directly. The included launch scripts do this automatically.
