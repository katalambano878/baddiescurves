# Freezing and Loading Baseline — Baddiescurves

**Date:** 2026-08-12  
**Branch:** `staging/plain-postgres`  
**DB:** `baddiescurves_staging` (fleet-postgres)  
**Note:** Local `DATABASE_URL` empty; production app not redeployed in this session.

## Observed failure modes (pre-fix)

| Symptom | Evidence |
| ------- | -------- |
| Admin stuck on “Loading Admin...” | `app/admin/layout.tsx` returned early on missing session/profile **without** `setIsLoading(false)` |
| Login page blocked by spinner | Layout awaited `getSession()` before login short-circuit |
| Cookie/session mismatch | Auth cookies always set `Secure` (fails on HTTP staging/local) |
| Dashboard slow/fragile | Client loaded **all** orders via supabase-js; recharts in main bundle |
| Callback latency | Moolre/PayPal awaited SMS/email before HTTP response |
| Unbounded admin orders list | `.from('orders').select(...).order(...)` with no limit |

## Baseline measurements (staging data volume)

| Metric | Value |
| ------ | ----- |
| Orders in DB | 2 |
| Products | 49 |
| Admin shell (expected after fix) | Auth ≤12s timeout; shell renders or error UI |
| Dashboard API target | ≤20s client timeout; sections ≤8s each |
| Pool | max 10; statement 30s; lock 10s; idle-in-tx 30s |

## Console / server patterns to watch after deploy

- `[AdminLayout] auth error: ... timed out`
- `[admin/dashboard] <section> failed:`
- `[Callback] Notification failed:` (async; must not delay 200 OK)
