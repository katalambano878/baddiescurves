-- =========================================================================
-- Sales manager (Admin → Sales, storefront /sale)
-- -------------------------------------------------------------------------
-- Pricing model (unchanged for checkout and payment):
--   price / price_ghs                       = what the customer is charged
--   compare_at_price / compare_at_price_ghs = the regular "was" price, held
--                                             here while a sale is live
--   products.on_sale                        = the product has a sale, live or
--                                             switched off
--
-- This shop sells in two currencies, so every sale change moves the dollar
-- price and the cedi price together.
--
-- A switched-off sale keeps its sale prices in metadata.paused_sale_price and
-- metadata.paused_sale_price_ghs while price / price_ghs hold the regular
-- prices and the compare columns are empty, so the storefront and checkout
-- charge the regular price with no other code involved.
--
-- Additive only: two columns, one index, one trigger, SQL functions and one
-- site_settings row. No existing price is changed by running this file.
-- =========================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS on_sale boolean NOT NULL DEFAULT false;

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS compare_at_price_ghs numeric;

CREATE INDEX IF NOT EXISTS idx_products_on_sale
  ON public.products (on_sale)
  WHERE on_sale = true;

-- The regular (pre-sale) price for one currency.
CREATE OR REPLACE FUNCTION public.sale_regular(p_price numeric, p_compare numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_compare is not null and p_price is not null and p_compare > p_price then p_compare
    else p_price
  end
$function$;

-- on_sale always follows the prices: true while the product or one of its
-- variants is discounted, or while its sale is switched off. Saving a product
-- from the product form therefore keeps the flag right without extra code.
CREATE OR REPLACE FUNCTION public.products_sync_on_sale()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.on_sale :=
    coalesce(new.metadata ? 'paused_sale_price', false)
    or coalesce(new.compare_at_price > new.price, false)
    or coalesce(new.compare_at_price_ghs > new.price_ghs, false)
    or exists (
      select 1 from public.product_variants v
      where v.product_id = new.id
        and (
          coalesce(v.compare_at_price > v.price, false)
          or coalesce(v.compare_at_price_ghs > v.price_ghs, false)
          or coalesce(v.metadata ? 'paused_sale_price', false)
        )
    );
  return new;
end; $function$;

DROP TRIGGER IF EXISTS products_sync_on_sale ON public.products;
CREATE TRIGGER products_sync_on_sale
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_sync_on_sale();

-- -------------------------------------------------------------------------
-- Percentage off: both currencies, product and every variant.
-- Always worked out from the regular price, so 20% then 30% gives 30%.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_sale_percentage(p_ids uuid[], p_pct numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_products int := 0; v_variants int := 0;
begin
  if p_pct is null or p_pct <= 0 or p_pct >= 100 then
    raise exception 'Discount percent must be between 1 and 99 (got %)', p_pct;
  end if;

  update product_variants v
  set compare_at_price = nullif(sale_regular(v.price, v.compare_at_price), 0),
      price = round(sale_regular(v.price, v.compare_at_price) * (1 - p_pct / 100.0), 2),
      compare_at_price_ghs = nullif(sale_regular(v.price_ghs, v.compare_at_price_ghs), 0),
      price_ghs = round(sale_regular(v.price_ghs, v.compare_at_price_ghs) * (1 - p_pct / 100.0), 2),
      updated_at = now()
  where v.product_id = any(p_ids)
    and (sale_regular(v.price, v.compare_at_price) > 0
         or coalesce(sale_regular(v.price_ghs, v.compare_at_price_ghs), 0) > 0);
  get diagnostics v_variants = row_count;

  update products p
  set compare_at_price = nullif(sale_regular(p.price, p.compare_at_price), 0),
      price = round(sale_regular(p.price, p.compare_at_price) * (1 - p_pct / 100.0), 2),
      compare_at_price_ghs = nullif(sale_regular(p.price_ghs, p.compare_at_price_ghs), 0),
      price_ghs = round(sale_regular(p.price_ghs, p.compare_at_price_ghs) * (1 - p_pct / 100.0), 2),
      updated_at = now()
  where p.id = any(p_ids)
    and (sale_regular(p.price, p.compare_at_price) > 0
         or coalesce(sale_regular(p.price_ghs, p.compare_at_price_ghs), 0) > 0);
  get diagnostics v_products = row_count;

  return jsonb_build_object('products_updated', v_products, 'variants_updated', v_variants);
end; $function$;

-- -------------------------------------------------------------------------
-- Fixed sale price for products WITHOUT variants. The price is given in one
-- currency (GHS by default); the other currency drops by the same proportion.
-- Skipped when the price is not below the regular price.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_sale_fixed(p_ids uuid[], p_price numeric, p_currency text DEFAULT 'GHS')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_products int := 0;
begin
  if p_price is null or p_price <= 0 then
    raise exception 'Sale price must be greater than 0 (got %)', p_price;
  end if;

  if upper(coalesce(p_currency, 'GHS')) = 'USD' then
    update products p
    set compare_at_price = sale_regular(p.price, p.compare_at_price),
        price = p_price,
        compare_at_price_ghs = nullif(sale_regular(p.price_ghs, p.compare_at_price_ghs), 0),
        price_ghs = round(sale_regular(p.price_ghs, p.compare_at_price_ghs) * p_price
                          / sale_regular(p.price, p.compare_at_price), 2),
        updated_at = now()
    where p.id = any(p_ids)
      and not exists (select 1 from product_variants v where v.product_id = p.id)
      and p_price < sale_regular(p.price, p.compare_at_price);
  else
    update products p
    set compare_at_price_ghs = sale_regular(p.price_ghs, p.compare_at_price_ghs),
        price_ghs = p_price,
        compare_at_price = nullif(sale_regular(p.price, p.compare_at_price), 0),
        price = round(sale_regular(p.price, p.compare_at_price) * p_price
                      / sale_regular(p.price_ghs, p.compare_at_price_ghs), 2),
        updated_at = now()
    where p.id = any(p_ids)
      and not exists (select 1 from product_variants v where v.product_id = p.id)
      and p.price_ghs is not null
      and p_price < sale_regular(p.price_ghs, p.compare_at_price_ghs);
  end if;
  get diagnostics v_products = row_count;

  return jsonb_build_object('products_updated', v_products);
end; $function$;

-- -------------------------------------------------------------------------
-- Each variant gets its own sale price: p_items = [{variant_id, price}].
-- Same currency rule as apply_sale_fixed. Product-level prices are left as
-- they are; the product row is touched so on_sale is worked out again.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_sale_variant_prices(p_items jsonb, p_currency text DEFAULT 'GHS')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_variants int := 0; v_products int := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'p_items must be a non-empty json array of {variant_id, price}';
  end if;

  if upper(coalesce(p_currency, 'GHS')) = 'USD' then
    update product_variants v
    set compare_at_price = sale_regular(v.price, v.compare_at_price),
        price = i.sale_price,
        compare_at_price_ghs = nullif(sale_regular(v.price_ghs, v.compare_at_price_ghs), 0),
        price_ghs = round(sale_regular(v.price_ghs, v.compare_at_price_ghs) * i.sale_price
                          / sale_regular(v.price, v.compare_at_price), 2),
        updated_at = now()
    from (
      select (e->>'variant_id')::uuid as id, (e->>'price')::numeric as sale_price
      from jsonb_array_elements(p_items) e
    ) i
    where v.id = i.id
      and i.sale_price > 0
      and i.sale_price < sale_regular(v.price, v.compare_at_price);
  else
    update product_variants v
    set compare_at_price_ghs = sale_regular(v.price_ghs, v.compare_at_price_ghs),
        price_ghs = i.sale_price,
        compare_at_price = nullif(sale_regular(v.price, v.compare_at_price), 0),
        price = round(sale_regular(v.price, v.compare_at_price) * i.sale_price
                      / sale_regular(v.price_ghs, v.compare_at_price_ghs), 2),
        updated_at = now()
    from (
      select (e->>'variant_id')::uuid as id, (e->>'price')::numeric as sale_price
      from jsonb_array_elements(p_items) e
    ) i
    where v.id = i.id
      and i.sale_price > 0
      and v.price_ghs is not null
      and i.sale_price < sale_regular(v.price_ghs, v.compare_at_price_ghs);
  end if;
  get diagnostics v_variants = row_count;

  update products p
  set updated_at = now()
  where p.id in (
    select v.product_id from product_variants v
    where v.id in (select (e->>'variant_id')::uuid from jsonb_array_elements(p_items) e)
  );
  get diagnostics v_products = row_count;

  return jsonb_build_object('variants_updated', v_variants, 'products_updated', v_products);
end; $function$;

-- -------------------------------------------------------------------------
-- Take products off sale: regular prices come back, live or switched off.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_sale(p_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_products int := 0; v_variants int := 0;
begin
  update product_variants v
  set price = sale_regular(v.price, v.compare_at_price),
      compare_at_price = null,
      price_ghs = sale_regular(v.price_ghs, v.compare_at_price_ghs),
      compare_at_price_ghs = null,
      metadata = coalesce(v.metadata, '{}'::jsonb) - 'paused_sale_price' - 'paused_sale_price_ghs',
      updated_at = now()
  where v.product_id = any(p_ids)
    and (coalesce(v.compare_at_price > v.price, false)
         or coalesce(v.compare_at_price_ghs > v.price_ghs, false)
         or coalesce(v.metadata ? 'paused_sale_price', false));
  get diagnostics v_variants = row_count;

  update products p
  set price = sale_regular(p.price, p.compare_at_price),
      compare_at_price = null,
      price_ghs = sale_regular(p.price_ghs, p.compare_at_price_ghs),
      compare_at_price_ghs = null,
      metadata = coalesce(p.metadata, '{}'::jsonb) - 'paused_sale_price' - 'paused_sale_price_ghs',
      updated_at = now()
  where p.id = any(p_ids)
    and p.on_sale = true;
  get diagnostics v_products = row_count;

  return jsonb_build_object('products_updated', v_products, 'variants_updated', v_variants);
end; $function$;

-- -------------------------------------------------------------------------
-- Switch sales off (p_ids NULL = every sale). Sale prices are kept.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pause_product_sales(p_ids uuid[] DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_products int := 0; v_variants int := 0;
begin
  update product_variants v
  set metadata = coalesce(v.metadata, '{}'::jsonb)
                 || jsonb_build_object('paused_sale_price', v.price, 'paused_sale_price_ghs', v.price_ghs),
      price = sale_regular(v.price, v.compare_at_price),
      compare_at_price = null,
      price_ghs = sale_regular(v.price_ghs, v.compare_at_price_ghs),
      compare_at_price_ghs = null,
      updated_at = now()
  from products p
  where v.product_id = p.id
    and (p_ids is null or p.id = any(p_ids))
    and p.on_sale = true
    and not coalesce(v.metadata ? 'paused_sale_price', false)
    and (coalesce(v.compare_at_price > v.price, false)
         or coalesce(v.compare_at_price_ghs > v.price_ghs, false));
  get diagnostics v_variants = row_count;

  update products p
  set metadata = coalesce(p.metadata, '{}'::jsonb)
                 || jsonb_build_object('paused_sale_price', p.price, 'paused_sale_price_ghs', p.price_ghs),
      price = sale_regular(p.price, p.compare_at_price),
      compare_at_price = null,
      price_ghs = sale_regular(p.price_ghs, p.compare_at_price_ghs),
      compare_at_price_ghs = null,
      updated_at = now()
  where (p_ids is null or p.id = any(p_ids))
    and p.on_sale = true
    and not coalesce(p.metadata ? 'paused_sale_price', false);
  get diagnostics v_products = row_count;

  return jsonb_build_object('products_paused', v_products, 'variants_paused', v_variants);
end; $function$;

-- -------------------------------------------------------------------------
-- Switch sales back on (p_ids NULL = every sale). A kept sale price is only
-- restored when it is still below the current regular price.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resume_product_sales(p_ids uuid[] DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_products int := 0; v_variants int := 0;
begin
  update product_variants v
  set compare_at_price = case when (v.metadata->>'paused_sale_price')::numeric < v.price then v.price end,
      price = least(v.price, coalesce((v.metadata->>'paused_sale_price')::numeric, v.price)),
      compare_at_price_ghs = case when (v.metadata->>'paused_sale_price_ghs')::numeric < v.price_ghs then v.price_ghs end,
      price_ghs = least(v.price_ghs, coalesce((v.metadata->>'paused_sale_price_ghs')::numeric, v.price_ghs)),
      metadata = v.metadata - 'paused_sale_price' - 'paused_sale_price_ghs',
      updated_at = now()
  where (p_ids is null or v.product_id = any(p_ids))
    and v.metadata ? 'paused_sale_price';
  get diagnostics v_variants = row_count;

  update products p
  set compare_at_price = case when (p.metadata->>'paused_sale_price')::numeric < p.price then p.price end,
      price = least(p.price, coalesce((p.metadata->>'paused_sale_price')::numeric, p.price)),
      compare_at_price_ghs = case when (p.metadata->>'paused_sale_price_ghs')::numeric < p.price_ghs then p.price_ghs end,
      price_ghs = least(p.price_ghs, coalesce((p.metadata->>'paused_sale_price_ghs')::numeric, p.price_ghs)),
      metadata = p.metadata - 'paused_sale_price' - 'paused_sale_price_ghs',
      updated_at = now()
  where (p_ids is null or p.id = any(p_ids))
    and p.metadata ? 'paused_sale_price';
  get diagnostics v_products = row_count;

  return jsonb_build_object('products_resumed', v_products, 'variants_resumed', v_variants);
end; $function$;

-- -------------------------------------------------------------------------
-- One atomic call for every change made from Admin → Sales, keeping each
-- product's own on/off state:
--   'percentage' | 'fixed'  (p_ids, p_value)
--   'remove'                (p_ids)
--   'variant_prices'        (p_items: [{variant_id, price}])
-- A switched-off sale is switched on for the change and off again after it.
-- A product that had no sale starts switched off while all sales are off
-- (site_settings.sales_active). If any step fails, nothing changes.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sale_change_keep_state(
  p_action text,
  p_ids uuid[] DEFAULT NULL,
  p_value numeric DEFAULT NULL,
  p_items jsonb DEFAULT NULL,
  p_currency text DEFAULT 'GHS'
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ids uuid[];
  v_paused uuid[];
  v_no_sale uuid[];
  v_pause_after uuid[] := '{}';
  v_all_on boolean;
  v_result jsonb;
begin
  if p_action = 'variant_prices' then
    select coalesce(array_agg(distinct v.product_id), '{}') into v_ids
    from product_variants v
    where v.id in (select (e->>'variant_id')::uuid from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e);
  else
    v_ids := coalesce(p_ids, '{}');
  end if;

  select coalesce(array_agg(id), '{}') into v_paused
  from products where id = any(v_ids) and metadata ? 'paused_sale_price';
  select coalesce(array_agg(id), '{}') into v_no_sale
  from products where id = any(v_ids) and not coalesce(on_sale, false);

  select coalesce(bool_or(value in ('true'::jsonb, '"true"'::jsonb)), true) into v_all_on
  from site_settings where key = 'sales_active';

  if p_action = 'remove' then
    v_result := remove_sale(v_ids);
  else
    if cardinality(v_paused) > 0 then
      perform resume_product_sales(v_paused);
    end if;

    if p_action = 'percentage' then
      v_result := apply_sale_percentage(v_ids, p_value);
    elsif p_action = 'fixed' then
      v_result := apply_sale_fixed(v_ids, p_value, p_currency);
    elsif p_action = 'variant_prices' then
      v_result := apply_sale_variant_prices(p_items, p_currency);
    else
      raise exception 'Unknown sale action: %', p_action;
    end if;

    v_pause_after := v_paused || (case when v_all_on then '{}'::uuid[] else v_no_sale end);
    if cardinality(v_pause_after) > 0 then
      perform pause_product_sales(v_pause_after);
    end if;
  end if;

  return v_result || jsonb_build_object(
    'product_ids', to_jsonb(v_ids),
    'paused', cardinality(v_pause_after)
  );
end; $function$;

-- Existing discounts (compare price above price) count as live sales.
UPDATE public.products SET updated_at = updated_at
WHERE coalesce(compare_at_price > price, false) OR coalesce(compare_at_price_ghs > price_ghs, false);

-- All sales start ON.
INSERT INTO public.site_settings (key, value, category)
VALUES ('sales_active', 'true'::jsonb, 'sales')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.schema_migrations (version, name)
VALUES ('20261126090000', 'sales_manager')
ON CONFLICT DO NOTHING;
