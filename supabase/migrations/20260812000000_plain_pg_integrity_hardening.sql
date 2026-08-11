-- =============================================================================
-- Baddiescurves plain-Postgres integrity hardening (staging-safe, idempotent)
-- Date: 2026-08-12
-- Target: baddiescurves_staging (fleet-postgres)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Payment / notification event tables (idempotency + audit)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway text NOT NULL,
  event_key text NOT NULL,
  order_number text,
  gateway_reference text,
  event_type text NOT NULL DEFAULT 'callback',
  processing_status text NOT NULL DEFAULT 'received',
  payload_hash text,
  amount numeric(12,2),
  currency text,
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT payment_events_status_chk CHECK (
    processing_status IN ('received', 'processing', 'processed', 'ignored', 'failed')
  ),
  CONSTRAINT payment_events_gateway_chk CHECK (
    gateway IN ('moolre', 'paypal', 'hubtel', 'paystack', 'manual', 'other')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_events_gateway_event_uidx
  ON public.payment_events (gateway, event_key);

CREATE INDEX IF NOT EXISTS payment_events_order_number_idx
  ON public.payment_events (order_number);

CREATE INDEX IF NOT EXISTS payment_events_unprocessed_idx
  ON public.payment_events (processing_status, received_at)
  WHERE processing_status IN ('received', 'processing', 'failed');

CREATE TABLE IF NOT EXISTS public.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL,
  event_type text NOT NULL,
  related_order_number text,
  recipient_fingerprint text,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider_message_id text,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT notification_events_channel_chk CHECK (channel IN ('sms', 'email')),
  CONSTRAINT notification_events_status_chk CHECK (
    status IN ('pending', 'sent', 'failed', 'skipped')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_events_idempotency_uidx
  ON public.notification_events (idempotency_key);

CREATE INDEX IF NOT EXISTS notification_events_order_idx
  ON public.notification_events (related_order_number);

-- ---------------------------------------------------------------------------
-- 2) Performance indexes for hot paths
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_email_lower ON public.orders (lower(email));
CREATE INDEX IF NOT EXISTS idx_orders_payment_status_created
  ON public.orders (payment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON public.orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_customers_email_lower ON public.customers (lower(email));
CREATE INDEX IF NOT EXISTS idx_profiles_email_lower ON public.profiles (lower(email));
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON public.reviews (product_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON public.cart_items (user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_user_id ON public.wishlist_items (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS customers_email_lower_uidx
  ON public.customers (lower(email));

-- ---------------------------------------------------------------------------
-- 3) Check constraints (financial / quantity sanity)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_total_nonneg_chk') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_total_nonneg_chk CHECK (total >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_subtotal_nonneg_chk') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_subtotal_nonneg_chk CHECK (subtotal >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_qty_positive_chk') THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_qty_positive_chk CHECK (quantity > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_unit_price_nonneg_chk') THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_unit_price_nonneg_chk CHECK (unit_price >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_quantity_nonneg_chk') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_quantity_nonneg_chk CHECK (quantity IS NULL OR quantity >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_currency_chk') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_currency_chk
      CHECK (currency IS NULL OR upper(currency) IN ('GHS', 'USD', 'GBP', 'EUR'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_status_chk') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_status_chk
      CHECK (
        payment_status IS NULL OR payment_status IN (
          'pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'processing', 'cancelled'
        )
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Foreign keys (orphan pre-check passed on staging)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_id_fkey') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_id_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_user_id_fkey') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_order_id_fkey') THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_product_id_fkey') THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_variant_id_fkey') THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_variant_id_fkey
      FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_user_id_fkey') THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_product_id_fkey') THEN
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'review_images_review_id_fkey') THEN
    ALTER TABLE public.review_images
      ADD CONSTRAINT review_images_review_id_fkey
      FOREIGN KEY (review_id) REFERENCES public.reviews(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cart_items_product_id_fkey') THEN
    ALTER TABLE public.cart_items
      ADD CONSTRAINT cart_items_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wishlist_items_product_id_fkey') THEN
    ALTER TABLE public.wishlist_items
      ADD CONSTRAINT wishlist_items_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_status_history_order_id_fkey') THEN
    ALTER TABLE public.order_status_history
      ADD CONSTRAINT order_status_history_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'return_requests_order_id_fkey') THEN
    ALTER TABLE public.return_requests
      ADD CONSTRAINT return_requests_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'return_items_return_request_id_fkey') THEN
    ALTER TABLE public.return_items
      ADD CONSTRAINT return_items_return_request_id_fkey
      FOREIGN KEY (return_request_id) REFERENCES public.return_requests(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'support_messages_ticket_id_fkey') THEN
    ALTER TABLE public.support_messages
      ADD CONSTRAINT support_messages_ticket_id_fkey
      FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5) Restore missing triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_addresses_updated_at ON public.addresses;
CREATE TRIGGER update_addresses_updated_at
  BEFORE UPDATE ON public.addresses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_categories_updated_at ON public.categories;
CREATE TRIGGER update_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_products_updated_at ON public.products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_product_variants_updated_at ON public.product_variants;
CREATE TRIGGER update_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_coupons_updated_at ON public.coupons;
CREATE TRIGGER update_coupons_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_orders_updated_at ON public.orders;
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_cart_items_updated_at ON public.cart_items;
CREATE TRIGGER update_cart_items_updated_at
  BEFORE UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_reviews_updated_at ON public.reviews;
CREATE TRIGGER update_reviews_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_blog_posts_updated_at ON public.blog_posts;
CREATE TRIGGER update_blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_return_requests_updated_at ON public.return_requests;
CREATE TRIGGER update_return_requests_updated_at
  BEFORE UPDATE ON public.return_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_store_settings_updated_at ON public.store_settings;
CREATE TRIGGER update_store_settings_updated_at
  BEFORE UPDATE ON public.store_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_pages_updated_at ON public.pages;
CREATE TRIGGER update_pages_updated_at
  BEFORE UPDATE ON public.pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_customers_updated_at ON public.customers;
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS tr_update_product_rating ON public.reviews;
CREATE TRIGGER tr_update_product_rating
  AFTER INSERT OR DELETE OR UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_product_rating_stats();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 6) Hardened mark_order_paid (idempotent + row lock + no failed overwrite)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_order_paid(order_ref text, moolre_ref text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  updated_order orders;
BEGIN
  SELECT * INTO updated_order
  FROM orders
  WHERE order_number = order_ref
  FOR UPDATE;

  IF updated_order.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Idempotent: already paid → return current row, do not re-reduce stock
  IF updated_order.payment_status = 'paid' THEN
    RETURN to_jsonb(updated_order);
  END IF;

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
                 'payment_verified_at', to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
               ),
    updated_at = now()
  WHERE id = updated_order.id
  RETURNING * INTO updated_order;

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

  RETURN to_jsonb(updated_order);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7) Helper: claim payment event (returns true if this caller owns processing)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_payment_event(
  p_gateway text,
  p_event_key text,
  p_order_number text DEFAULT NULL,
  p_gateway_reference text DEFAULT NULL,
  p_event_type text DEFAULT 'callback',
  p_payload_hash text DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_currency text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inserted_id uuid;
  existing public.payment_events;
BEGIN
  INSERT INTO public.payment_events (
    gateway, event_key, order_number, gateway_reference,
    event_type, processing_status, payload_hash, amount, currency
  ) VALUES (
    p_gateway, p_event_key, p_order_number, p_gateway_reference,
    p_event_type, 'processing', p_payload_hash, p_amount, p_currency
  )
  ON CONFLICT (gateway, event_key) DO NOTHING
  RETURNING id INTO inserted_id;

  IF inserted_id IS NOT NULL THEN
    RETURN true;
  END IF;

  SELECT * INTO existing
  FROM public.payment_events
  WHERE gateway = p_gateway AND event_key = p_event_key
  FOR UPDATE;

  IF existing.processing_status = 'processed' THEN
    RETURN false;
  END IF;

  IF existing.processing_status = 'failed' THEN
    UPDATE public.payment_events
    SET processing_status = 'processing',
        order_number = COALESCE(p_order_number, order_number),
        gateway_reference = COALESCE(p_gateway_reference, gateway_reference),
        payload_hash = COALESCE(p_payload_hash, payload_hash),
        amount = COALESCE(p_amount, amount),
        currency = COALESCE(p_currency, currency),
        error_message = NULL,
        processed_at = NULL
    WHERE id = existing.id;
    RETURN true;
  END IF;

  -- Already processing or ignored by another worker
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_payment_event(
  p_gateway text,
  p_event_key text,
  p_status text DEFAULT 'processed',
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.payment_events
  SET processing_status = p_status,
      error_message = p_error,
      processed_at = now()
  WHERE gateway = p_gateway AND event_key = p_event_key;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8) Schema migration ledger (plain-PG has no supabase_migrations by default)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version text PRIMARY KEY,
  name text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.schema_migrations (version, name)
VALUES
  ('20260209000000', 'complete_schema'),
  ('20260218000000', 'allow_null_order_items_product_fks'),
  ('20260325000000', 'add_ghs_pricing'),
  ('20260812000000', 'plain_pg_integrity_hardening')
ON CONFLICT (version) DO NOTHING;
