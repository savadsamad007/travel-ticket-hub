# Skybird — HTML / Vanilla JS edition

A single-folder static web app for your travel agency. **No build step, no npm.** All data lives in your Google Sheet via your Apps Script Web App.

## Deploy

1. **Apps Script backend**
   - Open https://script.google.com → New project
   - Replace `Code.gs` contents with `apps-script/Code.gs` from this folder
   - Save → **Deploy → Manage deployments → edit** existing Web App
   - Execute as: **Me**, Who has access: **Anyone**
   - The Web App URL must match the one in `js/api.js` (`WEB_APP_URL`). It already does.
   - First run: in the editor, run `doPost` once → grant permissions when prompted.

2. **App (static files)**
   - Either open `index.html` locally in a browser, OR
   - Upload the whole `skybird-html/` folder to any static host:
     - GitHub Pages
     - Netlify (drag & drop)
     - Cloudflare Pages
     - Google Drive (publish folder)
     - Your own server

3. **First account**
   - Open the app → Sign up tab → create your account
   - The **first** account automatically becomes admin.

## Daily 23:59 auto email report

In the Apps Script editor:
- **Triggers → + Add Trigger**
- Function: `sendDailyReport`
- Event source: Time-driven
- Type: Day timer → **11pm to midnight**
- The report goes to the email set in **Settings → Daily report email** (falls back to agency email).

## Features

- Login / register, first user = admin
- Dashboard with stats (profit hidden for salesmen)
- Tickets with airline autocomplete (type `SV` → Saudia), auto `/` every 3 chars in route (`RUH/JED/DXB`), quick-add customer button
- Customers / Suppliers / Sub-agents
- Payments (Receive / Pay) — voucher PDF + WhatsApp share
- Refunds
- Cash book with cash-in-hand
- Reports (date range)
- Staff with per-user permission checkboxes (salesman never sees profit / delete)
- Settings — agency name, VAT, logo, report email
- Tax invoice PDF (A4, 15% VAT auto when VAT number set)
- Payment voucher PDF (A5, amount-in-words)
- WhatsApp share buttons everywhere
