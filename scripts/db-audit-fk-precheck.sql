-- Pre-check before adding FKs (read-only)

SELECT 'order_items_bad_order_id' AS issue, count(*) FROM order_items oi
LEFT JOIN orders o ON o.id = oi.order_id WHERE o.id IS NULL;

SELECT 'order_items_bad_product_id' AS issue, count(*) FROM order_items oi
LEFT JOIN products p ON p.id = oi.product_id
WHERE oi.product_id IS NOT NULL AND p.id IS NULL;

SELECT 'order_items_bad_variant_id' AS issue, count(*) FROM order_items oi
LEFT JOIN product_variants pv ON pv.id = oi.variant_id
WHERE oi.variant_id IS NOT NULL AND pv.id IS NULL;

SELECT 'orders_bad_user_id' AS issue, count(*) FROM orders o
LEFT JOIN auth.users u ON u.id = o.user_id
WHERE o.user_id IS NOT NULL AND u.id IS NULL;

SELECT 'profiles_bad_user' AS issue, count(*) FROM profiles p
LEFT JOIN auth.users u ON u.id = p.id WHERE u.id IS NULL;

SELECT 'customers_bad_user' AS issue, count(*) FROM customers c
LEFT JOIN auth.users u ON u.id = c.user_id
WHERE c.user_id IS NOT NULL AND u.id IS NULL;

SELECT 'reviews_bad_product' AS issue, count(*) FROM reviews r
LEFT JOIN products p ON p.id = r.product_id WHERE p.id IS NULL;

SELECT 'cart_items_bad_product' AS issue, count(*) FROM cart_items c
LEFT JOIN products p ON p.id = c.product_id
WHERE c.product_id IS NOT NULL AND p.id IS NULL;

SELECT 'wishlist_bad_product' AS issue, count(*) FROM wishlist_items w
LEFT JOIN products p ON p.id = w.product_id
WHERE w.product_id IS NOT NULL AND p.id IS NULL;

SELECT 'customers_dup_email' AS issue, count(*) FROM (
  SELECT lower(email) FROM customers GROUP BY lower(email) HAVING count(*) > 1
) d;

SELECT 'customers_email_null' AS issue, count(*) FROM customers WHERE email IS NULL OR email = '';

-- Index usage candidates
SELECT indexrelname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC, indexrelname
LIMIT 40;

-- mark_order_paid definition excerpt
SELECT pg_get_functiondef('public.mark_order_paid(text,text)'::regprocedure);
