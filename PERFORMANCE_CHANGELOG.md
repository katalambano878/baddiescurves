# Performance Changelog — Freezing / Admin Loading (2026-08-12)

## Files changed

- `app/admin/layout.tsx` — auth finally/timeouts/error UI/login bypass
- `app/admin/login/page.tsx` — cookie helper, single replace
- `app/admin/page.tsx` — dashboard API client + abort/retry
- `app/admin/orders/page.tsx` — limit 500 + timeout
- `app/api/admin/dashboard/route.ts` — new aggregated API
- `components/admin/RevenueChart.tsx` — lazy chart
- `lib/auth-cookies.ts` — HTTPS-aware cookies
- `lib/with-timeout.ts` — timeout + fetchJson helpers
- `lib/db/pool.ts` — lock + idle-in-tx timeouts
- `lib/notifications.ts` — SMS 12s timeout
- `lib/paypal-fulfill.ts` / moolre callback+verify — async notify
- `middleware.ts` — payment/health/cron fast-path
- Docs: `FREEZING_*`, `ADMIN_DASHBOARD_*`, `EXTERNAL_*`, `DATABASE_PERFORMANCE_AND_LOCK_*`, `WEBSITE_STABILITY_CHECKLIST.md`
- `scripts/db-monitor-active.sql`

## Indexes

None added in this pass (prior integrity migration already added order/payment indexes).

## Timeouts added

- Admin auth 12s
- Dashboard sections 8s / client 20s
- Orders list 15s
- SMS 12s
- PG statement 30s, lock 10s, idle-in-tx 30s

## Error boundaries

- Admin layout auth error panel
- Dashboard full-fail + degraded section banner
- Existing `app/admin/error.tsx` retained

## Before → after (qualitative)

| Metric | Before | After |
| ------ | ------ | ----- |
| Admin shell on auth failure | Infinite spinner | Error UI ≤12s |
| Login page | Could wait on getSession | Immediate |
| Dashboard data | All orders in browser | Bounded server sections |
| Callback ack | Waited on SMS/email | Immediate after DB |
| Cookie on HTTP | Broken (`Secure`) | Works |
