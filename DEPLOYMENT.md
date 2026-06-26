# Anywhere Access

Rent Ledger currently has two separate concerns:

1. **Open the app from anywhere.**
2. **Use the same tenant and invoice data from every device.**

This repository is now ready for the first concern. The app is a static PWA, so it can be hosted over HTTPS by GitHub Pages, Cloudflare Pages, Netlify, or similar static hosting.

The second concern needs a hosted backend with authentication and a database. The current app stores data in each browser's local storage, so desktop, phone, and tablet data are separate unless you export/import JSON backups.

## Recommended First Step: GitHub Pages

GitHub Pages is a good fit for the app shell because there are no server dependencies and no build step.

The repository includes `.github/workflows/deploy-pages.yml`, which publishes only these runtime files:

- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `sw.js`
- `assets/`

Before publishing, confirm you are comfortable with the app code being available on the internet. Tenant records and invoices are not stored in the repository, but the app itself will be public when hosted with GitHub Pages.

## Publish Checklist

1. Create or choose a GitHub repository.
2. Add it as this repo's `origin`.
3. Push `main`.
4. In the GitHub repository, open **Settings > Pages**.
5. Set **Source** to **GitHub Actions**.
6. Run the `Deploy Pages` workflow or push another commit to `main`.
7. Open the published `https://...github.io/.../` URL on desktop or mobile.

Once opened over HTTPS, the browser can install the PWA and use its service worker. Local invoice data remains per-device.

## Data Sync Upgrade

To use the same invoices everywhere, add:

- User sign-in.
- A hosted database for landlords, tenants, invoices, and backups.
- Server-side access checks so one user's records cannot leak to another user.
- Export/backup retention rules.
- A migration path from current browser `localStorage` data.

Good implementation options include a small API plus PostgreSQL, or a managed backend such as Supabase or Firebase. Do not put private API keys or database credentials into this browser-only app.
