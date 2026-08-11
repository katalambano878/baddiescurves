# External Service Timeout Report — Baddiescurves

## Moolre payment

| Item | Value |
| ---- | ----- |
| Routes | `/api/payment/moolre`, callback, verify |
| Timeout | Provider HTTP calls should use fetch abort (verify path); callback is inbound |
| Blocks page? | No — checkout redirects to provider |
| Blocks callback? | No — SMS/email async after ack |
| Idempotency | `payment_events` + already-paid checks |
| Retry | No auto-retry on validation/auth failures |

## PayPal

| Item | Value |
| ---- | ----- |
| Routes | create / capture / webhook |
| Blocks dashboard? | No |
| Blocks fulfill response? | Notifications async after DB |
| Idempotency | `payment_events` claim key |
| Amount/currency | Validated before mark paid |

## Hubtel

Not implemented in this repository.

## Paystack

Not implemented in this repository.

## Moolre SMS

| Item | Value |
| ---- | ----- |
| Timeout | **12s** AbortController |
| Duplicate prevention | `notification_events` idempotency keys |
| Blocks callbacks? | **No** (void after response) |
| Blocks admin dashboard? | **No** |
| Sender ID | `MOOLRE_SMS_SENDER_ID` or `STORE` |

## Email (Resend)

Sent inside `sendOrderConfirmation` asynchronously from payment paths; failures logged, not thrown to gateways.
