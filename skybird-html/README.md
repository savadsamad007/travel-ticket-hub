# Skybird — HTML / JS edition (Supabase + Google Sheets mirror)

Plain static HTML+JS. **Same Supabase database** as the React app, plus every
write is mirrored to your Google Sheet via Apps Script.

## How to run

1. Open `index.html` in any browser (or upload the folder to GitHub Pages,
   Netlify, S3, Google Drive — anywhere that serves static files).
2. Sign in with the **same email + password** you use in the React app.
   Brand-new users self-register and become admin of their own agency.

No build step, no npm, no server.

## Architecture

```
Browser
  ├── Supabase (https://zshyqwviuuhplgyiatdw.supabase.co)   ← source of truth
  └── Apps Script Web App  ← fire-and-forget mirror of every write
        → Google Sheet  1CcpkHYyL3WWgu4X2p2WUTYjBcz1hNqJjq7CrF-dsDNg
```

- **Reads** go to Supabase only (fast, RLS-protected, multi-user safe).
- **Writes** go to Supabase first; on success the same row is POSTed to your
  Apps Script `mirror` action which appends/updates a row in the matching
  tab (Tickets, Payments, Customers, …). Tabs auto-create with headers
  derived from the row fields.
- If the mirror fails (sheet down, quota, network), the app keeps working —
  Supabase is the truth.

## Google Sheets setup (one-time)

1. Open your Apps Script project (the one already deployed at the URL in
   `js/api.js`) and **replace `Code.gs`** with `apps-script/Code.gs` from
   this folder.
2. **Deploy → Manage deployments → Edit (pencil) → New version → Deploy.**
   Keep the same Web App URL.
3. The first mirror call auto-creates every tab.

The Apps Script `auth.*` / per-table actions stay available so older HTML
deployments keep working — but the React parity build uses **only** the
`mirror` action.

## Daily auto-email at 23:59

Configure once in Apps Script:

> **Triggers → + Add trigger → Function: `sendDailyReport` → Time-driven →
> Day timer → 11pm–12am.**

It reads `agency_profile` from the Sheet and emails the summary to
`report_email`. Since the Sheet mirrors every write, the daily report
stays in sync without a separate Supabase cron.

> Want the daily email computed from Supabase directly instead? Ask and
> I'll add a Supabase Edge Function / pg_cron variant.

## Permissions

Same as the React app:
- First user in an agency is **admin** (full access).
- Admin creates salesmen from **Staff** and ticks which pages they can
  use. Salesmen can never see profit/cost or delete.
- All access is enforced server-side via Supabase RLS — even if someone
  edits the HTML, the database refuses unauthorized rows.

## Files

```
skybird-html/
├── index.html          ← single page (login + app shell)
├── css/app.css
├── js/
│   ├── api.js          ← gas(action, data) → Supabase + mirror to Sheet
│   ├── auth.js         ← Supabase Auth (email + password)
│   ├── store.js, router.js, ui.js, format.js, airlines.js, whatsapp.js, pdf.js
│   └── pages/          ← dashboard, tickets, payments, customers, …
└── apps-script/Code.gs ← paste into your Apps Script editor
```
