# Database Performance Report — Baddiescurves

## Environment

- Postgres 16.14 on `fleet-postgres` (same VPS as Coolify app)
- Pool: `lib/db/pool.ts`, default `max=10`
- New: `connectionTimeoutMillis=10000`, `statement_timeout=30000ms`

## Findings

| Issue | Severity | Repair |
| ----- | -------- | ------ |
| Missing indexes on `orders(user_id)`, email, payment_status+created | High for account/admin | Added |
| Missing `order_items(order_id)` index | High for embeds | Added |
| No statement timeout | Medium (freeze risk) | Added |
| REST open scans of private tables | High (security + load) | ACL blocks anon list |
| N+1 risk in notifications | Low | Uses single order_items select |
| Unused feature tables empty | Info | No action |

## Before / after (staging)

Staging data volume is small (49 products, 2 orders). Absolute timings are not representative of production load; index additions are prophylactic based on query patterns:

- Account order history: `orders` filtered by `user_id` + `created_at`
- Admin order lists: `payment_status` / `status` + `created_at`
- Checkout embeds: `order_items` by `order_id`
- Payment callbacks: `orders` by `order_number` (unique index already present)

## Recommendations

1. Keep app and DB co-located (already true on big-vps).
2. Monitor `/api/health/db` pool waitingCount under load.
3. If catalog grows large, add covering indexes for storefront filters (category+status+featured) — `idx_products_*` already exist.
4. Avoid raising `PG_POOL_MAX` above Postgres `max_connections` budget across all Coolify apps.
