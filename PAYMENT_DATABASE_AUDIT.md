# Payment Database Audit — Baddiescurves

**Active gateways:** Moolre (GHS, Ghana), PayPal (USD, international)  
**Not present in codebase:** Hubtel, Paystack (schema allows future gateway labels only)

## Shared model

Payments are recorded primarily on `orders` (+ `metadata` jsonb).  
New ledger: `payment_events` for idempotent callbacks/verifies.

Trusted amount source: `orders.total` / `orders.currency` (never client-supplied for success).

### Status model (orders)

- `payment_status`: pending → paid | failed | refunded | partially_refunded | processing | cancelled
- `status`: pending / awaiting_payment → processing on paid

`mark_order_paid` is idempotent: already-paid rows return without re-reducing stock.

---

## Moolre

| Area | Implementation |
| ---- | -------------- |
| Tables | `orders`, `payment_events`, `notification_events` |
| References | `order_number`, `metadata.moolre_*`, `payment_events.gateway_reference` |
| Amount validation | Callback/verify compare provider amount to `orders.total` |
| Currency | GHS |
| Callback | `/api/payment/moolre/callback` — secret, amount check, claim event, RPC |
| Verify | `/api/payment/moolre/verify` — provider status API, claim event, RPC |
| Duplicate protection | `claim_payment_event` + already-paid short-circuit |
| SMS | After trusted success via `sendOrderConfirmation` (idempotent) |

---

## PayPal

| Area | Implementation |
| ---- | -------------- |
| Tables | `orders` (`payment_provider`, `payment_transaction_id`), `payment_events` |
| References | `paypal_order_id` / `paypal_capture_id` in metadata |
| Amount / currency | Compared in `fulfillPayPalOrder` |
| Capture / webhook | `/api/payment/paypal/capture`, `/api/payment/paypal/webhook` |
| Duplicate protection | Event claim key `paypal:{orderNumber}:{captureId}` |
| Redirect alone | Does not mark paid without capture/verify path |

---

## Hubtel

**N/A** — no Hubtel routes, env vars, or tables in this repository.

## Paystack

**N/A** — no Paystack integration in this repository.

---

## Test results (staging DB)

| Test | Result |
| ---- | ------ |
| `mark_order_paid` smoke (`verify-plain-pg-checkout.sql`) | PASS (rolled back) |
| `claim_payment_event` first/second call | true / false |
| Amount mismatch rejection | Enforced in callback/fulfill code |
| Delayed failure after paid | Failed callback skips overwrite when `payment_status=paid` |
