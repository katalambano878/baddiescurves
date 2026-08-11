# Baddiescurves — Supabase → plain Postgres cutover

**Shape:** A — shimmed `@supabase/supabase-js` → app `/rest/v1`, `/auth/v1`, `/storage/v1` + `DATABASE_URL`  
**Repo:** `katalambano878/baddiescurves` (verify remote)  
**Branch:** `staging/plain-postgres`  
**Coolify staging:** `baddiescurves-staging` (`oyz3y63jq2asmekrlu8v1tr2`)  
**Staging URL:** https://baddiescurves-staging.169-58-8-203.sslip.io  
**Custom domain:** https://baddiecurves.com (also `www`) — attached on Coolify Aug 2026  
**DB:** `fleet-postgres` / `baddiescurves_staging`  

## Plain-PG schema fixes (Aug 2026)

Checkout failed with `null value in column "id" of relation "orders"` until UUID defaults + missing RPC were applied:

```bash
# On big-vps against the live DB:
sudo docker exec -i fleet-postgres psql -U postgres -d baddiescurves_staging \
  -f /path/to/scripts/fix-plain-pg-defaults.sql
```

That script sets `id DEFAULT gen_random_uuid()` on all public UUID PKs and creates `mark_order_paid` (needed for Moolre callback/verify).

Also apply `scripts/fix-plain-pg-more.sql` for:
- `contact_submissions` table
- `support_tickets.ticket_number` sequence default
- `auth.users.id` default
- unique index on `orders.order_number`
- seed `store_modules` rows

### Missing Coolify env (blocks payments / email)

As of Aug 2026 staging container had **no** Moolre / Resend / reCAPTCHA / cron secrets. Set these in Coolify before live payments:

- `MOOLRE_API_USER`, `MOOLRE_API_PUBKEY`, `MOOLRE_ACCOUNT_NUMBER`, `MOOLRE_MERCHANT_EMAIL`, `MOOLRE_CALLBACK_SECRET`
- optional SMS: `MOOLRE_SMS_API_KEY`, `MOOLRE_SMS_SENDER_ID`
- `RESEND_API_KEY` (+ `EMAIL_FROM` / `ADMIN_EMAIL` if used)
- optional: `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY`, `CRON_SECRET`

Moolre account numbers are **per-store** — do not copy another store’s `MOOLRE_ACCOUNT_NUMBER`.

### PayPal (international / USD) + Moolre (Ghana / GHS)

Checkout routes by geo (`country` cookie from middleware geo headers):

| Visitor | Gateway | Currency |
|---------|---------|----------|
| Ghana (`GH`) | Moolre | GHS |
| Everyone else | PayPal Orders v2 | USD |

PayPal env (Coolify):

```
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_MODE=sandbox
PAYPAL_WEBHOOK_ID=
NEXT_PUBLIC_APP_URL=https://baddiecurves.com
```

Webhook URL to register in PayPal developer dashboard:  
`https://baddiecurves.com/api/payment/paypal/webhook`

Both gateways still need Resend (and Moolre SMS if used) for order confirmation.

See also: store hardening playbook in the big-vps workspace (`STORE_HARDENING_PLAYBOOK.md`).

## Env cutover trio (set together in Coolify)

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | `postgresql://…@fleet-postgres:5432/store_baddiescurves` |
| `NEXT_PUBLIC_USE_PLAIN_PG` | `true` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://baddiescurves-staging.169-58-8-203.sslip.io` (app origin, not `*.supabase.co`) |

Also usually required: JWT secrets, `NEXT_PUBLIC_APP_URL`, `STORAGE_ROOT` / `STORAGE_PUBLIC_URL`, Resend + Moolre keys.

## Hardening notes (Jul 2026)

- [x] Phase A: `sw-v2.5-baddies`, `lib/format-money.ts`, `app/error.tsx`, `app/admin/error.tsx`
- [x] Phase B: `images.unoptimized: true`; drop `*.supabase.co` / `via.placeholder.com` remotePatterns
- [x] Money paths → `money()` / `asNumber()` where prices display or export
- [x] Cron payment reminders → `supabaseAdmin`
- [x] Order history: Track / Reorder / Invoice / Help (no coming-soon alerts)

## Verify (staging)

```bash
BASE=https://baddiescurves-staging.169-58-8-203.sslip.io
ssh big-vps "sudo docker ps --format '{{.Image}} {{.Status}}' | grep oyz3y63"
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/"
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/shop"
curl -s "$BASE/service-worker.js" | head -n 3
# expect sw-v2.5-baddies in SW output
```
