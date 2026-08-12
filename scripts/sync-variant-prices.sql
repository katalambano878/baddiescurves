-- Sync variant prices with product prices when variants are stale
-- or missing Ghana prices. Safe for catalogs where variants share product pricing.

BEGIN;

-- 1) Copy product Ghana price onto variants that have none
UPDATE product_variants pv
SET price_ghs = p.price_ghs
FROM products p
WHERE pv.product_id = p.id
  AND pv.price_ghs IS NULL
  AND p.price_ghs IS NOT NULL;

-- 2) When every variant for a product shares the same USD price,
--    and that price differs from the product USD price, align them.
--    (Catches cases like product $40 / variants still $400.)
WITH uniform AS (
  SELECT
    product_id,
    MIN(price) AS min_price,
    MAX(price) AS max_price,
    COUNT(*) AS n
  FROM product_variants
  GROUP BY product_id
  HAVING COUNT(*) > 0 AND MIN(price) = MAX(price)
)
UPDATE product_variants pv
SET price = p.price
FROM products p
JOIN uniform u ON u.product_id = p.id
WHERE pv.product_id = p.id
  AND p.price IS NOT NULL
  AND u.min_price IS DISTINCT FROM p.price;

-- 3) Same for Ghana: if all variants share one GHS price different from product, align
WITH uniform_ghs AS (
  SELECT
    product_id,
    MIN(price_ghs) AS min_ghs,
    MAX(price_ghs) AS max_ghs
  FROM product_variants
  WHERE price_ghs IS NOT NULL
  GROUP BY product_id
  HAVING MIN(price_ghs) = MAX(price_ghs)
)
UPDATE product_variants pv
SET price_ghs = p.price_ghs
FROM products p
JOIN uniform_ghs u ON u.product_id = p.id
WHERE pv.product_id = p.id
  AND p.price_ghs IS NOT NULL
  AND u.min_ghs IS DISTINCT FROM p.price_ghs;

COMMIT;

-- Spot-check sleeveless
SELECT p.name, p.price, p.price_ghs, pv.price AS v_price, pv.price_ghs AS v_ghs
FROM products p
JOIN product_variants pv ON pv.product_id = p.id
WHERE p.name ILIKE '%Sleeveless%'
LIMIT 10;
