import { ALLOWED_UPLOAD_TYPES, readObject } from "@/lib/db/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ bucket: string; path: string[] }> }
): Promise<Response> {
  const { bucket, path } = await ctx.params;
  let objectPath: string;
  try {
    objectPath = path.map((s) => decodeURIComponent(s)).join("/");
  } catch {
    return new Response(JSON.stringify({ error: "Invalid file path" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const obj = await readObject(bucket, objectPath);
  if (!obj) {
    return new Response(JSON.stringify({ error: "Object not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Only known image types are shown in the browser. Anything else (an old
  // upload with another type) is sent as a download, never rendered as a page.
  const isImage = ALLOWED_UPLOAD_TYPES.has(obj.contentType.split(";")[0].trim().toLowerCase());
  const headers: Record<string, string> = {
    "Content-Type": isImage ? obj.contentType : "application/octet-stream",
    "Cache-Control": "public, max-age=86400, immutable",
    "Access-Control-Allow-Origin": "*",
    "X-Content-Type-Options": "nosniff",
  };
  if (!isImage) headers["Content-Disposition"] = "attachment";

  return new Response(new Uint8Array(obj.bytes), { status: 200, headers });
}
