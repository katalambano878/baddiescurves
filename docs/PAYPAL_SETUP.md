# PayPal setup (international USD)

Ghana visitors pay with **Moolre (GHS)**. International visitors pay with **PayPal (USD)**.

## Coolify env

| Variable | Notes |
|----------|--------|
| `PAYPAL_CLIENT_ID` | From PayPal Developer Dashboard app |
| `PAYPAL_CLIENT_SECRET` | From same app |
| `PAYPAL_MODE` | `sandbox` then `live` |
| `PAYPAL_WEBHOOK_ID` | Created after registering the webhook URL |
| `NEXT_PUBLIC_APP_URL` | `https://baddiecurves.com` |

Moolre vars remain required for Ghana checkout.

## PayPal dashboard

1. Create a REST app (Sandbox first).
2. Copy Client ID + Secret into Coolify.
3. Add webhook: `https://baddiecurves.com/api/payment/paypal/webhook`
4. Subscribe at least to:
   - `CHECKOUT.ORDER.APPROVED`
   - `PAYMENT.CAPTURE.COMPLETED`
5. Copy the Webhook ID into `PAYPAL_WEBHOOK_ID`.
6. Redeploy the app.
7. When ready, switch credentials + `PAYPAL_MODE=live`.

## App routes

- `POST /api/payment/paypal` — create order + approve URL
- `POST /api/payment/paypal/capture` — capture after return
- `POST /api/payment/paypal/webhook` — async confirm

## Local test tip

Set cookie `country=US` for PayPal path, `country=GH` for Moolre path.
