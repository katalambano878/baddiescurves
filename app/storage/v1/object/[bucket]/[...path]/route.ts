import { NextRequest, NextResponse } from "next/server";
import { ALLOWED_UPLOAD_TYPES, createStorageClient } from "@/lib/db/storage";
import { isPlainPostgres } from "@/lib/db/mode";
import { resolveRestActor } from "@/lib/db/rest-acl";
import { guardStorageWrite } from "@/lib/db/rest-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** Uploads and deletes are for signed-in admin or staff only. */
async function requireStaff(req: NextRequest): Promise<NextResponse | null> {
  const actor = await resolveRestActor(req);
  if (actor.kind === "admin" || actor.kind === "service") return null;
  return NextResponse.json(
    { error: "Sign in as an admin to manage files", message: "Sign in as an admin to manage files" },
    { status: actor.kind === "anon" ? 401 : 403 }
  );
}

function objectPathFrom(segments: string[]): string | null {
  try {
    return segments.map((s) => decodeURIComponent(s)).join("/");
  } catch {
    return null;
  }
}

/**
 * Supabase Storage upload:
 *   POST /storage/v1/object/{bucket}/{path}
 * The body is either the raw file bytes or multipart form data holding the
 * file (supabase-js sends a File as multipart).
 */
async function postUnguarded(
  req: NextRequest,
  ctx: { params: Promise<{ bucket: string; path: string[] }> }
) {
  if (!isPlainPostgres()) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 503 });
  }
  const denied = await requireStaff(req);
  if (denied) return denied;

  const { bucket, path } = await ctx.params;
  const objectPath = objectPathFrom(path);
  if (!objectPath) return NextResponse.json({ error: "Invalid file path" }, { status: 400 });

  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "That file is too large (15 MB at most)." }, { status: 413 });
  }

  let buf: Buffer;
  let contentType = (req.headers.get("content-type") || "application/octet-stream").split(";")[0].trim().toLowerCase();

  try {
    if (contentType === "multipart/form-data") {
      const form = await req.formData();
      let file: File | null = null;
      for (const value of form.values()) {
        if (typeof value !== "string") {
          file = value as File;
          break;
        }
      }
      if (!file) return NextResponse.json({ error: "No file in the upload" }, { status: 400 });
      buf = Buffer.from(await file.arrayBuffer());
      contentType = (file.type || "application/octet-stream").toLowerCase();
    } else {
      buf = Buffer.from(await req.arrayBuffer());
    }
  } catch {
    return NextResponse.json({ error: "The upload could not be read" }, { status: 400 });
  }

  if (buf.length === 0) return NextResponse.json({ error: "The file is empty" }, { status: 400 });
  if (buf.length > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "That file is too large (15 MB at most)." }, { status: 413 });
  }
  if (!ALLOWED_UPLOAD_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: "Only JPG, PNG, WebP, GIF or AVIF images can be uploaded." },
      { status: 415 }
    );
  }

  const storage = createStorageClient();
  const { data, error } = await storage.from(bucket).upload(objectPath, buf, {
    contentType,
    upsert: (req.headers.get("x-upsert") || "").toLowerCase() === "true",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data: pub } = storage.from(bucket).getPublicUrl(objectPath);
  return NextResponse.json({
    Key: `${bucket}/${objectPath}`,
    Id: data?.path,
    ...data,
    publicUrl: pub.publicUrl,
  });
}

async function deleteUnguarded(
  req: NextRequest,
  ctx: { params: Promise<{ bucket: string; path: string[] }> }
) {
  if (!isPlainPostgres()) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 503 });
  }
  const denied = await requireStaff(req);
  if (denied) return denied;

  const { bucket, path } = await ctx.params;
  const objectPath = objectPathFrom(path);
  if (!objectPath) return NextResponse.json({ error: "Invalid file path" }, { status: 400 });

  const storage = createStorageClient();
  const { error } = await storage.from(bucket).remove([objectPath]);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({});
}

export const POST = guardStorageWrite(postUnguarded);
export const DELETE = guardStorageWrite(deleteUnguarded);
