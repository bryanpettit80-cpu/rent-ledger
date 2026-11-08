# Repository Instructions

Rent Ledger is a local-first static invoice PWA. Its runtime is plain HTML, CSS, and JavaScript, with optional Google Drive synchronization. Preserve that architecture and the separate rent, utility, and one-time security-deposit workflows.

## Project map and development

- Runtime files are `index.html`, `styles.css`, `app.js`, `manifest.webmanifest`, `sw.js`, and `assets/`. There is no application build or runtime npm dependency step.
- `README.md` documents billing rules and operator behavior; `DEPLOYMENT.md` governs hosting and origin changes. Read those sections when changing billing, storage, synchronization, or hosting.
- Serve the checkout over HTTP for development. Windows users can use `Start-Rent-Ledger.cmd` and `Stop-Rent-Ledger.cmd`. A loopback-only test server can use `python -m http.server 4173 --bind 127.0.0.1`.
- Use isolated browser contexts and synthetic tenant/invoice state for validation. Keep tenant records, exports, backups, tokens, and credentials out of the repository and PRs. Real Drive uploads or full-state replacements are operational actions, not routine tests.

## Validation and versioning

Node 24 is used in CI for development checks. From the repository root:

```text
node --check app.js
node --check sw.js
node .github/scripts/validate-static.mjs
```

For runtime, billing, synchronization, or UI changes, run the browser suite as well. CI installs Playwright with `npm install --no-save playwright` and `npx playwright install --with-deps chromium`, serves the app on loopback port 4173, and runs `node .github/scripts/smoke-test.mjs`. The script defaults to `http://127.0.0.1:4173/`; set `RENT_LEDGER_URL` only to an isolated test instance. Use `.github/workflows/ci.yml` for the current CI sequence and platform-specific setup.

For browser-visible changes, run `node .github/scripts/bump-version.mjs` before pushing. It updates the app version, splash display, service-worker caches, and versioned asset URLs together. Documentation-only changes do not need an app version bump.

A push to `main` triggers `.github/workflows/deploy-pages.yml`. Account for that deployment side effect when preparing an authorized merge; a task branch or draft PR does not deploy the site.

## Code Review Rules

- Preserve billing identity and arithmetic: rent and utilities use their documented distinct cycles, deposits remain one-time per tenant across saved history, and utility allocation/rounding and payment-versus-credit handling must not create duplicate charges or balances.
- Preserve cross-tab safeguards for closed periods, full-state replacement, and Drive/PDF operations. Check both old and new billing periods on edits; stale tabs must not overwrite replacement data or upload obsolete artifacts. Do not bypass the shared operation lock when Web Locks are unavailable.
- Keep state local-first and preserve compatibility with existing backups. OAuth access tokens remain ephemeral, Drive authorization remains explicit, and production storage requires a dedicated trusted origin; project-path separation alone does not isolate localStorage.

## Pull requests

Use a task branch and open a focused draft PR against `main`, following [the PR template](.github/pull_request_template.md). Record checks actually run and material limitations. Merge only when requested and after required checks and reviews are satisfied; these instructions grant no standing merge authorization.
