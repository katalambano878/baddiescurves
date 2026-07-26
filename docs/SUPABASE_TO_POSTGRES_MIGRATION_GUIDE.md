# Baddiescurves — Supabase → plain Postgres cutover

**Shape:** A — shimmed `@supabase/supabase-js` → app `/rest/v1`, `/auth/v1`, `/storage/v1` + `DATABASE_URL`  
**Repo:** `katalambano878/baddiescurves` (verify remote)  
**Branch:** `staging/plain-postgres`  
**Coolify staging:** `baddiescurves-staging` (`oyz3y63jq2asmekrlu8v1tr2`)  
**Staging URL:** https://baddiescurves-staging.169-58-8-203.sslip.io  
**DB:** `fleet-postgres` / `store_baddiescurves` (provision with `sudo fleet db provision baddiescurves` if missing)

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
