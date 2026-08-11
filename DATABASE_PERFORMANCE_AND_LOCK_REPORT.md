# Database Performance and Lock Report — Baddiescurves

## Connection architecture

- Single shared `pg.Pool` in `lib/db/pool.ts`
- Used by `lib/db/supabase-compat.ts` (in-process admin) and `/rest|/auth|/storage` routes
- Default `PG_POOL_MAX=10`

## Timeouts (per connection)

| Setting | Default |
| ------- | ------- |
| `connectionTimeoutMillis` | 10000 |
| `statement_timeout` | 30000 |
| `lock_timeout` | 10000 |
| `idle_in_transaction_session_timeout` | 30000 |

## Indexes (already applied in integrity migration)

- `orders(user_id)`, `orders(lower(email))`, `orders(payment_status, created_at DESC)`
- `order_items(order_id)`, `customers(lower(email))`, payment_events keys

## Slow / risky query patterns

| Route | Pattern | Repair |
| ----- | ------- | ------ |
| Admin dashboard (old) | SELECT all orders client-side | Server API limit 2000 + section timeout 8s |
| Admin orders | Unbounded select + embeds | Limit 500 + 15s client race |
| Callbacks | SMS inside request | Async after response |

## Monitoring

Run on staging:

```bash
scp scripts/db-monitor-active.sql big-vps:/tmp/
ssh big-vps 'sudo docker exec -i fleet-postgres psql -U postgres -d baddiescurves_staging -f /tmp/db-monitor-active.sql'
```

Shows active/idle/idle-in-tx, blocked queries, long runners (no auto-kill).

## Before / after

Staging row counts are tiny; qualitative improvement:

- Admin shell cannot hang forever (12s auth timeout + finally)
- Dashboard sections fail independently
- Pool connections auto-kill idle transactions after 30s
