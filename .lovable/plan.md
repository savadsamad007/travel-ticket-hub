
# Plan — Skybird v3

## 1. Per-staff permissions (checkbox UI)

**DB** (new SQL file `supabase-schema-v3.sql` to paste in SQL Editor):
- Add `permissions jsonb default '{}'::jsonb` to `user_agency`.
- Keys (each `true`/`false`): `tickets`, `refunds`, `payments`, `customers`, `suppliers`, `sub_agents`, `cash_book`, `reports`, `statements`. Admin ignores it (always full).

**Code**:
- `auth.tsx` loads `permissions` into context.
- `staff.tsx`: per-row checkboxes that update `permissions` (live save) + a "Defaults" preset (tickets+customers+payments).
- `_app.tsx`: hide sidebar items the salesman doesn't have.
- Each route file: salesman without permission → `<Navigate to="/dashboard" />`.

## 2. Payment voucher PDF + WhatsApp share

In `src/lib/pdf.ts` add `buildPaymentVoucher({ direction, party, amount, mode, ref, date, agencyProfile })` — A5 layout, agency logo/name/address/VAT, party, amount in words, signature line. "Receipt Voucher" for `in`, "Payment Voucher" for `out`.

In `payments.tsx` table: add **PDF** button (download) + **WhatsApp** button (opens `https://wa.me/<party.phone>?text=<prefilled>`).

## 3. Ticket tax invoice PDF + WhatsApp share

Add `buildTicketInvoice({ ticket, services, buyer, agencyProfile })` — full A4 tax invoice: agency header, invoice no (= ticket no), date, buyer block, line items (ticket + each add-on service), subtotal, VAT 15% breakdown if VAT no. present, total, amount in words, terms.

In `tickets.tsx` row actions: **Invoice** + **WhatsApp**.

## 4. WhatsApp helper

`src/lib/whatsapp.ts` exports `openWhatsApp(phone, text)` — normalises phone (strip non-digits, add country code if missing) and opens `https://wa.me/...?text=...`. Free share-link approach (user's choice).

## 5. Daily report email (11:59 PM)

Requires Lovable Cloud **email infrastructure**. Will run in this order:
1. `email_domain--check_email_domain_status` — if no domain, surface the "Set up email domain" button and pause; resume once domain is configured.
2. `email_domain--setup_email_infra` (creates queues + cron infra).
3. `email_domain--scaffold_transactional_email`.
4. Create template `daily-report.tsx` (totals: tickets count, sales, received, paid, cash in hand, profit).
5. Create server route `/api/public/cron/daily-report` (HMAC-verified) that, for each agency, computes today's totals from Supabase and calls the send-transactional-email path with admin's email and `templateData`.
6. Add a pg_cron job hitting that URL at `59 20 * * *` UTC (= 23:59 Saudi time, UTC+3).

Until the email domain is verified, the report endpoint will exist and be callable manually from Settings ("Send today's report now"), so it's testable immediately.

## 6. Files

**New**: `supabase-schema-v3.sql`, `src/lib/whatsapp.ts`, `src/lib/email-templates/daily-report.tsx`, `src/routes/api/public/cron/daily-report.ts`.

**Edited**: `src/lib/auth.tsx`, `src/lib/pdf.ts`, `src/routes/_app.tsx`, `src/routes/_app/staff.tsx`, `src/routes/_app/payments.tsx`, `src/routes/_app/tickets.tsx`, `src/routes/_app/settings.tsx` (add "Send today's report" button + report recipient email field).

## After you approve

You will need to:
- Run `supabase-schema-v3.sql` once in SQL Editor.
- Click "Set up email domain" when prompted, and add the NS records at your domain provider.
