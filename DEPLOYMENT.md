# Anywhere Access

Rent Ledger currently has two separate concerns:

1. **Open the app from anywhere.**
2. **Use the same tenant and invoice data from every device.**

This repository is now ready for the first concern. The app is a static PWA, so it can be hosted over HTTPS by GitHub Pages, Cloudflare Pages, Netlify, or similar static hosting.

Google Drive sync can copy Rent Ledger state between browsers, but each origin has separate browser `localStorage`, and changing origins does not move that local data automatically.

## Recommended First Step: Dedicated-Origin Static Hosting

GitHub Pages, Cloudflare Pages, Netlify, or similar static hosts are good fits for the app shell because there are no server dependencies and no build step. Because Rent Ledger stores landlord, tenant, invoice, and backup data in browser `localStorage`, serve the app from a dedicated origin that hosts only this app and other fully trusted code. Do not enter real tenant or invoice data on a shared GitHub Pages project URL such as `https://<user>.github.io/rent-ledger/` if any other project can run at `https://<user>.github.io/...`; `localStorage` is scoped to the origin, not the project path.

The repository includes `.github/workflows/deploy-pages.yml`, which publishes only these runtime files:

- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `sw.js`
- `assets/`

Before publishing, confirm you are comfortable with the app code being available on the internet. Tenant records and invoices are not stored in the repository, but the app itself will be public when hosted with GitHub Pages. Configure a custom domain or another dedicated origin before using production data, and do not co-host untrusted pages on that same origin.

## Publish Checklist

1. Create or choose a GitHub repository.
2. Add it as this repo's `origin`.
3. Push `main`.
4. In the GitHub repository, open **Settings > Pages**.
5. Set **Source** to **GitHub Actions**.
6. Configure a dedicated custom domain, or use a dedicated GitHub Pages account/user site that does not host other projects or untrusted content on the same `https://<user>.github.io` origin.
7. Create or select a Google OAuth 2.0 client of type **Web application**, add the exact dedicated origin (scheme, host, and optional port) to **Authorized JavaScript origins**, and copy its client ID.
8. Run the `Deploy Pages` workflow or push another commit to `main`.
9. Open the dedicated-origin HTTPS URL on desktop or mobile.

Once opened over HTTPS, the browser can install the PWA and use its service worker. Local invoice data remains per-device and can be read or overwritten by any script served from the same origin, so keep that origin dedicated to trusted Rent Ledger content.

## Move Existing Data To A New Origin

Changing the site origin creates a fresh browser storage area. Migrate the current Drive state before entering data at the new URL:

1. Create or select one **Web application** OAuth client and authorize both the old origin and the new dedicated origin under **Authorized JavaScript origins**.
2. At the old origin, paste that same OAuth client ID under **Settings > Advanced Drive setup**, connect the Google Drive account you will reuse, and use **Upload to Drive**.
3. After the upload succeeds, stop entering or editing data on the old origin so it cannot diverge during the move.
4. Configure and deploy the new origin as described above.
5. At the new origin, paste the same OAuth client ID under **Settings > Advanced Drive setup**, use **Connect Drive**, and select the same Google account.
6. Use **Download from Drive** to replace the new origin's empty state with the uploaded state.
7. Verify the landlord settings, tenants, saved invoices, balances, closed periods, and period locks at the new origin.
8. Close every tab for the old origin so its in-memory Drive token is discarded. In the Google Cloud Console, remove the old origin from Authorized JavaScript origins on every Web application OAuth client that authorized it, including any previously used or prefilled client that differs from the migration client. Save each changed client before resuming work. Confirm that the old origin is no longer listed and the new dedicated origin remains authorized; keep any other origin only if it is still intentionally trusted.
9. Reload the new origin, reconnect Drive, and confirm the state can still be downloaded. Resume entering data only at the new origin.

## Data Sync Upgrade

For concurrent multi-user access with server-side authorization, add:

- User sign-in.
- A hosted database for landlords, tenants, invoices, and backups.
- Server-side access checks so one user's records cannot leak to another user.
- Export/backup retention rules.
- A migration path from current browser `localStorage` data.

Good implementation options include a small API plus PostgreSQL, or a managed backend such as Supabase or Firebase. Do not put private API keys or database credentials into this browser-only app.
