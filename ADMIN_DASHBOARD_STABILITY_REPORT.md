# Admin Dashboard Stability Report — Baddiescurves

## Shell (`app/admin/layout.tsx`)

| Concern | Status |
| ------- | ------ |
| Loading cleanup | Always via `finally` |
| Timeout | 12s on session/profile |
| Error UI | Retry + back to login |
| Login page | Renders immediately (no auth wait) |
| Module menu fetch | Non-blocking; 8s timeout |

## Dashboard sections (`/api/admin/dashboard`)

| Section | Query | Timeout | Independent failure |
| ------- | ----- | ------- | ------------------- |
| orders_stats | last 2000 orders (totals/chart) | 8s | yes |
| recent_orders | paid orders limit 5 | 8s | yes |
| low_stock | products qty &lt; 10 limit 5 | 8s | yes |
| top_products | products + images limit 4 | 8s | yes |
| customers_count | count head | 8s | yes |

Client: 20s overall timeout, AbortController on unmount, Refresh + Retry.

Chart: lazy-loaded (`components/admin/RevenueChart.tsx`).

## Auth for dashboard API

`verifyAuth(req, { requireAdmin: true })` — Bearer JWT from browser session.

## Test checklist (manual after deploy)

1. Login → single redirect to `/admin`
2. Shell appears or error within 12s
3. Dashboard stats render; failed section shows amber banner, not blank forever
4. Refresh button works
5. Navigate Orders / Products / back — no permanent spinner
6. Logout clears cookies
