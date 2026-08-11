BEGIN;

INSERT INTO orders (
  order_number, email, status, payment_status, currency,
  subtotal, tax_total, shipping_total, discount_total, total,
  shipping_address, billing_address, metadata
) VALUES (
  'TEST-MARK-PAID', 'paytest@example.com', 'pending', 'pending', 'USD',
  10, 0, 0, 0, 10,
  '{"firstName":"Pay"}'::jsonb,
  '{"firstName":"Pay"}'::jsonb,
  '{}'::jsonb
);

SELECT public.mark_order_paid('TEST-MARK-PAID', 'moolre-test-ref') AS result;

SELECT order_number, status, payment_status,
       metadata->>'moolre_reference' AS mref,
       metadata->>'stock_reduced' AS stock
FROM orders WHERE order_number = 'TEST-MARK-PAID';

ROLLBACK;

SELECT public.upsert_customer_from_order(
  'paytest@example.com',
  '0240000000',
  'Pay Test',
  'Pay',
  'Test',
  NULL,
  '{"city":"Accra"}'::jsonb
) AS customer_id;

DELETE FROM customers WHERE email = 'paytest@example.com';
