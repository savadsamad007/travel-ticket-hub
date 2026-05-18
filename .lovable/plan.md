
# Skybird HTML rebuild — plan

You picked the biggest option: throw away the React/TanStack app and rebuild as a plain static HTML + vanilla JS app that talks directly to your Google Apps Script Web App (Sheet `1CcpkHYy…dsDNg`). No build step, no npm, opens in any browser, deploys as a zip on any static host (or even Google Drive / GitHub Pages).

I want to confirm scope **before** I delete anything, because this is a one-way trip.

## What you get

Single folder `skybird-html/` containing:

```text
skybird-html/
├── index.html              ← login + shell + routing (hash-based: #/dashboard)
├── css/app.css             ← Tailwind-like utility CSS, dark/sky theme
├── js/
│   ├── api.js              ← gas(action, data) → POST to your Web App URL
│   ├── auth.js             ← login / current user / role / permissions
│   ├── store.js            ← in-memory cache + localStorage
│   ├── router.js           ← hash router
│   ├── ui.js               ← table, modal, toast, form helpers
│   ├── airlines.js         ← SV→Saudia autocomplete (same list as before)
│   ├── format.js           ← currency, route auto-/ every 3 chars
│   ├── pdf.js              ← jsPDF via CDN — voucher A5 + invoice A4
│   ├── whatsapp.js         ← wa.me share
│   └── pages/
│       ├── dashboard.js
│       ├── tickets.js      ← + quick-add customer, airline autocomplete
│       ├── refunds.js
│       ├── payments.js     ← + voucher PDF + WhatsApp
│       ├── customers.js
│       ├── suppliers.js
│       ├── sub-agents.js
│       ├── cash-book.js
│       ├── reports.js
│       ├── staff.js        ← per-staff permission checkboxes
│       └── settings.js     ← agency profile, report email
└── apps-script/
    └── Code.gs             ← READY-TO-PASTE Apps Script source you deploy
```

External libs via CDN only: Tailwind Play CDN, jsPDF, jsPDF-AutoTable, Lucide icons. No bundler.

## How data flows

```text
Browser ──fetch POST JSON──▶ Apps Script Web App URL ──▶ Google Sheet tabs
        ◀── { ok, data } ───
```

Single endpoint, every call: `POST { action, data, token }` → `{ ok: true, data }` or `{ ok: false, error }`. All in `js/api.js`:

```js
async function gas(action, data = {}) {
  const r = await fetch(WEB_APP_URL, { method: "POST", body: JSON.stringify({ action, data, token: getToken() }) });
  const j = await r.json(); if (!j.ok) throw new Error(j.error); return j.data;
}
```

## Apps Script side (I generate `Code.gs`)

I'll write a complete `Code.gs` with:
- Sheet tabs created on first run: `users`, `agency_profile`, `customers`, `suppliers`, `sub_agents`, `tickets`, `ticket_services`, `refunds`, `payments`, `staff_permissions`
- `doPost(e)` router that dispatches on `action` (e.g. `auth.login`, `tickets.list`, `tickets.create`, `payments.create`, `staff.setPermissions`, …)
- Simple token auth: on login, generate a token, store in `users` sheet with expiry, return to client; every other call validates it
- Salesman permission check on each mutating action
- Helpers: `nextId()`, `findRow()`, `appendRow()`, `updateRow()`

You will paste it into Apps Script editor, redeploy as Web App ("Anyone with the link"), and the same URL you sent keeps working.

## Migration

Nothing automatic. The React app's Supabase data stays in Supabase. To move existing data, export each table as CSV from Supabase and paste rows into the matching Sheet tab — column order will match what `Code.gs` expects (I'll document it at the top of `Code.gs`).

## What gets lost vs the React app

- No SSR / server functions / TanStack routing — pure hash routes
- No type safety
- PDFs will look the same (jsPDF), but tax-invoice layout will be slightly simpler
- No auto-email cron (Apps Script `time-driven trigger` will replace it — I'll add a `sendDailyReport()` function inside `Code.gs` and tell you how to schedule it at 23:59)
- Animations / polish reduced — focus is functional parity, not visual flourish

## What I will NOT delete

The existing React code in `src/` stays in the repo so you can still open the old preview if anything breaks. The new HTML app lives in `skybird-html/`. GitHub auto-syncs both (you already have GitHub connected — every save pushes automatically).

## Order of work

1. Write `apps-script/Code.gs` (the backend — most important, deploy this first)
2. `index.html` + `css/app.css` + shell (login, sidebar, router)
3. `js/api.js`, `auth.js`, `store.js`, `format.js`, `airlines.js`, `whatsapp.js`, `pdf.js`
4. Pages in this order: dashboard → customers/suppliers/sub-agents → tickets → payments → refunds → cash-book → reports → staff → settings
5. Final: zip `skybird-html/` to `/mnt/documents/skybird-html.zip` for download

## What I need from you to start

Just **"go"**. I'll build it in one pass. After it's done you:

1. Open `apps-script/Code.gs`, copy into your Apps Script project, redeploy the Web App (same URL).
2. Open `skybird-html/index.html` in a browser (or upload the folder to any static host / GitHub Pages).
3. First load creates the admin user — set your password.

---

Reply **go** to build, or tell me to drop any feature above.
