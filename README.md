# Rent Ledger

Rent Ledger is a local-first invoice app for landlords who need to create rent invoices and utility reimbursement invoices for tenants. It runs in desktop and mobile browsers and can be hosted as a static site.

Live app:

```text
https://bryanpettit80-cpu.github.io/rent-ledger/
```

## What It Does

- Creates separate `Rent invoice`, `Utility invoice`, or `Rent + utility` invoices.
- Stores tenant profiles, landlord contact details, and payment instructions.
- Calculates utility reimbursements from actual utility bills.
- Supports lease-based occupancy-unit allocation and older equal-split utility invoices.
- Shows a live invoice preview before printing or saving.
- Prints invoices to paper or PDF through the browser.
- Saves invoice history in the current browser.
- Exports full JSON backups and imports tenant-only JSON files.
- Keeps a rolling local backup history in browser storage.
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

### Rent Invoice

Use `Rent invoice` for the monthly rent charge only.

Rent invoices:

- Use invoice numbers like `RNT-2026-0001`.
- Include the tenant's monthly rent line.
- Hide the utility calculator.
- Are the preferred way to bill predictable monthly rent.

### Utility Invoice

Use `Utility invoice` after the actual utility bills are available.

Utility invoices:

- Use invoice numbers like `UTL-2026-0001`.
- Do not include rent.
- Show the Utility Allocation section.
- Add the calculated utility reimbursement as a generated charge line.
- Show the allocation math on the invoice preview.

### Rent + Utility Invoice

Use `Rent + utility` only when you intentionally want one combined invoice.

Combined invoices:

- Use invoice numbers like `INV-2026-0001`.
- Include rent plus utility charges.
- Keep the utility calculation details on the invoice.

## Utility Calculations

Open the Utility Allocation section on a `Utility invoice` or `Rent + utility` invoice.

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

Use `Print / PDF` from the invoice screen.

In the browser print dialog:

- Choose a printer for paper output.
- Choose `Save as PDF` or `Microsoft Print to PDF` for a PDF file.

The preview shown in the app is the document intended for printing.

## Backups

Rent Ledger stores data in the browser on the current device.

Use `Export backup` regularly. The exported JSON file is the portable copy you can store with your records or import on another device.

Use `Import backup` to replace the current browser's local data with a saved full backup file.

The same import control can also load a tenant-only JSON file. Tenant-only imports merge into the current browser data, update tenants with matching names, keep landlord settings and invoices, and preserve imported active/inactive status plus payment history in the tenant memo.

Important:

- Browser storage is not a permanent accounting archive.
- Clearing browser data can remove saved tenants and invoices.
- The hosted static app does not automatically sync data between devices.

## Data And Privacy

This app is local-first. Tenant and invoice data stays in the browser unless you export a backup file.

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

## Refreshing The App

The app uses a service worker for offline support. New deployments use versioned assets and a network-first service worker so browsers pick up updates more reliably.

If a phone or desktop still shows an old layout:

1. Close the app tab.
2. Reopen the live URL.
3. Wait for one automatic refresh if it happens.
4. Confirm the invoice screen has the `Invoice type` field.

## Troubleshooting

### I see both rent and utility boxes on a rent invoice

Check `Invoice type`.

- `Rent invoice` should show only rent.
- `Utility invoice` should show only utility charges.
- `Rent + utility` intentionally shows both.

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

That is expected in the current static version. Data is stored in each browser separately.

Export a backup from the first device and import it on the second device.

## Development Notes

The app is dependency-free and currently does not require Node, npm, or a build tool.

For local testing, serve the folder over HTTP instead of opening `index.html` directly. The included launch scripts do this automatically.
