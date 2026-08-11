# Database Recovery Guide — Baddiescurves Staging

## Confirm target

```bash
ssh big-vps 'sudo docker exec fleet-postgres psql -U postgres -c "\l"' | grep baddiescurves
```

Expected DB name: **`baddiescurves_staging`** (not `store_baddiescurves`).

## Backup

Custom format dump (preferred):

```bash
ssh big-vps 'sudo docker exec fleet-postgres pg_dump -U postgres -d baddiescurves_staging -Fc -f /tmp/baddiescurves_staging.dump'
ssh big-vps 'sudo mkdir -p /data/fleet/backups/baddiescurves && sudo docker cp fleet-postgres:/tmp/baddiescurves_staging.dump /data/fleet/backups/baddiescurves/'
```

Current audit backup path: `/data/fleet/backups/baddiescurves/baddiescurves_staging_.dump`

## Restore

```bash
# WARNING: replaces staging DB contents
ssh big-vps 'sudo docker exec -i fleet-postgres pg_restore -U postgres -d baddiescurves_staging --clean --if-exists /tmp/baddiescurves_staging.dump'
```

Copy dump into container first if needed:

```bash
ssh big-vps 'sudo docker cp /data/fleet/backups/baddiescurves/baddiescurves_staging_.dump fleet-postgres:/tmp/baddiescurves_staging.dump'
```

## Migration rollback

1. Restore dump above, **or**
2. Re-apply prior function definitions from `scripts/fix-plain-pg-defaults.sql` and drop new objects:

```sql
DROP TABLE IF EXISTS public.payment_events CASCADE;
DROP TABLE IF EXISTS public.notification_events CASCADE;
-- keep schema_migrations or delete version 20260812000000 row
```

## Data-repair rollback

Prefer transactional scripts with `BEGIN`/`ROLLBACK` dry runs (see `scripts/verify-plain-pg-checkout.sql`).

## Verify after restore

```bash
sudo docker exec fleet-postgres psql -U postgres -d baddiescurves_staging -f /tmp/db-schema-test.sql
curl -sS "https://baddiecurves.com/api/health/db"
```

Preserve payment/order rows: never `--clean` restore against a DB you have not confirmed is staging.
