// GoTrue-compatible auth against plain Postgres auth.users (bcrypt hashes).

import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes, randomUUID } from "crypto";
import { query } from "./pool";
import { authJwtSecret } from "./mode";

const ACCESS_TTL_SEC = 60 * 60 * 24 * 7; // 7 days
const REFRESH_TTL_SEC = 60 * 60 * 24 * 30; // 30 days

export interface AuthUser {
  id: string;
  aud: string;
  role: string;
  email: string;
  phone: string;
  email_confirmed_at: string | null;
  phone_confirmed_at: string | null;
  confirmed_at: string | null;
  last_sign_in_at: string | null;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  identities: unknown[];
  created_at: string;
  updated_at: string;
}

export interface SessionTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: "bearer";
  user: AuthUser;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(authJwtSecret());
}

function rowToUser(row: Record<string, any>, appRole?: string | null): AuthUser {
  const meta =
    typeof row.raw_user_meta_data === "string"
      ? JSON.parse(row.raw_user_meta_data || "{}")
      : row.raw_user_meta_data || {};
  const appMeta =
    typeof row.raw_app_meta_data === "string"
      ? JSON.parse(row.raw_app_meta_data || "{}")
      : row.raw_app_meta_data || {};
  if (appRole) {
    appMeta.role = appRole;
  }
  return {
    id: row.id,
    aud: "authenticated",
    role: "authenticated",
    email: row.email || "",
    phone: row.phone || "",
    email_confirmed_at: row.email_confirmed_at || null,
    phone_confirmed_at: row.phone_confirmed_at || null,
    confirmed_at: row.email_confirmed_at || row.phone_confirmed_at || null,
    last_sign_in_at: row.last_sign_in_at || null,
    app_metadata: appMeta,
    user_metadata: meta,
    identities: [],
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
  };
}

async function loadAppRole(userId: string): Promise<string | null> {
  try {
    const { rows } = await query<{ role: string }>(
      `SELECT role FROM profiles WHERE id = $1 LIMIT 1`,
      [userId]
    );
    return rows[0]?.role ?? null;
  } catch {
    return null;
  }
}

async function mintSession(userRow: Record<string, any>): Promise<SessionTokens> {
  const appRole = await loadAppRole(userRow.id);
  const user = rowToUser(userRow, appRole);
  const now = Math.floor(Date.now() / 1000);
  const sessionId = randomUUID();

  const access_token = await new SignJWT({
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    phone: user.phone,
    app_metadata: user.app_metadata,
    user_metadata: user.user_metadata,
    session_id: sessionId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TTL_SEC)
    .sign(secretKey());

  const refresh_token = await new SignJWT({
    typ: "refresh",
    session_id: sessionId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuedAt(now)
    .setExpirationTime(now + REFRESH_TTL_SEC)
    .sign(secretKey());

  return {
    access_token,
    refresh_token,
    expires_in: ACCESS_TTL_SEC,
    expires_at: now + ACCESS_TTL_SEC,
    token_type: "bearer",
    user,
  };
}

export async function verifyAccessToken(
  token: string
): Promise<{ userId: string; payload: Record<string, any> } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.typ === "refresh") return null;
    const userId = typeof payload.sub === "string" ? payload.sub : null;
    if (!userId) return null;
    return { userId, payload: payload as Record<string, any> };
  } catch {
    return null;
  }
}

export async function getUserById(userId: string): Promise<AuthUser | null> {
  const { rows } = await query(
    `SELECT id, email, phone, encrypted_password, email_confirmed_at,
            phone_confirmed_at, last_sign_in_at, raw_app_meta_data,
            raw_user_meta_data, created_at, updated_at
     FROM auth.users WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [userId]
  );
  if (!rows[0]) return null;
  const appRole = await loadAppRole(userId);
  return rowToUser(rows[0], appRole);
}

export async function signInWithPassword(
  email: string,
  password: string
): Promise<{ session: SessionTokens | null; error: string | null }> {
  const normalized = email.trim().toLowerCase();
  const { rows } = await query(
    `SELECT id, email, phone, encrypted_password, email_confirmed_at,
            phone_confirmed_at, last_sign_in_at, raw_app_meta_data,
            raw_user_meta_data, created_at, updated_at
     FROM auth.users
     WHERE lower(email) = $1 AND deleted_at IS NULL
     LIMIT 1`,
    [normalized]
  );
  const row = rows[0];
  if (!row?.encrypted_password) {
    return { session: null, error: "Invalid login credentials" };
  }
  const ok = bcrypt.compareSync(password, row.encrypted_password);
  if (!ok) {
    return { session: null, error: "Invalid login credentials" };
  }

  await query(
    `UPDATE auth.users SET last_sign_in_at = now(), updated_at = now() WHERE id = $1`,
    [row.id]
  ).catch(() => {});

  const session = await mintSession(row);
  return { session, error: null };
}

export async function signUpWithPassword(opts: {
  email: string;
  password: string;
  data?: Record<string, unknown>;
}): Promise<{ session: SessionTokens | null; user: AuthUser | null; error: string | null }> {
  const email = opts.email.trim().toLowerCase();
  if (!email || !opts.password || opts.password.length < 6) {
    return { session: null, user: null, error: "Email and password (min 6 chars) required" };
  }

  const existing = await query(`SELECT id FROM auth.users WHERE lower(email) = $1 LIMIT 1`, [
    email,
  ]);
  if (existing.rows[0]) {
    return { session: null, user: null, error: "User already registered" };
  }

  const id = randomUUID();
  const hash = bcrypt.hashSync(opts.password, 10);
  const meta = opts.data || {};

  await query(
    `INSERT INTO auth.users (
       id, instance_id, aud, role, email, encrypted_password,
       email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
       created_at, updated_at, confirmation_token, recovery_token,
       email_change_token_new, email_change
     ) VALUES (
       $1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       $2, $3, now(), '{"provider":"email","providers":["email"]}'::jsonb, $4::jsonb,
       now(), now(), '', '', '', ''
     )`,
    [id, email, hash, JSON.stringify(meta)]
  );

  // Ensure profile row exists (app expects profiles.id = auth.users.id)
  await query(
    `INSERT INTO profiles (id, email, full_name, role, created_at, updated_at)
     VALUES ($1, $2, $3, 'customer', now(), now())
     ON CONFLICT (id) DO NOTHING`,
    [id, email, (meta.full_name as string) || email.split("@")[0]]
  ).catch(() => {});

  const { rows } = await query(`SELECT * FROM auth.users WHERE id = $1`, [id]);
  const session = await mintSession(rows[0]);
  return { session, user: session.user, error: null };
}

export async function refreshSession(
  refreshToken: string
): Promise<{ session: SessionTokens | null; error: string | null }> {
  try {
    const { payload } = await jwtVerify(refreshToken, secretKey());
    if (payload.typ !== "refresh") {
      return { session: null, error: "Invalid refresh token" };
    }
    const userId = payload.sub;
    if (!userId || typeof userId !== "string") {
      return { session: null, error: "Invalid refresh token" };
    }
    const { rows } = await query(
      `SELECT id, email, phone, encrypted_password, email_confirmed_at,
              phone_confirmed_at, last_sign_in_at, raw_app_meta_data,
              raw_user_meta_data, created_at, updated_at
       FROM auth.users WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [userId]
    );
    if (!rows[0]) return { session: null, error: "User not found" };
    const session = await mintSession(rows[0]);
    return { session, error: null };
  } catch {
    return { session: null, error: "Invalid refresh token" };
  }
}

export async function updateUserPassword(
  userId: string,
  password: string
): Promise<{ user: AuthUser | null; error: string | null }> {
  if (!password || password.length < 6) {
    return { user: null, error: "Password must be at least 6 characters" };
  }
  const hash = bcrypt.hashSync(password, 10);
  await query(
    `UPDATE auth.users SET encrypted_password = $1, updated_at = now() WHERE id = $2`,
    [hash, userId]
  );
  const user = await getUserById(userId);
  return { user, error: null };
}

export async function updateUserMetadata(
  userId: string,
  data: Record<string, unknown>
): Promise<{ user: AuthUser | null; error: string | null }> {
  await query(
    `UPDATE auth.users
     SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || $1::jsonb,
         updated_at = now()
     WHERE id = $2`,
    [JSON.stringify(data), userId]
  );
  // Keep the customer's profile row in step with what they saved: the account
  // page sends first_name / last_name / phone, and admin screens read profiles.
  const nameParts = [data.first_name, data.last_name]
    .filter((part): part is string => typeof part === "string")
    .map((part) => part.trim())
    .filter(Boolean);
  const fullName =
    typeof data.full_name === "string"
      ? data.full_name
      : nameParts.length > 0
        ? nameParts.join(" ")
        : null;
  const phone = typeof data.phone === "string" ? data.phone.trim() : null;
  if (fullName !== null || phone !== null) {
    await query(
      `INSERT INTO profiles (id, email, full_name, phone, role, created_at, updated_at)
       SELECT u.id, u.email, $1::text, $2::text, 'customer', now(), now()
       FROM auth.users u WHERE u.id = $3
       ON CONFLICT (id) DO UPDATE SET
         full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
         phone = COALESCE(EXCLUDED.phone, profiles.phone),
         updated_at = now()`,
      [fullName, phone, userId]
    ).catch(() => {});
  }
  const user = await getUserById(userId);
  return { user, error: null };
}

// ---------------------------------------------------------------------------
// Password recovery
// ---------------------------------------------------------------------------

/** Same rule the signup page enforces. */
export const MIN_PASSWORD_LENGTH = 8;
/** How long an emailed reset link stays valid. */
export const RECOVERY_TTL_MINUTES = 60;

function hashRecoveryToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Start a password reset. Returns the raw token (to email) only when the
 * account exists; only the SHA-256 hash is stored. Asking again replaces the
 * previous link.
 */
export async function createRecoveryToken(
  email: string
): Promise<{ token: string; email: string; firstName: string | null } | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const token = randomBytes(32).toString("hex");
  const { rows } = await query(
    `UPDATE auth.users
     SET recovery_token = $1, recovery_sent_at = now()
     WHERE id = (
       SELECT id FROM auth.users
       WHERE lower(email) = $2 AND deleted_at IS NULL
       ORDER BY created_at
       LIMIT 1
     )
     RETURNING email, raw_user_meta_data`,
    [hashRecoveryToken(token), normalized]
  );
  const row = rows[0];
  if (!row?.email) return null;

  const meta =
    typeof row.raw_user_meta_data === "string"
      ? JSON.parse(row.raw_user_meta_data || "{}")
      : row.raw_user_meta_data || {};
  const firstName =
    typeof meta.first_name === "string" && meta.first_name.trim()
      ? meta.first_name.trim()
      : null;
  return { token, email: row.email, firstName };
}

export type ResetPasswordResult =
  | { ok: true }
  | { ok: false; reason: "weak_password" | "invalid_token" | "expired_token" };

/**
 * Finish a password reset. The token is single-use: it is cleared in the same
 * statement that reads it, so two requests with the same link cannot both win.
 */
export async function resetPasswordWithToken(
  token: string,
  password: string
): Promise<ResetPasswordResult> {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: "weak_password" };
  }
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return { ok: false, reason: "invalid_token" };
  }

  const { rows } = await query<{ id: string; fresh: boolean }>(
    `WITH claimed AS (
       SELECT id, recovery_sent_at
       FROM auth.users
       WHERE recovery_token = $1 AND deleted_at IS NULL
       FOR UPDATE
     )
     UPDATE auth.users u
     SET recovery_token = '', recovery_sent_at = NULL
     FROM claimed c
     WHERE u.id = c.id
     RETURNING u.id,
       COALESCE(c.recovery_sent_at > now() - make_interval(mins => $2::int), false) AS fresh`,
    [hashRecoveryToken(token), RECOVERY_TTL_MINUTES]
  );
  const row = rows[0];
  if (!row) return { ok: false, reason: "invalid_token" };
  if (!row.fresh) return { ok: false, reason: "expired_token" };

  const { error } = await updateUserPassword(row.id, password);
  if (error) return { ok: false, reason: "weak_password" };
  return { ok: true };
}
