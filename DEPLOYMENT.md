# Dedicated HTTPS Deployment

Rent Ledger is a static PWA with two separate concerns:

1. Host the app shell at one trusted HTTPS origin.
2. Move the existing browser data to that origin without losing the authoritative state.

The production target is Cloudflare Pages at:

```text
https://rent-ledger-app.pages.dev
```

If that project name is unavailable, use:

```text
https://rent-ledger-app-2026.pages.dev
```

The generated `pages.dev` hostname is a dedicated HTTPS origin, so no purchased domain is required. Do not authorize
email sending until the final project name and production URL are known. The app hard-gates Gmail authorization to its
configured production origin; if the fallback name is required, update `EMAIL_PRODUCTION_ORIGIN` in `app.js` to that
exact origin before the release, rerun validation, and authorize only the chosen origin.

GitHub Pages remains configured during migration. It continues to deploy the current app from `main`, but it is the old
state origin and must not receive Gmail permission.

## Static Build Contract

Run:

```powershell
node .github/scripts/prepare-static-site.mjs
```

The script recreates `_site/` from an explicit allowlist:

- `index.html`
- `privacy.html`
- `terms.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `sw.js`
- `_headers`
- `assets/`
- generated `.nojekyll`

Nothing else in the repository is published. The GitHub Pages workflow uses this same script. Cloudflare Pages should
publish `_site/` directly.

## Create The Cloudflare Pages Project

Cloudflare Pages can connect to GitHub and deploy when `main` changes. Cloudflare recommends limiting its GitHub app to
only the repositories it needs. See the
[Cloudflare Pages GitHub integration guide](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/).

1. Sign in to Cloudflare and create a **Pages** project using **Git integration**.
2. Connect the GitHub account and select only the `rent-ledger` repository.
3. Set the project name to `rent-ledger-app`. If Cloudflare reports that it is unavailable, use
   `rent-ledger-app-2026`.
4. Set the production branch to `main`.
5. Use these build settings:

   | Setting | Value |
   | --- | --- |
   | Framework preset | None |
   | Build command | `node .github/scripts/prepare-static-site.mjs` |
   | Build output directory | `_site` |
   | Root directory | repository root / blank |

6. Save and deploy. A nonzero staging-script exit stops the deployment when a required runtime file is missing.
7. Open the exact production URL and confirm the dashboard, privacy page, terms page, manifest, service worker, and
   versioned assets load over HTTPS.
8. In the Cloudflare deployment settings, keep `main` as the only production branch. Preview deployments may remain
   available for code review, but never add a preview hostname to a production Google OAuth client.

Cloudflare reads `_headers` from the build output and applies it to static responses. The committed policy limits scripts,
frames, styles, and network calls to Rent Ledger and the Google endpoints needed for Identity Services, Drive, Gmail, and
account identity. It also uses `Cross-Origin-Opener-Policy: same-origin-allow-popups` so the Google authorization popup
can return to the app. See [Cloudflare Pages custom headers](https://developers.cloudflare.com/pages/configuration/headers/).

## Configure Google For The Production Origin

Use a production Google Cloud project that is separate from development or staging:

1. Enable the **Gmail API**.
2. Configure the Google Auth Platform branding:
   - App name: `Rent Ledger`
   - Homepage: the exact Cloudflare production URL
   - Privacy policy: `<production-origin>/privacy.html`
   - Terms of service: `<production-origin>/terms.html`
   - User support and developer contact: an address you monitor
3. Set the audience to **External** and publish the app **In production**.
4. Declare only the scopes the email client requests:
   - `https://www.googleapis.com/auth/gmail.send` for explicit email delivery
   - `https://www.googleapis.com/auth/userinfo.email` to display the connected sending account
5. Create a **Web application** OAuth client for Google Email. Authorize only the exact production origin and
   paste that client ID in **Settings > Google Email > Advanced email setup**.

Do not authorize the shared GitHub Pages origin, a Cloudflare preview hostname, `file://`, or a project URL containing a
path for Gmail sending. Do not put a client secret, API key, refresh token, or SMTP password in this repository or in
browser storage.

The legacy optional Google Drive integration is not required for this deployment or migration. Before newly enabling it,
review the current
[Google Workspace API user data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)
for the intended use. Keep Drive authorization separate from the Gmail client and do not add `drive.file` merely to make
email work.

Google classifies `gmail.send` as a sensitive scope. A personal-use app with fewer than 100 users can continue without
verification, but Google may show an unverified-app warning. See
[Google's personal-use exception](https://support.google.com/cloud/answer/13464323) and
[Gmail scope classifications](https://developers.google.com/workspace/gmail/api/auth/scopes).

The saved landlord email must be the connected Gmail address or an address already configured and verified in Gmail as a
**Send mail as** alias. Rent Ledger does not request Gmail settings permission and cannot create an alias. Configure the
alias in Gmail before the canary if needed.

## Verify Email Before Using Real Tenant Addresses

Use a sample invoice and an address you own:

1. Open the Cloudflare production URL and save the email OAuth client ID.
2. Select **Connect Google Email** and confirm the connected account shown by Rent Ledger is the intended sender.
3. Review and send one **New invoice** email. Confirm the subject/body, sender, recipient, PDF attachment, Sent-folder
   copy, and absence of the normal Gmail signature.
4. Record a partial sample payment and send **Payment received**. Confirm the payment amount/date and remaining balance;
   this message should not have a PDF.
5. Repeat with a full payment and confirm it says paid in full.
6. Send a **Payment reminder** for an open sample invoice. Confirm the current balance, due/overdue wording, payment
   instructions, and invoice PDF.
7. Confirm the local audit trail records only successful sends and does not contain the message body or an access token.
8. On an uncertain network failure, check Gmail's Sent folder before trying again.
9. Delete the sample invoice after the canary, or import the verified production JSON backup to replace the sample state.

## Move Existing Data From GitHub Pages

Browser local storage is scoped to an origin. Changing from
`https://bryanpettit80-cpu.github.io/rent-ledger/` to a `pages.dev` hostname starts with empty local data.

1. At the old origin, open **Settings > JSON Backup** and select **Export JSON**.
2. Confirm the downloaded `.json` file exists, is not empty, and has the current date. Keep a second copy in a separate
   safe location before continuing.
3. Stop entering or editing data at the old origin, but keep its browser profile and site data intact as rollback.
4. At the Cloudflare production origin, open **Settings > JSON Backup**, select **Import JSON**, choose the verified file,
   and confirm the full-state replacement.
5. Verify landlord settings, tenants, saved invoices, balances, payments, closed periods, period locks, and local audit
   history before making any new entry.
6. Reload the Cloudflare origin and repeat the verification to prove the imported state persisted locally.
7. Complete the owned-address email canary above.
8. Close every old-origin tab so any in-memory Google token is discarded. The email OAuth client must never contain the
   old GitHub Pages origin.
9. If an existing Drive Web client authorized the old origin solely for Rent Ledger, remove the old origin from
   Authorized JavaScript origins only after the JSON migration and rollback copy are independently confirmed.
10. Only after the new origin is proven should GitHub Pages be changed to a moved notice and its service worker retired.
    Preserve its old browser site data and the exported JSON as recovery until the new origin has been used successfully.

## Static-App Boundaries

- The app has no backend database, server-side user accounts, scheduled sends, or multi-user access control.
- Local data can be read by any script served from the same origin; keep the production origin dedicated to trusted Rent
  Ledger code.
- Google access tokens are short-lived and kept in page memory. Closing or reloading the page can require reconnection.
- Email sends are explicit and reviewed. There is no bulk send, automatic reminder, open tracking, delivery tracking, or
  automatic retry.
- Browser storage is not a permanent accounting archive. Keep verified offline JSON backups.
