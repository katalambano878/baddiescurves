-- Post-repair schema assertions for baddiescurves_staging
\set ON_ERROR_STOP on

DO $$
DECLARE
  missing text;
BEGIN
  FOR missing IN
    SELECT t FROM unnest(ARRAY[
      'orders','order_items','products','categories','profiles','customers',
      'payment_events','notification_events','contact_submissions','schema_migrations'
    ]) AS t
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name=t
    )
  LOOP
    RAISE EXCEPTION 'Missing table: %', missing;
  END LOOP;

  FOR missing IN
    SELECT f FROM unnest(ARRAY[
      'mark_order_paid','upsert_customer_from_order','update_customer_stats',
      'claim_payment_event','complete_payment_event'
    ]) AS f
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=f
    )
  LOOP
    RAISE EXCEPTION 'Missing function: %', missing;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='orders_order_number_uidx'
  ) THEN
    RAISE EXCEPTION 'Missing unique index orders_order_number_uidx';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='order_items_order_id_fkey'
  ) THEN
    RAISE EXCEPTION 'Missing FK order_items_order_id_fkey';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_schema='auth' AND trigger_name='on_auth_user_created'
  ) THEN
    RAISE EXCEPTION 'Missing trigger on_auth_user_created';
  END IF;

  RAISE NOTICE 'SCHEMA TESTS PASSED';
END $$;

-- claim/complete payment event round-trip
SELECT public.claim_payment_event(
  'manual', 'schema-test-event-1', 'ORD-TEST', 'ref-1', 'test', 'hash', 1.00, 'USD'
) AS claimed_first;

SELECT public.claim_payment_event(
  'manual', 'schema-test-event-1', 'ORD-TEST', 'ref-1', 'test', 'hash', 1.00, 'USD'
) AS claimed_second_should_be_false;

SELECT public.complete_payment_event('manual', 'schema-test-event-1', 'processed', NULL);

DELETE FROM public.payment_events WHERE event_key = 'schema-test-event-1';
