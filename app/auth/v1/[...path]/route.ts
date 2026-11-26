import { NextRequest, NextResponse, after } from "next/server";
import {
  signInWithPassword,
  signUpWithPassword,
  refreshSession,
  verifyAccessToken,
  getUserById,
  updateUserPassword,
  updateUserMetadata,
  createRecoveryToken,
  resetPasswordWithToken,
  MIN_PASSWORD_LENGTH,
} from "@/lib/db/auth";
import { isPlainPostgres } from "@/lib/db/mode";
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";
import { sendPasswordResetEmail, siteOrigin } from "@/lib/password-reset-email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cors(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  };
}

function gotrueError(message: string, status = 400, code = "invalid_request") {
  return NextResponse.json(
    { error: code, error_description: message, msg: message, message },
    { status, headers: cors() }
  );
}

// Password reset limits (in-memory, per server process).
const RECOVER_EMAIL_LIMIT = { maxRequests: 3, windowSeconds: 15 * 60 };
const RECOVER_IP_LIMIT = { maxRequests: 10, windowSeconds: 15 * 60 };
const RESET_IP_LIMIT = { maxRequests: 10, windowSeconds: 15 * 60 };

function tooManyRequests(message: string, retryAfterSeconds: number) {
  const headers = new Headers(cors());
  headers.set("Retry-After", String(Math.max(1, retryAfterSeconds)));
  return NextResponse.json(
    { error: "over_request_rate_limit", error_description: message, msg: message, message },
    { status: 429, headers }
  );
}

function sessionResponse(session: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: string;
  user: unknown;
}) {
  return NextResponse.json(
    {
      access_token: session.access_token,
      token_type: session.token_type,
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      refresh_token: session.refresh_token,
      user: session.user,
    },
    { status: 200, headers: cors() }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors() });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  if (!isPlainPostgres()) return gotrueError("DATABASE_URL not set", 503);

  const { path } = await ctx.params;
  const slug = path.join("/");

  if (slug === "user") {
    const auth = req.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (!token) return gotrueError("No authorization header", 401, "no_authorization");
    const verified = await verifyAccessToken(token);
    if (!verified) return gotrueError("Invalid JWT", 401, "invalid_token");
    const user = await getUserById(verified.userId);
    if (!user) return gotrueError("User not found", 401, "user_not_found");
    return NextResponse.json(user, { headers: cors() });
  }

  if (slug === "settings" || slug === "health") {
    return NextResponse.json({ external: {}, disable_signup: false }, { headers: cors() });
  }

  return gotrueError(`Unknown auth path: ${slug}`, 404);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  if (!isPlainPostgres()) return gotrueError("DATABASE_URL not set", 503);

  const { path } = await ctx.params;
  const slug = path.join("/");
  const url = req.nextUrl;
  const contentType = req.headers.get("content-type") || "";

  let body: Record<string, any> = {};
  if (contentType.includes("application/json")) {
    body = (await req.json().catch(() => ({}))) as Record<string, any>;
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    body = Object.fromEntries(new URLSearchParams(text));
  }

  // /auth/v1/token?grant_type=password|refresh_token
  if (slug === "token") {
    const grant =
      url.searchParams.get("grant_type") ||
      body.grant_type ||
      "password";

    if (grant === "password") {
      const email = String(body.email || "");
      const password = String(body.password || "");
      const { session, error } = await signInWithPassword(email, password);
      if (error || !session) {
        return gotrueError(error || "Invalid login credentials", 400, "invalid_grant");
      }
      return sessionResponse(session);
    }

    if (grant === "refresh_token") {
      const refresh = String(body.refresh_token || "");
      const { session, error } = await refreshSession(refresh);
      if (error || !session) {
        return gotrueError(error || "Invalid refresh token", 400, "invalid_grant");
      }
      return sessionResponse(session);
    }

    return gotrueError(`Unsupported grant_type: ${grant}`);
  }

  if (slug === "signup") {
    const { session, error } = await signUpWithPassword({
      email: String(body.email || ""),
      password: String(body.password || ""),
      data: body.data || body.user_metadata || {},
    });
    if (error || !session) {
      return gotrueError(error || "Signup failed", 400);
    }
    return sessionResponse(session);
  }

  if (slug === "logout") {
    // 204 must not carry a body: NextResponse.json(..., { status: 204 }) throws
    // on Node and turned every sign-out into a 500.
    return new NextResponse(null, { status: 204, headers: cors() });
  }

  if (slug === "recover") {
    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return gotrueError("Enter a valid email address.", 400, "validation_failed");
    }

    const ip = getClientIdentifier(req);
    const ipLimit = checkRateLimit(`recover:ip:${ip}`, RECOVER_IP_LIMIT);
    const emailLimit = checkRateLimit(`recover:email:${email}`, RECOVER_EMAIL_LIMIT);
    if (!ipLimit.success || !emailLimit.success) {
      const waitSeconds = Math.max(
        ipLimit.success ? 0 : ipLimit.resetIn,
        emailLimit.success ? 0 : emailLimit.resetIn
      );
      return tooManyRequests(
        `Too many reset requests. Try again in ${Math.max(1, Math.ceil(waitSeconds / 60))} minutes.`,
        waitSeconds
      );
    }

    // Same answer whether or not the account exists. The email goes out after
    // the response so timing does not give the answer away either.
    try {
      const recovery = await createRecoveryToken(email);
      if (recovery) {
        const origin = siteOrigin(req);
        after(async () => {
          const sent = await sendPasswordResetEmail({
            to: recovery.email,
            firstName: recovery.firstName,
            token: recovery.token,
            origin,
          }).catch(() => false);
          if (!sent) console.error("[auth] Password reset email was not sent");
        });
      }
    } catch (err: any) {
      console.error("[auth] recover failed:", err?.message || err);
    }
    return NextResponse.json({}, { status: 200, headers: cors() });
  }

  // Not part of GoTrue: finishes a reset started by /recover.
  if (slug === "reset-password") {
    const ip = getClientIdentifier(req);
    const limit = checkRateLimit(`reset-password:ip:${ip}`, RESET_IP_LIMIT);
    if (!limit.success) {
      return tooManyRequests(
        `Too many attempts. Try again in ${Math.max(1, Math.ceil(limit.resetIn / 60))} minutes.`,
        limit.resetIn
      );
    }

    const token = String(body.token || "").trim();
    const password = String(body.password || "");
    let result;
    try {
      result = await resetPasswordWithToken(token, password);
    } catch (err: any) {
      console.error("[auth] reset-password failed:", err?.message || err);
      return gotrueError("We could not save your new password. Please try again.", 500, "server_error");
    }

    if (!result.ok) {
      if (result.reason === "weak_password") {
        return gotrueError(
          `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
          400,
          "weak_password"
        );
      }
      if (result.reason === "expired_token") {
        return gotrueError(
          "This reset link has expired. Request a new one.",
          400,
          "expired_token"
        );
      }
      return gotrueError(
        "This reset link is not valid or has already been used. Request a new one.",
        400,
        "invalid_token"
      );
    }
    return NextResponse.json({ ok: true }, { status: 200, headers: cors() });
  }

  return gotrueError(`Unknown auth path: ${slug}`, 404);
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  if (!isPlainPostgres()) return gotrueError("DATABASE_URL not set", 503);

  const { path } = await ctx.params;
  const slug = path.join("/");

  if (slug !== "user") {
    return gotrueError(`Unknown auth path: ${slug}`, 404);
  }

  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return gotrueError("No authorization header", 401, "no_authorization");
  const verified = await verifyAccessToken(token);
  if (!verified) return gotrueError("Invalid JWT", 401, "invalid_token");

  const body = (await req.json().catch(() => ({}))) as Record<string, any>;

  if (body.password) {
    const { user, error } = await updateUserPassword(verified.userId, String(body.password));
    if (error || !user) return gotrueError(error || "Update failed");
    return NextResponse.json(user, { headers: cors() });
  }

  if (body.data || body.user_metadata) {
    const { user, error } = await updateUserMetadata(
      verified.userId,
      body.data || body.user_metadata
    );
    if (error || !user) return gotrueError(error || "Update failed");
    return NextResponse.json(user, { headers: cors() });
  }

  const user = await getUserById(verified.userId);
  return NextResponse.json(user, { headers: cors() });
}
