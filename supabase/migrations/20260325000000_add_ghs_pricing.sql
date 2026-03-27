-- Add Ghana Cedis pricing columns for dual-currency support
-- These are nullable: when unset, storefront falls back to a USD→GHS conversion rate

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price_ghs numeric;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS compare_at_price_ghs numeric;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS price_ghs numeric;
