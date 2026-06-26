# Rent Ledger

Rent Ledger is a local-first rent and utility invoice app for desktop and mobile browsers.

## Run The App

Double-click `Start-Rent-Ledger.cmd`.

The launcher starts a local web server on `127.0.0.1`, opens the app in your browser, and enables browser features that do not work from `file://`, such as service-worker offline support.

Use `Stop-Rent-Ledger.cmd` when you want to stop the background local server.

## Run On A Phone

Double-click `Start-Rent-Ledger-Mobile.cmd`.

The mobile launcher starts the app on the local network, opens it on the desktop, prints a phone URL, and copies that phone URL to the clipboard. Open that URL from a phone on the same Wi-Fi network.

If the phone cannot connect, run `Start-Rent-Ledger-Mobile.cmd` as Administrator once so it can add the Private-network firewall rule. Guest Wi-Fi, VPNs, cellular data, or router client isolation can still block phone-to-PC traffic.

## Use Anywhere

For access away from the current Wi-Fi network, publish the static app over HTTPS. See `DEPLOYMENT.md`.

Hosting the app online makes the app itself available anywhere. It does not make browser-local invoice data sync across devices. Shared data requires a backend with authentication and a database.

Live app:

```text
https://bryanpettit80-cpu.github.io/rent-ledger/
```

## Utility Calculations

Use `Invoice type` to send rent and utilities separately. A `Rent invoice` includes the monthly rent line only. A `Utility invoice` opens the Utility Allocation section so you can enter the actual bills and apply the calculated utility charge. `Rent + utility` remains available if you ever need a combined document.

- `Occupancy units` follows the lease formula: tenant occupancy units divided by total property occupancy units, multiplied by actual utility charges.
- `Equal split` supports older invoices that split the utility total across tenants or shares and rounds the share up to the next cent.
- The generated invoice shows the bill inputs, allocation math, and the calculated utility line item.

## Data Safety

The app stores tenant and invoice data in your browser on the current device. It now keeps a rolling local backup history in browser storage, but browser storage is still not a permanent accounting archive.

Use **Export backup** regularly. The exported JSON file is the portable copy you can move to another device or keep with your records.

## Current Limits

- Data does not automatically sync between desktop and phone.
- Email sending is not built in.
- Online payments are not built in.
- Multi-user login and a shared database require a hosted backend.

The current setup is intentionally simple and private. A production sync version should add authentication, a database, encrypted transport, and clear backup/retention rules.
