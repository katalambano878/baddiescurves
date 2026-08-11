# Supabase → Postgres Database Report — Baddiescurves

## Strategy

**Shape A:** Keep `@supabase/supabase-js` client API; retarget `NEXT_PUBLIC_SUPABASE_URL` to the Next.js origin; implement `/rest/v1`, `/auth/v1`, `/storage/v1` over plain Postgres (`DATABASE_URL`).

| Supabase Feature | Previous | PostgreSQL Replacement | Status |
| ---------------- | -------- | ---------------------- | ------ |
| PostgREST tables | Hosted API | `lib/db/supabase-compat.ts` + `/rest/v1` | Active |
| RLS | Postgres policies | **App ACL** in `lib/db/rest-acl.ts` (+ admin/service JWT) | Repaired 2026-08-12 |
| GoTrue auth | Hosted Auth | `lib/db/auth.ts` + `auth.users` | Active |
| Storage | Supabase Storage | Disk under `STORAGE_ROOT` + `/storage/v1` | Active |
| RPC | `supabase.rpc` | `public.*` functions via compat | Active |
| Realtime | Channels | Not used / not ported | N/A |
| Edge functions | Deno | Next.js API routes | Active |
| Service role | Service key | In-process `supabaseAdmin` bypasses HTTP ACL | Active |

## Remaining Supabase-branded pieces (intentional)

- Package `@supabase/supabase-js` (client SDK only)
- Env names: `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`
- Cookie names `sb-*`
- Scripts: `create-admin-user.mjs`, `apply-rls*.mjs` (legacy; do not use on plain PG)

## Auth migration

- Users live in `auth.users` with bcrypt passwords.
- Profiles auto-created via restored `on_auth_user_created` trigger + signup code path.
- Admin gate: JWT `app_metadata.role` (plain PG middleware) or profiles lookup (hosted path).

## Storage migration

- No `storage.objects` table required.
- Public/signed URL routes emulate Supabase shapes for existing client calls (`products` bucket).

## What was removed / not re-enabled

- Database RLS policies are **not** re-enabled (pool is service-like). Security is enforced in Next routes.
- Hosted Supabase URL/keys are not required when `DATABASE_URL` is set.
