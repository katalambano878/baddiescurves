-- Baddiescurves staging DB introspection (safe, read-only)

\echo '=== VERSION ==='
SELECT version();

\echo '=== SCHEMAS ==='
SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY 1;

\echo '=== EXTENSIONS ==='
SELECT extname, extversion FROM pg_extension ORDER BY 1;

\echo '=== PUBLIC TABLES + ROW COUNTS ==='
SELECT c.relname AS table_name,
       c.reltuples::bigint AS est_rows,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

\echo '=== AUTH TABLES ==='
SELECT c.relname AS table_name,
       c.reltuples::bigint AS est_rows
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'auth' AND c.relkind = 'r'
ORDER BY c.relname;

\echo '=== COLUMNS (public) ==='
SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

\echo '=== COLUMNS (auth.users) ==='
SELECT column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'auth' AND table_name = 'users'
ORDER BY ordinal_position;

\echo '=== PRIMARY KEYS ==='
SELECT tc.table_schema, tc.table_name, kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_schema IN ('public','auth')
ORDER BY 1,2,3;

\echo '=== FOREIGN KEYS ==='
SELECT
  tc.table_schema, tc.table_name, kcu.column_name,
  ccu.table_schema AS foreign_table_schema,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.update_rule, rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema IN ('public','auth')
ORDER BY 1,2,3;

\echo '=== UNIQUE CONSTRAINTS / INDEXES ==='
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname IN ('public','auth')
ORDER BY 1,2,3;

\echo '=== CHECK CONSTRAINTS ==='
SELECT n.nspname, c.relname, con.conname, pg_get_constraintdef(con.oid)
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE con.contype = 'c' AND n.nspname IN ('public','auth')
ORDER BY 1,2,3;

\echo '=== ENUMS ==='
SELECT t.typname, e.enumlabel, e.enumsortorder
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
ORDER BY 1,3;

\echo '=== FUNCTIONS (public) ==='
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END AS volatility
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY 1,2;

\echo '=== TRIGGERS ==='
SELECT event_object_schema, event_object_table, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE event_object_schema IN ('public','auth')
ORDER BY 1,2,3;

\echo '=== RLS ENABLED? ==='
SELECT n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY 2;

\echo '=== CRITICAL ORDERS COLUMNS ==='
SELECT column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='orders'
ORDER BY ordinal_position;

\echo '=== UUID ID DEFAULTS MISSING ==='
SELECT c.table_name
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema AND t.table_name = c.table_name
WHERE c.table_schema = 'public'
  AND c.column_name = 'id'
  AND c.is_nullable = 'NO'
  AND c.column_default IS NULL
  AND c.data_type = 'uuid'
  AND t.table_type = 'BASE TABLE'
ORDER BY 1;

\echo '=== EXACT ROW COUNTS (active tables) ==='
SELECT 'orders' AS t, count(*) FROM orders
UNION ALL SELECT 'order_items', count(*) FROM order_items
UNION ALL SELECT 'products', count(*) FROM products
UNION ALL SELECT 'categories', count(*) FROM categories
UNION ALL SELECT 'profiles', count(*) FROM profiles
UNION ALL SELECT 'customers', count(*) FROM customers
UNION ALL SELECT 'reviews', count(*) FROM reviews
UNION ALL SELECT 'coupons', count(*) FROM coupons
UNION ALL SELECT 'contact_submissions', count(*) FROM contact_submissions
UNION ALL SELECT 'store_modules', count(*) FROM store_modules
UNION ALL SELECT 'product_variants', count(*) FROM product_variants
UNION ALL SELECT 'product_images', count(*) FROM product_images
UNION ALL SELECT 'banners', count(*) FROM banners
UNION ALL SELECT 'auth.users', count(*) FROM auth.users;

\echo '=== DATA INTEGRITY CHECKS ==='
-- Orphan order_items
SELECT 'orphan_order_items' AS issue, count(*) FROM order_items oi
LEFT JOIN orders o ON o.id = oi.order_id WHERE o.id IS NULL;

-- Orders paid without paid status consistency
SELECT 'paid_status_mismatch' AS issue, count(*) FROM orders
WHERE payment_status = 'paid' AND status = 'cancelled';

-- Duplicate order numbers
SELECT 'duplicate_order_numbers' AS issue, count(*) FROM (
  SELECT order_number FROM orders GROUP BY order_number HAVING count(*) > 1
) d;

-- Duplicate profile emails
SELECT 'duplicate_profile_emails' AS issue, count(*) FROM (
  SELECT lower(email) FROM profiles WHERE email IS NOT NULL GROUP BY lower(email) HAVING count(*) > 1
) d;

-- Profiles without auth.users
SELECT 'orphan_profiles' AS issue, count(*) FROM profiles p
LEFT JOIN auth.users u ON u.id = p.id WHERE u.id IS NULL;

-- Users without profiles
SELECT 'users_without_profiles' AS issue, count(*) FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id WHERE p.id IS NULL AND u.deleted_at IS NULL;

-- Invalid payment amounts
SELECT 'invalid_order_totals' AS issue, count(*) FROM orders WHERE total IS NULL OR total < 0;

-- Multiple paid? (same order_number)
SELECT 'orders_null_order_number' AS issue, count(*) FROM orders WHERE order_number IS NULL OR order_number = '';

\echo '=== DISTINCT ORDER STATUSES ==='
SELECT status, payment_status, count(*) FROM orders GROUP BY 1,2 ORDER BY 3 DESC;

\echo '=== PAYMENT METADATA KEYS SAMPLE ==='
SELECT order_number, payment_method, payment_provider, payment_status, currency,
       metadata ? 'moolre_reference' AS has_moolre,
       metadata ? 'paypal_order_id' AS has_paypal,
       metadata ? 'stock_reduced' AS stock_reduced
FROM orders
ORDER BY created_at DESC NULLS LAST
LIMIT 20;

\echo '=== RPC EXISTENCE ==='
SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('mark_order_paid','upsert_customer_from_order','update_customer_stats','reduce_stock_on_order','handle_new_user','is_admin_or_staff')
ORDER BY 1,2;
