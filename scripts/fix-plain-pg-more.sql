-- Additional plain-Postgres hardening for baddiescurves
-- Safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- auth.users.id default (app usually supplies UUID; default is a safety net)
ALTER TABLE auth.users
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Contact form storage (app inserts here; previously missing)
CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  email text,
  phone text,
  subject text,
  message text,
  created_at timestamptz DEFAULT now()
);

-- Support ticket numbers
CREATE SEQUENCE IF NOT EXISTS public.support_tickets_ticket_number_seq;
SELECT setval(
  'public.support_tickets_ticket_number_seq',
  GREATEST(
    (SELECT COALESCE(MAX(ticket_number), 0) FROM public.support_tickets),
    1
  ),
  true
);
ALTER TABLE public.support_tickets
  ALTER COLUMN ticket_number SET DEFAULT nextval('public.support_tickets_ticket_number_seq');

-- Prevent duplicate order numbers under concurrent checkout
CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_uidx
  ON public.orders (order_number);

-- Seed store_modules rows used by admin module toggles
INSERT INTO public.store_modules (id, enabled, updated_at)
VALUES
  ('notifications', false, now()),
  ('cms', false, now()),
  ('homepage', false, now()),
  ('blog', false, now()),
  ('customer-insights', false, now()),
  ('flash-sales', false, now()),
  ('reviews', true, now()),
  ('wishlist', true, now()),
  ('coupons', true, now()),
  ('pos', true, now())
ON CONFLICT (id) DO NOTHING;
