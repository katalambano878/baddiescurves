# Website Stability Checklist (reusable)

## React / loading

- [ ] Every `setLoading(true)` has `finally { setLoading(false) }`
- [ ] Redirect paths still clear loading
- [ ] Unmount aborts in-flight fetches
- [ ] No `useEffect` that setStates a dependency it lists without guard
- [ ] No intervals/subscriptions without cleanup
- [ ] Buttons re-enable after failure/timeout

## API

- [ ] Every code path returns or throws
- [ ] JSON parse failures handled
- [ ] Auth/authz failures return 401/403 (not hang)
- [ ] External fetches have AbortSignal timeouts
- [ ] No unbounded retries on 4xx

## Database

- [ ] One shared pool/client
- [ ] `statement_timeout` / `lock_timeout` / idle-in-tx set
- [ ] Clients released in `finally`
- [ ] No external I/O inside open transactions
- [ ] List queries have `LIMIT` / pagination
- [ ] Hot filters indexed

## Auth / middleware

- [ ] Login/register/callbacks excluded from auth redirects
- [ ] No redirect loops (login ↔ dashboard)
- [ ] Cookies work on HTTP and HTTPS
- [ ] Session failure shows login/error, not spinner forever

## Payments / SMS

- [ ] Callbacks acknowledge quickly
- [ ] Idempotency keys / event ledger
- [ ] Amount/currency validated server-side
- [ ] SMS/email not blocking callback or dashboard
- [ ] Provider timeouts configured

## Admin

- [ ] Shell loads independently of heavy widgets
- [ ] Dashboard cards fail independently
- [ ] Tables paginated/bounded
- [ ] Search debounced + abort previous

## Observability

- [ ] Health endpoint (no secrets)
- [ ] Timed logs for slow sections
- [ ] Monitor script for idle-in-tx / blocked queries
