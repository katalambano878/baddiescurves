-- =========================================================================
-- Sales: choose who sees sale prices
-- -------------------------------------------------------------------------
-- site_settings.sales_markets says where sales show:
--   "all"  → everyone (default)
--   "USD"  → customers outside Ghana only (dollar prices)
--   "GHS"  → customers in Ghana only (cedi prices)
--
-- It works the same way as switching a sale off: for the market that is left
-- out, the sale price is put aside in metadata (held_sale_price for dollars,
-- held_sale_price_ghs for cedis), the price column goes back to the regular
-- price and the compare column is cleared. The storefront, checkout and POS
-- read the price columns, so they need no change. Choosing "all" again puts
-- the kept sale prices back.
--
-- sale_enforce_markets() applies the setting. It runs after every sale change
-- and after a sale is switched on, so new sales follow the setting too.
-- Sales that are switched off are left alone until they are switched on.
--
-- Additive: function replacements and one settings row. Running this file
-- changes no price (the setting starts as "all").
-- =========================================================================

CREATE OR REPLACE FUNCTION public.sale_enforce_markets(p_ids uuid[] DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_markets text;
  v_hold_usd boolean;
  v_hold_ghs boolean;
  v_changed int := 0;
  v_n int;
begin
  select upper(coalesce(value #>> '{}', 'all')) into v_markets
  from site_settings where key = 'sales_markets';
  v_markets := coalesce(v_markets, 'ALL');
  v_hold_usd := (v_markets = 'GHS');  -- Ghana only: dollar sale prices are held back
  v_hold_ghs := (v_markets = 'USD');  -- outside Ghana only: cedi sale prices are held back

  -- ---------------- cedis ----------------
  if v_hold_ghs then
    update product_variants v
    set metadata = coalesce(v.metadata, '{}'::jsonb) || jsonb_build_object('held_sale_price_ghs', v.price_ghs),
        price_ghs = v.compare_at_price_ghs,
        compare_at_price_ghs = null,
        updated_at = now()
    where (p_ids is null or v.product_id = any(p_ids))
      and not coalesce(v.metadata ? 'paused_sale_price', false)
      and coalesce(v.compare_at_price_ghs > v.price_ghs, false);
    get diagnostics v_n = row_count; v_changed := v_changed + v_n;

    update products p
    set metadata = coalesce(p.metadata, '{}'::jsonb) || jsonb_build_object('held_sale_price_ghs', p.price_ghs),
        price_ghs = p.compare_at_price_ghs,
        compare_at_price_ghs = null,
        updated_at = now()
    where (p_ids is null or p.id = any(p_ids))
      and not coalesce(p.metadata ? 'paused_sale_price', false)
      and coalesce(p.compare_at_price_ghs > p.price_ghs, false);
    get diagnostics v_n = row_count; v_changed := v_changed + v_n;
  else
    update product_variants v
    set compare_at_price_ghs = case when (v.metadata->>'held_sale_price_ghs')::numeric < v.price_ghs then v.price_ghs
                                    else v.compare_at_price_ghs end,
        price_ghs = least(v.price_ghs, coalesce((v.metadata->>'held_sale_price_ghs')::numeric, v.price_ghs)),
        metadata = v.metadata - 'held_sale_price_ghs',
        updated_at = now()
    where (p_ids is null or v.product_id = any(p_ids))
      and v.metadata ? 'held_sale_price_ghs'
      and not coalesce(v.metadata ? 'paused_sale_price', false);
    get diagnostics v_n = row_count; v_changed := v_changed + v_n;

    update products p
    set compare_at_price_ghs = case when (p.metadata->>'held_sale_price_ghs')::numeric < p.price_ghs then p.price_ghs
                                    else p.compare_at_price_ghs end,
        price_ghs = least(p.price_ghs, coalesce((p.metadata->>'held_sale_price_ghs')::numeric, p.price_ghs)),
        metadata = p.metadata - 'held_sale_price_ghs',
        updated_at = now()
    where (p_ids is null or p.id = any(p_ids))
      and p.metadata ? 'held_sale_price_ghs'
      and not coalesce(p.metadata ? 'paused_sale_price', false);
    get diagnostics v_n = row_count; v_changed := v_changed + v_n;
  end if;

  -- ---------------- dollars ----------------
  if v_hold_usd then
    update product_variants v
    set metadata = coalesce(v.metadata, '{}'::jsonb) || jsonb_build_object('held_sale_price', v.price),
        price = v.compare_at_price,
        compare_at_price = null,
        updated_at = now()
    where (p_ids is null or v.product_id = any(p_ids))
      and not coalesce(v.metadata ? 'paused_sale_price', false)
      and coalesce(v.compare_at_price > v.price, false);
    get diagnostics v_n = row_count; v_changed := v_changed + v_n;

    update products p
    set metadata = coalesce(p.metadata, '{}'::jsonb) || jsonb_build_object('held_sale_price', p.price),
        price = p.compare_at_price,
        compare_at_price = null,
        updated_at = now()
    where (p_ids is null or p.id = any(p_ids))
      and not coalesce(p.metadata ? 'paused_sale_price', false)
      and coalesce(p.compare_at_price > p.price, false);
    get diagnostics v_n = row_count; v_changed := v_changed + v_n;
  else
    update product_variants v
    set compare_at_price = case when (v.metadata->>'held_sale_price')::numeric < v.price then v.price
                                else v.compare_at_price end,
        price = least(v.price, coalesce((v.metadata->>'held_sale_price')::numeric, v.price)),
        metadata = v.metadata - 'held_sale_price',
        updated_at = now()
    where (p_ids is null or v.product_id = any(p_ids))
      and v.metadata ? 'held_sale_price'
      and not coalesce(v.metadata ? 'paused_sale_price', false);
    get diagnostics v_n = row_count; v_changed := v_changed + v_n;

    update products p
    set compare_at_price = case when (p.metadata->>'held_sale_price')::numeric < p.price then p.price
                                else p.compare_at_price end,
        price = least(p.price, coalesce((p.metadata->>'held_sale_price')::numeric, p.price)),
        metadata = p.metadata - 'held_sale_price',
        updated_at = now()
    where (p_ids is null or p.id = any(p_ids))
      and p.metadata ? 'held_sale_price'
      and not coalesce(p.metadata ? 'paused_sale_price', false);
    get diagnostics v_n = row_count; v_changed := v_changed + v_n;
  end if;

  -- Variant changes do not touch the product row: touch it so on_sale is worked out again.
  update products p
  set updated_at = now()
  where (p_ids is null or p.id = any(p_ids))
    and exists (select 1 from product_variants v where v.product_id = p.id);

  return jsonb_build_object('markets', lower(v_markets), 'rows_changed', v_changed);
end; $function$;

-- on_sale also stays true while a sale price is being held back for one market.
CREATE OR REPLACE FUNCTION public.products_sync_on_sale()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.on_sale :=
    coalesce(new.metadata ?| array['paused_sale_price', 'held_sale_price', 'held_sale_price_ghs'], false)
    or coalesce(new.compare_at_price > new.price, false)
    or coalesce(new.compare_at_price_ghs > new.price_ghs, false)
    or exists (
      select 1 from public.product_variants v
      where v.product_id = new.id
        and (
          coalesce(v.compare_at_price > v.price, false)
          or coalesce(v.compare_at_price_ghs > v.price_ghs, false)
          or coalesce(v.metadata ?| array['paused_sale_price', 'held_sale_price', 'held_sale_price_ghs'], false)
        )
    );
  return new;
end; $function$;

-- Taking a product off sale also drops any held-back sale price.
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
      metadata = coalesce(v.metadata, '{}'::jsonb)
                 - 'paused_sale_price' - 'paused_sale_price_ghs' - 'held_sale_price' - 'held_sale_price_ghs',
      updated_at = now()
  where v.product_id = any(p_ids)
    and (coalesce(v.compare_at_price > v.price, false)
         or coalesce(v.compare_at_price_ghs > v.price_ghs, false)
         or coalesce(v.metadata ?| array['paused_sale_price', 'held_sale_price', 'held_sale_price_ghs'], false));
  get diagnostics v_variants = row_count;

  update products p
  set price = sale_regular(p.price, p.compare_at_price),
      compare_at_price = null,
      price_ghs = sale_regular(p.price_ghs, p.compare_at_price_ghs),
      compare_at_price_ghs = null,
      metadata = coalesce(p.metadata, '{}'::jsonb)
                 - 'paused_sale_price' - 'paused_sale_price_ghs' - 'held_sale_price' - 'held_sale_price_ghs',
      updated_at = now()
  where p.id = any(p_ids)
    and p.on_sale = true;
  get diagnostics v_products = row_count;

  return jsonb_build_object('products_updated', v_products, 'variants_updated', v_variants);
end; $function$;

-- Switching sales on: bring the kept prices back, then apply the market setting.
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

  perform sale_enforce_markets(p_ids);

  return jsonb_build_object('products_resumed', v_products, 'variants_resumed', v_variants);
end; $function$;

-- Every change from Admin → Sales: as before, plus the market setting.
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

    -- A new price replaces whatever was being held back for one market.
    update product_variants v
    set metadata = v.metadata - 'held_sale_price' - 'held_sale_price_ghs'
    where v.product_id = any(v_ids) and v.metadata ?| array['held_sale_price', 'held_sale_price_ghs']
      and p_action in ('percentage', 'fixed');
    update products p
    set metadata = p.metadata - 'held_sale_price' - 'held_sale_price_ghs'
    where p.id = any(v_ids) and p.metadata ?| array['held_sale_price', 'held_sale_price_ghs']
      and p_action in ('percentage', 'fixed');

    if p_action = 'percentage' then
      v_result := apply_sale_percentage(v_ids, p_value);
    elsif p_action = 'fixed' then
      v_result := apply_sale_fixed(v_ids, p_value, p_currency);
    elsif p_action = 'variant_prices' then
      v_result := apply_sale_variant_prices(p_items, p_currency);
    else
      raise exception 'Unknown sale action: %', p_action;
    end if;

    -- Keep the sale to the chosen market (everyone, outside Ghana, or Ghana).
    perform sale_enforce_markets(v_ids);

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

-- Sales start out showing to everyone.
INSERT INTO public.site_settings (key, value, category)
VALUES ('sales_markets', '"all"'::jsonb, 'sales')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.schema_migrations (version, name)
VALUES ('20261127090000', 'sale_markets')
ON CONFLICT DO NOTHING;
