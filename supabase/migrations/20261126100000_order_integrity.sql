-- =========================================================================
-- Order integrity: stock, coupons and customer totals when an order is paid
-- -------------------------------------------------------------------------
-- 1. mark_order_paid(): reduces stock once per order, per variant.
--      * Variants are matched by order_items.variant_id (set by the server
--        checkout and by POS). Older items that only carry the label
--        ("Black / M") are matched on that label.
--      * Two lines of the same product are added up before the reduction.
--      * A product with variants ends up with quantity = sum of its variants.
--      * An order that was saved as already paid (POS) still gets its stock
--        reduced the first time this is called.
--      * A discount code on the order is counted once (coupons.usage_count).
-- 2. update_customer_stats(): also finds the customer by secondary email.
-- 3. Coupon codes are unique whatever the letter case; ratings stay 1 to 5.
--
-- Additive: function replacements, two indexes and one check constraint.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.mark_order_paid(order_ref text, moolre_ref text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o orders;
BEGIN
  SELECT * INTO o FROM orders WHERE order_number = order_ref FOR UPDATE;
  IF o.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF o.payment_status IS DISTINCT FROM 'paid' THEN
    UPDATE orders
    SET payment_status = 'paid',
        status = CASE WHEN status IN ('pending', 'awaiting_payment') THEN 'processing' ELSE status END,
        metadata = COALESCE(metadata, '{}'::jsonb) ||
                   jsonb_build_object(
                     'moolre_reference', moolre_ref,
                     'payment_verified_at', to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                   ),
        updated_at = now()
    WHERE id = o.id
    RETURNING * INTO o;
  END IF;

  -- Everything below happens once per order.
  IF (o.metadata->>'stock_reduced') IS NULL THEN
    -- Variants named by id.
    UPDATE product_variants pv
    SET quantity = GREATEST(0, COALESCE(pv.quantity, 0) - x.qty),
        updated_at = now()
    FROM (
      SELECT variant_id, sum(quantity)::int AS qty
      FROM order_items
      WHERE order_id = o.id AND variant_id IS NOT NULL
      GROUP BY variant_id
    ) x
    WHERE pv.id = x.variant_id;

    -- Older items: only the label was saved ("Colour / Size", or just the size
    -- when no other variant of the product shares that name).
    UPDATE product_variants pv
    SET quantity = GREATEST(0, COALESCE(pv.quantity, 0) - x.qty),
        updated_at = now()
    FROM (
      SELECT product_id, lower(trim(variant_name)) AS label, sum(quantity)::int AS qty
      FROM order_items
      WHERE order_id = o.id AND variant_id IS NULL AND variant_name IS NOT NULL AND product_id IS NOT NULL
      GROUP BY product_id, lower(trim(variant_name))
    ) x
    WHERE pv.product_id = x.product_id
      AND (
        x.label = lower(trim(COALESCE(pv.option2, '')) || ' / ' || trim(pv.name))
        OR (
          x.label = lower(trim(pv.name))
          AND (SELECT count(*) FROM product_variants p2
                WHERE p2.product_id = pv.product_id AND lower(trim(p2.name)) = lower(trim(pv.name))) = 1
        )
      );

    -- Products without variants: take the sold quantity off.
    UPDATE products p
    SET quantity = GREATEST(0, COALESCE(p.quantity, 0) - x.qty),
        updated_at = now()
    FROM (
      SELECT product_id, sum(quantity)::int AS qty
      FROM order_items
      WHERE order_id = o.id AND product_id IS NOT NULL
      GROUP BY product_id
    ) x
    WHERE p.id = x.product_id
      AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id);

    -- Products with variants: stock is the sum of the variants.
    UPDATE products p
    SET quantity = s.total,
        updated_at = now()
    FROM (
      SELECT v.product_id, COALESCE(sum(v.quantity), 0)::int AS total
      FROM product_variants v
      WHERE v.product_id IN (SELECT product_id FROM order_items WHERE order_id = o.id AND product_id IS NOT NULL)
      GROUP BY v.product_id
    ) s
    WHERE p.id = s.product_id;

    -- Count the discount code.
    IF (o.metadata->>'coupon_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      UPDATE coupons
      SET usage_count = COALESCE(usage_count, 0) + 1
      WHERE id = (o.metadata->>'coupon_id')::uuid;
    END IF;

    UPDATE orders
    SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"stock_reduced": true}'::jsonb,
        updated_at = now()
    WHERE id = o.id
    RETURNING * INTO o;
  END IF;

  RETURN to_jsonb(o);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_customer_stats(p_customer_email text, p_order_total numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE customers
  SET total_orders = COALESCE(total_orders, 0) + 1,
      total_spent = COALESCE(total_spent, 0) + COALESCE(p_order_total, 0),
      last_order_at = NOW(),
      updated_at = NOW()
  WHERE id = (
    SELECT id FROM customers
    WHERE lower(email) = lower(p_customer_email)
       OR lower(secondary_email) = lower(p_customer_email)
    ORDER BY (lower(email) = lower(p_customer_email)) DESC
    LIMIT 1
  );
END;
$function$;

-- One coupon per code, whatever the letter case.
CREATE UNIQUE INDEX IF NOT EXISTS coupons_code_upper_key ON public.coupons (upper(code));

-- "Has this shopper used this code before?" lookups.
CREATE INDEX IF NOT EXISTS idx_orders_coupon_code
  ON public.orders ((metadata->>'coupon_code'))
  WHERE metadata ? 'coupon_code';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_rating_range_chk') THEN
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_rating_range_chk CHECK (rating BETWEEN 1 AND 5) NOT VALID;
  END IF;
END $$;

INSERT INTO public.schema_migrations (version, name)
VALUES ('20261126100000', 'order_integrity')
ON CONFLICT DO NOTHING;
