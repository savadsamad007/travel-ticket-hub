# Skybird MSSQL ↔ Supabase Bridge

A small Node.js agent that runs on **your Windows 10 PC** and keeps your
local SQL Server (`skybird` database) in sync with the cloud Supabase DB
used by the Skybird app. Two-way sync, polling-based, fully outbound —
**no port forwarding, no public IP**.

## Why a local bridge?

Your MSSQL is reachable only on your Tailscale network (`*.ts.net`).
The cloud cannot dial in. So the bridge runs *next to* MSSQL on your PC
and reaches OUT to Supabase over HTTPS.

```
   [Your Win10 PC]                              [Cloud]
   ┌──────────────┐    Tailscale (LAN only)     ┌─────────────┐
   │  MSSQL 1433  │◀───────────────────────────▶│             │
   │              │                              │             │
   │  bridge.exe  │──── HTTPS (outbound) ───────▶│  Supabase   │
   └──────────────┘                              └─────────────┘
```

## One-time setup

### 1. Install Node.js
Download LTS from <https://nodejs.org> and install (default options).
Open **PowerShell** and confirm:
```powershell
node --version    # should print v20.x or v22.x
```

### 2. Download this folder
Get `mssql-bridge/` onto your PC (zip from GitHub, or `git pull`).

### 3. Install dependencies
```powershell
cd C:\path\to\mssql-bridge
npm install
```

### 4. Create `.env`
Copy `.env.example` to `.env` and fill in:
- **MSSQL\_\*** — your local DB (use a dedicated low-privilege user, NOT `sa`).
- **SUPABASE_SERVICE_ROLE_KEY** — get from Supabase Dashboard → Project
  Settings → API → `service_role`. Treat like a password.

### 5. (Optional) Pick direction
In `.env`:
- `SYNC_DIRECTION=two-way` (default) — changes flow both ways
- `SYNC_DIRECTION=push` — only MSSQL → cloud
- `SYNC_DIRECTION=pull` — only cloud → MSSQL

## Run

**One-shot test:**
```powershell
npm run once
```
Watch the output. First run will auto-create tables in MSSQL and copy all
existing rows from Supabase down to your PC.

**Continuous (every 60s):**
```powershell
npm start
```
Leave the window open. To stop: `Ctrl+C`.

## Run as a Windows Service (auto-start at boot)

After confirming `npm start` works:
```powershell
npm install -g node-windows
node -e "const s=require('node-windows').Service; const svc=new s({name:'Skybird Bridge', script: require('path').resolve('src/index.js')}); svc.on('install',()=>svc.start()); svc.install();"
```
The service will start on every Windows boot. Manage from **services.msc**
(name: *Skybird Bridge*).

## What gets synced

The tables listed in `src/tables.js`:
`customers, suppliers, sub_agents, tickets, ticket_services, payments,
refunds, agency_profile`.

Each row needs an `id` column and a `created_at` (or `updated_at`)
timestamp — your Supabase schema already has both.

## How conflict is handled

Last-write-wins per row, keyed by `id`. The bridge tracks the most
recent timestamp it has pulled / pushed per table in a `sync_state`
table inside MSSQL, so a restart picks up exactly where it left off.

## Security checklist

- [ ] Rotate the SQL `sa` password you pasted in chat — **do it now**.
- [ ] Create a dedicated SQL login (`skybird_bridge`) with access only
      to the `skybird` DB, and use it in `.env`.
- [ ] `.env` is in `.gitignore` — never commit it.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` lives **only** in `.env` on your PC.
- [ ] If you publish the React/HTML app, keep the service-role key out
      of the browser — it stays here, on the bridge.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ELOGIN` / login failed | Wrong user/password in `.env`, or SQL Server isn't in **Mixed Mode** auth. Enable in SSMS → Server → Properties → Security. |
| `ESOCKET` / connect ETIMEDOUT | Tailscale not running, or SQL Server TCP/IP disabled. Open **SQL Server Configuration Manager** → Protocols → enable TCP/IP, restart service. |
| `Could not find stored procedure` | The table name in `tables.js` doesn't match Supabase. Names are case-sensitive. |
| Bridge runs but nothing copies | Check the timestamp column name — it must match the `watermark` value in `tables.js`. |

## Files

```
mssql-bridge/
├── package.json
├── .env.example          ← copy to .env
├── .gitignore
├── README.md             ← this file
└── src/
    ├── index.js          ← main loop
    ├── tables.js         ← which tables to sync
    ├── mssql.js          ← local SQL Server client
    └── supabase.js       ← cloud client
```
