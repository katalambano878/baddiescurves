# Database Audit and Repair Report — Baddiescurves

**Date:** 2026-08-12  
**Target database:** `baddiescurves_staging` on VPS `fleet-postgres` (host confirmed via fleet inventory; credentials not logged)  
**PostgreSQL:** 16.14  
**Deploy:** Not performed (per request)

---

## Baseline (before repair)

| Check | Result |
| ----- | ------ |
| Connection | Healthy |
| Public tables | 31 |
| Auth tables | `auth.users` |
| UUID `id` defaults | Present (0 missing) |
| Critical RPCs | Present (`mark_order_paid`, `upsert_customer_from_order`, `update_customer_stats`) |
| Foreign keys | **Only 6** (severe under-constraint) |
| Triggers | **0** (updated_at / profile / rating triggers missing) |
| RLS | Disabled on all public tables (expected for plain PG) |
| Payment event ledger | Missing |
| Notification idempotency | Missing |
| `/rest/v1` authorization | **Open** (service-style pool; no app ACL) |
| Data integrity (orders/items/users) | Clean (0 orphans/duplicates in staging sample) |
| Local `.env.local` `DATABASE_URL` | Empty (local app cannot hit DB without tunnel) |

Backup created: `/data/fleet/backups/baddiescurves/baddiescurves_staging_.dump`

---

## Architecture

```
Browser supabase-js → NEXT_PUBLIC_SUPABASE_URL (app origin)
  → /rest/v1/*   (pg compat + NEW ACL)
  → /auth/v1/*   (lib/db/auth.ts)
  → /storage/v1/* (disk storage)

Server supabaseAdmin → in-process lib/db/supabase-compat.ts → pg Pool (DATABASE_URL)
```

- **ORM:** none  
- **Library:** `pg` + custom PostgREST/GoTrue/Storage shims  
- **Migration history:** SQL files under `supabase/migrations/` + new `public.schema_migrations` ledger

---

## Repairs completed

1. Applied `20260812000000_plain_pg_integrity_hardening.sql` to staging.
2. Added FKs for orders/items/profiles/customers/reviews/cart/wishlist/returns/support.
3. Restored updated_at, auth profile, and review-rating triggers.
4. Added indexes for orders/customers/profiles/order_items hot paths.
5. Added check constraints for money/qty/currency/payment_status.
6. Hardened `mark_order_paid` (row lock + idempotent stock).
7. Created `payment_events` + `claim_payment_event` / `complete_payment_event`.
8. Created `notification_events` for SMS/email dedupe.
9. Implemented `/rest/v1` + RPC application ACL (`lib/db/rest-acl.ts`).
10. Wired payment event claiming into Moolre callback/verify + PayPal fulfill.
11. Wired notification idempotency into order confirmation.
12. Added `/api/health/db` and schema test script.
13. Pool: connect timeout + statement timeout.

---

## Schema audit summary

| Class | Count / notes |
| ----- | ------------- |
| Total public tables | 33 (+ `payment_events`, `notification_events`; + ledger) |
| Healthy / repaired | Core commerce + auth path |
| Missing tables created | `payment_events`, `notification_events`, `schema_migrations` |
| Obsolete | None deleted (CMS/support/blog retained; unused but schema-complete) |
| Manual review | Unused feature tables (blog/support/returns) — keep until product confirms |

---

## Remaining risks (non-blocking for staging)

- Local `DATABASE_URL` empty — set tunnel URL for local e2e.
- Hubtel/Paystack not implemented in this store (Moolre + PayPal only).
- Guest order lookup by `order_number` remains allowed (required for order-success UX); order numbers must stay unguessable.
- JWT role changes require re-login (role baked into access token).
- `scripts/create-admin-user.mjs` still assumes hosted Supabase Admin API.

---

## Validation

- `verify-plain-pg-checkout.sql` — PASS (rolled back)
- `db-schema-test.sql` — PASS (claim first=true, second=false)
- `tsc --noEmit` — PASS
- Production build — see session log
- Deploy — **not run**
