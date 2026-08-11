# Freezing and Loading Audit — Baddiescurves

## Pages inspected

- Public store: home, shop, product, cart, checkout, order-success, pay, account, contact
- Admin: layout shell, login, dashboard, orders, products, customers, analytics, POS, inventory, modules, SMS test
- API: payment moolre/paypal, admin dashboard, health/db, rest/auth/storage shims

## Root causes confirmed

1. **Admin layout never cleared loading** on redirect/failure paths → permanent “Loading Admin...”
2. **Login route waited on `getSession`** before rendering children
3. **`Secure` cookies on HTTP** dropped middleware tokens → redirect loops / stuck auth
4. **Dashboard pulled unbounded orders** client-side + heavy recharts sync import
5. **Payment callbacks awaited SMS/email** before acknowledging gateway
6. **No request timeouts** around admin auth/profile/module fetches
7. **Orders admin list unbounded** (now capped at 500 + 15s timeout)

## Fixes applied

| Area | Fix |
| ---- | --- |
| Admin layout | `finally` always clears loading; login bypass; JWT role fast-path; timeout + error UI; cookie helper |
| Login | `setAuthCookies` (Secure only on HTTPS); `router.replace` once |
| Dashboard | `/api/admin/dashboard` with `Promise.allSettled`-style section timeouts; client abort + retry |
| Chart | Dynamic import `RevenueChart` |
| Callbacks | Fire-and-forget notifications after DB success |
| SMS | 12s AbortController timeout |
| Pool | statement/lock/idle-in-tx timeouts |
| Middleware | Early return for `/api/payment/*`, `/api/health`, `/api/cron/*` |
| Orders page | `.limit(500)` + race timeout |

## Remaining risks

- Admin JWT without `app_metadata.role` fails middleware until re-login (expected after cutover)
- Many admin list pages still client-fetch; only dashboard/orders hardened with hard limits
- Deploy required for production to pick up fixes
- Hubtel/Paystack N/A in this codebase
