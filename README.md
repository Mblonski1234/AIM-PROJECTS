# AIM Program Portal

A password-gated, searchable browser for Marquette University's **Applied
Investment Management (AIM)** program materials — ten years of handbooks, forms,
syllabi, and documents, findable in seconds instead of dug out of folders.

> **Status: proof of concept.** Runs today with sample data in "local mode."
> The 10 GB+ real library gets wired in afterward via Cloudflare R2 (object
> storage) — no code changes, just environment variables.

---

## What it does

- **One shared password** to enter (no per-student accounts to manage).
- **Live keyword search** across document titles, folders, and tags.
- **Category chips** (Handbooks, Forms, Syllabi, …) for one-click browsing.
- **Click to open** any file in a new tab.
- Marquette navy + gold branding.

## Architecture

```
Student → Render (this Node app) → search index (tiny JSON in repo)
                                 → file link → Cloudflare R2 (the actual files)
```

- The repo holds only **code + a metadata index** (names/folders/tags) — small
  and safe to keep in GitHub. The **files themselves** live in R2.
- Two storage modes, chosen automatically by environment variables:
  - **Local mode** (default): serves demo files from `./files`. Zero setup.
  - **R2 mode**: when the `R2_*` vars are set, serves short-lived presigned
    links straight from object storage. Scales to any size.

## Run locally

```bash
npm install
npm start
# open http://localhost:3000   ·   password: aim-demo
```

## Deploy on Render

1. Push this repo to GitHub (done).
2. Render → **New +** → **Blueprint** → connect this repo (`render.yaml` is read
   automatically).
3. Set `SITE_PASSWORD` in the Render dashboard. Done — you get a public URL.

## Wiring in the real 10 GB library (later)

1. Export the AIM files out of SharePoint (download the library).
2. Create a Cloudflare **R2** bucket and upload the files (preserving folders).
3. Build the search index from the exported folder:
   ```bash
   node scripts/build-index.js --dir "C:/path/to/exported/AIM"
   ```
   Commit the generated `data/index.json`.
4. Add `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
   in Render. Redeploy → the portal now serves the real files.

## Notes

- Brand colors in `public/styles.css` are close approximations — swap the two
  hex values for Marquette's exact brand codes.
- Drop a real campus photo into the hero by setting a background image on
  `.hero` (there's an SVG placeholder illustration now).
