-- Fix plain-Postgres cutover gaps for baddiescurves
-- Safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- UUID id defaults (Supabase often relied on gen_random_uuid via table defaults)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
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
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN id SET DEFAULT gen_random_uuid()', r.table_name);
    RAISE NOTICE 'set default on %', r.table_name;
  END LOOP;
END $$;

-- Payment confirmation RPC used by Moolre callback/verify + POS
-- status/payment_status are text in this restore (not enums) — avoid enum casts.
CREATE OR REPLACE FUNCTION public.mark_order_paid(order_ref text, moolre_ref text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  updated_order orders;
BEGIN
  UPDATE orders
  SET
    payment_status = 'paid',
    status = CASE
      WHEN status IN ('pending', 'awaiting_payment') THEN 'processing'
      ELSE status
    END,
    metadata = COALESCE(metadata, '{}'::jsonb) ||
               jsonb_build_object(
                 'moolre_reference', moolre_ref,
                 'payment_verified_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
               ),
    updated_at = now()
  WHERE order_number = order_ref
  RETURNING * INTO updated_order;

  IF updated_order.id IS NOT NULL THEN
    IF (updated_order.metadata->>'stock_reduced') IS NULL THEN
      UPDATE products p
      SET quantity = GREATEST(0, p.quantity - oi.quantity),
          updated_at = now()
      FROM order_items oi
      WHERE oi.order_id = updated_order.id
        AND oi.product_id = p.id;

      UPDATE product_variants pv
      SET quantity = GREATEST(0, pv.quantity - oi.quantity),
          updated_at = now()
      FROM order_items oi
      WHERE oi.order_id = updated_order.id
        AND oi.product_id = pv.product_id
        AND oi.variant_name IS NOT NULL
        AND oi.variant_name = pv.name;

      UPDATE orders
      SET metadata = metadata || '{"stock_reduced": true}'::jsonb,
          updated_at = now()
      WHERE id = updated_order.id;

      SELECT * INTO updated_order FROM orders WHERE id = updated_order.id;
    END IF;
  ELSE
    SELECT * INTO updated_order FROM orders WHERE order_number = order_ref;
  END IF;

  RETURN to_jsonb(updated_order);
END;
$$;
