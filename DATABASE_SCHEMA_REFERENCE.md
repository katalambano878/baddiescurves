# Database Schema Reference — Baddiescurves

**Database:** `baddiescurves_staging` · **PostgreSQL 16.14** · **Schemas:** `public`, `auth`, `extensions`

## Auth

### `auth.users`
GoTrue-shaped users for plain-PG auth (`lib/db/auth.ts`).

| Column | Type | Notes |
| ------ | ---- | ----- |
| id | uuid PK | default `gen_random_uuid()` |
| email | text | login identity |
| encrypted_password | text | bcrypt |
| raw_app_meta_data / raw_user_meta_data | jsonb | role mirrored from profiles at mint |
| deleted_at | timestamptz | soft delete |

**APIs:** `/auth/v1/*`  
**Related:** `profiles.id = auth.users.id`

### `public.profiles`
| Column | Type | Notes |
| id | uuid PK/FK → auth.users | CASCADE |
| email, full_name, phone | text | |
| role | text | `admin` \| `staff` \| `customer` |
| preferences | jsonb | |

## Commerce core

### `products` / `product_variants` / `product_images` / `categories`
Storefront catalog. Includes `price_ghs`, `compare_at_price_ghs`.  
**Pages:** `/shop`, `/product/[slug]`, admin products.  
**APIs:** `/api/storefront/*`, `/rest/v1/products`

### `orders`
| Column | Type | Notes |
| ------ | ---- | ----- |
| id | uuid PK | default uuid |
| order_number | text UNIQUE | checkout key |
| user_id | uuid FK → auth.users | SET NULL |
| email, phone | text | |
| status / payment_status | text | checked values |
| currency | text | GHS/USD/… |
| subtotal, total, … | numeric | non-negative checks |
| payment_method / payment_provider / payment_transaction_id | text | PayPal/Moolre |
| shipping_address / billing_address / metadata | jsonb | |
| payment_reminder_sent(_at) | bool/timestamptz | cron |

**Pages:** checkout, order-success, account, admin orders, pay  
**Payments:** Moolre + PayPal update via RPC + metadata

### `order_items`
FK → `orders` CASCADE; product/variant SET NULL.  
Checkout inserts line items with `metadata` (image/slug/preorder).

### `customers`
CRM rollup via `upsert_customer_from_order` / `update_customer_stats`.  
Unique on `lower(email)`.

## Payments & notifications

### `payment_events`
Idempotent gateway event ledger (`gateway`, `event_key` unique).  
Used by Moolre callback/verify and PayPal fulfill.

### `notification_events`
SMS/email idempotency (`idempotency_key` unique).  
Used by `sendOrderConfirmation`.

## Supporting tables (present; feature-flagged / low traffic)

`addresses`, `cart_items`, `wishlist_items`, `coupons`, `reviews`, `review_images`, `banners`, `cms_content`, `contact_submissions`, `store_modules`, `store_settings`, `site_settings`, `pages`, `navigation_*`, `blog_posts`, `notifications`, `support_*`, `return_*`, `order_status_history`, `audit_logs`, `schema_migrations`

## Critical RPCs

| Function | Purpose |
| -------- | ------- |
| `mark_order_paid(order_ref, moolre_ref)` | Atomic paid + stock (idempotent) |
| `upsert_customer_from_order(...)` | Checkout CRM upsert |
| `update_customer_stats(email, total)` | Spend/order counters |
| `claim_payment_event(...)` / `complete_payment_event(...)` | Callback dedupe |
| `handle_new_user()` | Trigger: auth.users → profiles |
| `update_product_rating_stats()` | Trigger on reviews |

## Indexes (high value)

- `orders_order_number_uidx`
- `idx_orders_user_id`, `idx_orders_email_lower`, `idx_orders_payment_status_created`
- `idx_order_items_order_id`
- `customers_email_lower_uidx`
- `payment_events_gateway_event_uidx`
