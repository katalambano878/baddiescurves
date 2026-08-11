-- Safe staging monitor: active / blocked / idle-in-transaction / connection usage
-- Does not terminate processes.

\echo '=== CONNECTION SUMMARY ==='
SELECT
  count(*) FILTER (WHERE state = 'active') AS active,
  count(*) FILTER (WHERE state = 'idle') AS idle,
  count(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_tx,
  count(*) AS total,
  (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_connections
FROM pg_stat_activity
WHERE datname = current_database();

\echo '=== LONG RUNNING / ACTIVE (safe summary) ==='
SELECT pid,
       usename,
       state,
       wait_event_type,
       wait_event,
       now() - query_start AS duration,
       left(regexp_replace(query, '\s+', ' ', 'g'), 120) AS query_summary
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid()
  AND state <> 'idle'
ORDER BY query_start NULLS LAST
LIMIT 30;

\echo '=== BLOCKED QUERIES ==='
SELECT
  blocked.pid AS blocked_pid,
  left(regexp_replace(blocked.query, '\s+', ' ', 'g'), 100) AS blocked_query,
  blocking.pid AS blocking_pid,
  left(regexp_replace(blocking.query, '\s+', ' ', 'g'), 100) AS blocking_query,
  now() - blocked.query_start AS blocked_for
FROM pg_stat_activity blocked
JOIN pg_locks bl ON bl.pid = blocked.pid AND NOT bl.granted
JOIN pg_locks kl ON kl.locktype = bl.locktype
  AND kl.database IS NOT DISTINCT FROM bl.database
  AND kl.relation IS NOT DISTINCT FROM bl.relation
  AND kl.page IS NOT DISTINCT FROM bl.page
  AND kl.tuple IS NOT DISTINCT FROM bl.tuple
  AND kl.virtualxid IS NOT DISTINCT FROM bl.virtualxid
  AND kl.transactionid IS NOT DISTINCT FROM bl.transactionid
  AND kl.classid IS NOT DISTINCT FROM bl.classid
  AND kl.objid IS NOT DISTINCT FROM bl.objid
  AND kl.objsubid IS NOT DISTINCT FROM bl.objsubid
  AND kl.granted
JOIN pg_stat_activity blocking ON blocking.pid = kl.pid
WHERE blocked.datname = current_database();

\echo '=== IDLE IN TRANSACTION ==='
SELECT pid, usename, now() - xact_start AS tx_age,
       left(regexp_replace(query, '\s+', ' ', 'g'), 120) AS last_query
FROM pg_stat_activity
WHERE datname = current_database()
  AND state = 'idle in transaction'
ORDER BY xact_start NULLS LAST;
