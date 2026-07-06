
# Offline SQLite + Supabase Sync (Electron Desktop)

Goal: The Windows desktop app keeps working when the internet is down. All writes go into a local SQLite file first, and get pushed to Supabase automatically as soon as the network comes back.

## How it will work (plain language)

1. When you open the desktop app, it opens a SQLite file stored in your Windows user folder (`%APPDATA%/Skybird/skybird.db`). Your data lives there permanently.
2. Every screen reads from SQLite (instant, works offline).
3. Every time you save (new ticket, payment, customer…), the app:
   - writes to SQLite immediately, and
   - queues the change in an `outbox` table.
4. A background worker checks the internet every few seconds. When online, it drains the outbox to Supabase, then pulls any changes other users made in Supabase back into SQLite.
5. A small status dot in the corner shows: **Online / Syncing / Offline (N pending)**.

## Technical design

**SQLite engine:** `better-sqlite3` (synchronous, native to Electron main process). Renderer talks to it through Electron IPC (`preload.cjs` exposes a `window.skybird` API).

**Schema:** mirrors the 8 Supabase tables already synced by `mssql-bridge/src/tables.js` (customers, suppliers, sub_agents, tickets, ticket_services, payments, refunds, agency_profile) + local `outbox` and `sync_state` tables.

**Data layer switch:** add `src/lib/db.ts` that auto-detects Electron (`window.skybird` present) vs browser. In Electron it calls the local API; in the browser it falls back to today's Supabase client. Zero changes to page components — they keep using the same helpers in `src/lib/data.ts`.

**Sync worker** (Electron main process):
- Push: for each row in `outbox`, upsert/delete against Supabase; on success delete the outbox row.
- Pull: for each table, `select * where updated_at > last_pulled_at` and merge into SQLite (last-write-wins by `updated_at`).
- Runs every 10s when online, and once immediately on app start.
- Conflict rule: server row wins if its `updated_at` is newer; otherwise local outbox row wins.

**Auth:** sign-in still happens against Supabase (needs internet the first time). The session token is cached; while offline the app trusts the last known `agency_owner` / `role` and lets you keep working.

## Deliverable

Repackaged `Skybird-Setup-Windows.zip` on `/mnt/documents/` containing the updated Electron app with SQLite + sync built in. Same install steps as before (unzip, run `Skybird.exe`).

## Out of scope (unless you ask)

- Encrypting the local DB file.
- Sync for the browser/web version (browsers can't hold a real SQLite file reliably; keep them online-only).
- Multi-device merge of edits made offline on two PCs at the same time to the same row — last write wins.

Reply "go" and I'll build it.
