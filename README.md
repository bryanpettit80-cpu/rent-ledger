# Rent Ledger

Rent Ledger is a local-first rent and utility invoice app for desktop and mobile browsers.

## Run The App

Double-click `Start-Rent-Ledger.cmd`.

The launcher starts a local web server on `127.0.0.1`, opens the app in your browser, and enables browser features that do not work from `file://`, such as service-worker offline support.

Use `Stop-Rent-Ledger.cmd` when you want to stop the background local server.

## Data Safety

The app stores tenant and invoice data in your browser on the current device. It now keeps a rolling local backup history in browser storage, but browser storage is still not a permanent accounting archive.

Use **Export backup** regularly. The exported JSON file is the portable copy you can move to another device or keep with your records.

## Current Limits

- Data does not automatically sync between desktop and phone.
- Email sending is not built in.
- Online payments are not built in.
- Multi-user login and a shared database require a hosted backend.

The current setup is intentionally simple and private. A production sync version should add authentication, a database, encrypted transport, and clear backup/retention rules.
