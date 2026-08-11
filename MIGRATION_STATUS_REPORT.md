# Migration Status Report — Baddiescurves

## Tooling

| Item | Value |
| ---- | ----- |
| Primary migrations | `supabase/migrations/*.sql` |
| Apply (staging) | `psql` via `fleet-postgres` docker exec |
| App script | `npm run db:migrate` → `scripts/run-migration.mjs` (legacy dual-mode) |
| Ledger table | `public.schema_migrations` (added 2026-08-12) |

## History

| Version | Name | Repo | Staging DB |
| ------- | ---- | ---- | ---------- |
| 20260209000000 | complete_schema | yes | recorded |
| 20260218000000 | allow_null_order_items_product_fks | yes | recorded |
| 20260325000000 | add_ghs_pricing | yes | recorded |
| 20260812000000 | plain_pg_integrity_hardening | yes | **applied** |

Prior cutover fixes (also applied historically, now folded into hardening where relevant):

- `scripts/fix-plain-pg-defaults.sql` — UUID defaults + text-safe `mark_order_paid`
- `scripts/fix-plain-pg-more.sql` — contact_submissions, order_number unique, store_modules seed

## Corrective migration (20260812000000)

**Destructive ops:** none (no drops of tables/data).  
**Adds:** tables, FKs, indexes, checks, triggers, RPC replacements, ledger rows.

### Rollback notes

1. Restore from `/data/fleet/backups/baddiescurves/baddiescurves_staging_.dump` (`pg_restore`).
2. Or reverse selectively:
   - `DROP TABLE payment_events, notification_events, schema_migrations;`
   - Drop added FKs/indexes/checks by name
   - Re-apply previous `mark_order_paid` from `scripts/fix-plain-pg-defaults.sql`

## Deployment order (when approved)

1. Backup DB  
2. Apply `20260812000000_plain_pg_integrity_hardening.sql`  
3. Deploy app code (REST ACL + payment-events wiring)  
4. Hit `/api/health/db?secret=…`  
5. Smoke checkout + callback paths  

**This session did not deploy the app.**
